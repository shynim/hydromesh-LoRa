import { useCallback, useEffect, useRef, useState } from 'react';
import type { LevelPoint, LogEntry, LogKind, NodeTelemetry, WsMessage } from './types';
import { computeLinks, DANGER_LEVEL_CM, WARN_LEVEL_CM } from './mesh';
import { initSimState, tickSimulation } from './simulation';

export type { LogEntry };

export interface TelemetryState {
  nodes: NodeTelemetry[];
  links: ReturnType<typeof computeLinks>;
  levelHistory: LevelPoint[];
  logs: LogEntry[];
  connected: boolean;
  source: 'ws' | 'sim';
}

const MAX_LOGS = 120;
const MAX_HISTORY = 90;
const TICK_MS = 2200;

function fmtRaw(n: NodeTelemetry): string {
  const lvl = n.water_level_cm != null ? ` LVL=${n.water_level_cm.toFixed(1)}cm` : '';
  const chg = n.is_charging ? ' CHG' : '';
  return `<PKT ${n.node_id} parent=${n.parent_node_id ?? '-'} bat=${n.battery_percent.toFixed(0)}% rssi=${n.rssi}dBm${lvl}${chg} ${n.is_active ? 'UP' : 'DOWN'}>`;
}

export function useTelemetry(): TelemetryState {
  const [state, setState] = useState<TelemetryState>(() => {
    const sim = initSimState();
    const nodes = Object.values(sim.nodes);
    return {
      nodes,
      links: computeLinks(nodes),
      levelHistory: [],
      logs: [],
      connected: false,
      source: 'sim',
    };
  });

  const simRef = useRef(initSimState());
  const logIdRef = useRef(0);
  const wsRef = useRef<WebSocket | null>(null);
  const wsAttemptedRef = useRef(false);

  const pushLog = useCallback((entries: { raw: string; kind: LogKind }[]) => {
    setState((s) => {
      const next = entries.map((e) => ({
        id: ++logIdRef.current,
        ts: Date.now(),
        raw: e.raw,
        kind: e.kind,
      }));
      const logs = [...next.reverse(), ...s.logs].slice(0, MAX_LOGS);
      return { ...s, logs };
    });
  }, []);

  const applyTelemetry = useCallback(
    (incoming: NodeTelemetry[], via: 'ws' | 'sim') => {
      setState((s) => {
        const byId = new Map(s.nodes.map((n) => [n.node_id, n]));
        const newLogs: { raw: string; kind: LogEntry['kind'] }[] = [];
        let newHistory = s.levelHistory;

        for (const n of incoming) {
          const prev = byId.get(n.node_id);
          const changed = !prev || prev.is_active !== n.is_active;
          byId.set(n.node_id, n);

          if (n.kind === 'sensor' && n.water_level_cm != null) {
            const pt: LevelPoint = {
              t: n.last_seen,
              label: new Date(n.last_seen).toLocaleTimeString('en-GB', {
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
              }),
              level: n.water_level_cm,
            };
            newHistory = [...newHistory, pt].slice(-MAX_HISTORY);
          }

          if (!prev) {
            newLogs.push({ raw: `[BOOT] ${n.node_id} joined mesh`, kind: 'sys' });
          }
          if (changed) {
            newLogs.push({
              raw: n.is_active
                ? `[RECOVERY] ${n.node_id} back online`
                : `[FAULT] ${n.node_id} DEAD — rerouting mesh`,
              kind: n.is_active ? 'sys' : 'alert',
            });
          }
          if (n.kind === 'sensor' && n.water_level_cm != null) {
            if (n.water_level_cm >= DANGER_LEVEL_CM) {
              newLogs.push({
                raw: `[FLOOD] ${n.node_id} CRITICAL ${n.water_level_cm.toFixed(0)}cm >= ${DANGER_LEVEL_CM}cm`,
                kind: 'alert',
              });
            } else if (n.water_level_cm >= WARN_LEVEL_CM) {
              newLogs.push({
                raw: `[WARN] ${n.node_id} rising ${n.water_level_cm.toFixed(0)}cm`,
                kind: 'alert',
              });
            }
          }
          newLogs.push({ raw: `RX ${fmtRaw(n)}`, kind: n.kind === 'gateway' ? 'tx' : 'rx' });
        }

        const nodes = Array.from(byId.values());
        const links = computeLinks(nodes);
        const logs = newLogs.length
          ? [...newLogs.map((e) => ({ id: ++logIdRef.current, ts: Date.now(), ...e })).reverse(), ...s.logs].slice(0, MAX_LOGS)
          : s.logs;

        return { ...s, nodes, links, levelHistory: newHistory, logs, source: via, connected: via === 'ws' };
      });
    },
    [],
  );

  // Attempt to connect to the backend WebSocket. If it isn't running, fall
  // back to the in-browser simulator so the dashboard is always live.
  useEffect(() => {
    let cancelled = false;
    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const url = `${proto}//${window.location.hostname}:4000`;

    const startSim = () => {
      if (cancelled) return;
      // seed initial logs
      pushLog([{ raw: '[SYS] Backend offline — engaging built-in telemetry simulator', kind: 'sys' }]);
      const interval = window.setInterval(() => {
        const nodes = tickSimulation(simRef.current);
        applyTelemetry(nodes, 'sim');
      }, TICK_MS);
      wsRef.current = null;
      return () => window.clearInterval(interval);
    };

    const tryWs = () => {
      if (wsAttemptedRef.current) return;
      wsAttemptedRef.current = true;
      let ws: WebSocket;
      try {
        ws = new WebSocket(url);
      } catch {
        startSim();
        return;
      }
      const timer = window.setTimeout(() => {
        if (ws.readyState !== WebSocket.OPEN) {
          ws.close();
        }
      }, 2500);

      ws.onopen = () => {
        window.clearTimeout(timer);
        if (cancelled) {
          ws.close();
          return;
        }
        pushLog([{ raw: '[SYS] Connected to ESP32 gateway stream (ws://:4000)', kind: 'sys' }]);
      };
      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data) as WsMessage;
          if (msg.type === 'telemetry') applyTelemetry([msg.payload], 'ws');
          else if (msg.type === 'snapshot') applyTelemetry(msg.payload, 'ws');
        } catch {
          /* ignore malformed frames */
        }
      };
      ws.onerror = () => {
        window.clearTimeout(timer);
        try {
          ws.close();
        } catch {
          /* noop */
        }
      };
      ws.onclose = () => {
        window.clearTimeout(timer);
        if (cancelled) return;
        startSim();
      };
      wsRef.current = ws;
    };

    const cleanup = tryWs() as (() => void) | undefined;
    if (!cleanup) {
      // tryWs either connected or set up onclose -> startSim fallback
    }

    return () => {
      cancelled = true;
      wsAttemptedRef.current = false; // <-- ADD THIS LINE
      cleanup?.();
      try {
        wsRef.current?.close();
      } catch {
        /* noop */
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return state;
}
