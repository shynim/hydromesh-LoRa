import type { NodeTelemetry } from './types';
import { SEED_NODES, SeedNode } from './mesh';

/**
 * In-browser telemetry simulator. Produces realistic, slowly-evolving telemetry
 * for the seeded mesh so the dashboard is fully alive even without a live
 * backend. The same engine drives the Node.js `simulate-esp32` script shipped
 * with the backend.
 */

export interface SimState {
  nodes: Record<string, NodeTelemetry>;
  tick: number;
}

export function initSimState(now = Date.now()): SimState {
  const nodes: Record<string, NodeTelemetry> = {};
  for (const s of SEED_NODES) {
    nodes[s.id] = seedToTelemetry(s, now);
  }
  return { nodes, tick: 0 };
}

function seedToTelemetry(s: SeedNode, now: number): NodeTelemetry {
  return {
    node_id: s.id,
    kind: s.kind,
    name: s.name,
    lat: s.lat,
    lng: s.lng,
    parent_node_id: s.parent,
    battery_percent: s.kind === 'gateway' ? 100 : 86,
    is_charging: s.kind === 'gateway',
    is_active: true,
    water_level_cm: s.kind === 'sensor' ? 215 : null,
    rssi: s.kind === 'gateway' ? -40 : -72,
    last_seen: now,
  };
}

const DEAD_EVENTS: { id: string; atTick: number; durTicks: number }[] = [
  { id: 'RT-02', atTick: 28, durTicks: 14 }, // Meadow Relay drops mid-session
  { id: 'RT-03', atTick: 72, durTicks: 10 }, // Canyon Relay drops later
];

function isForcedDead(id: string, tick: number): boolean {
  for (const e of DEAD_EVENTS) {
    if (e.id === id && tick >= e.atTick && tick < e.atTick + e.durTicks) {
      return true;
    }
  }
  return false;
}

/** River level follows a slow tidal rise with noise + occasional surge spikes. */
function nextWaterLevel(prev: number, tick: number): number {
  const rise = Math.sin(tick / 26) * 3.2;
  const drift = 0.25; // gradual upstream rise
  const noise = (Math.random() - 0.5) * 4.5;
  const surge = tick % 60 === 0 && Math.random() > 0.6 ? 18 : 0;
  let v = prev + rise * 0.08 + drift + noise * 0.4 + surge * 0.5;
  if (v < 150) v = 150;
  if (v > 380) v = 380;
  return Math.round(v * 10) / 10;
}

function nextBattery(prev: number, charging: boolean): number {
  if (charging) return Math.min(100, prev + 0.4);
  const drain = 0.08 + Math.random() * 0.12;
  return Math.max(4, Math.round((prev - drain) * 10) / 10);
}

/** Advance the simulation by one tick and return the updated node states. */
export function tickSimulation(state: SimState): NodeTelemetry[] {
  state.tick += 1;
  const now = Date.now();
  const out: NodeTelemetry[] = [];

  for (const s of SEED_NODES) {
    const prev = state.nodes[s.id];
    const forcedDead = isForcedDead(s.id, state.tick);

    const isActive = !forcedDead;
    const isCharging = s.kind === 'gateway' ? true : prev.is_charging && Math.random() > 0.02;
    const battery = isActive ? nextBattery(prev.battery_percent, isCharging) : prev.battery_percent;
    const rssi = isActive
      ? Math.max(-110, Math.min(-35, prev.rssi + Math.round((Math.random() - 0.5) * 6)))
      : -120;

    let water = prev.water_level_cm;
    if (s.kind === 'sensor' && isActive) {
      water = nextWaterLevel(prev.water_level_cm ?? 215, state.tick);
    }

    const node: NodeTelemetry = {
      ...prev,
      battery_percent: battery,
      is_charging: isCharging,
      is_active: isActive,
      rssi,
      water_level_cm: water,
      last_seen: now,
    };
    state.nodes[s.id] = node;
    out.push(node);
  }

  return out;
}

/** Drain battery a touch faster when a node has to relay for a dead neighbour. */
export function recomputeLoad(state: SimState, links: { from_id: string; active: boolean }[]) {
  // lightweight hook for future load modelling; kept intentionally simple.
  void state;
  void links;
}
