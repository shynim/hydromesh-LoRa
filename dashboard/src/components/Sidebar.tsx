import { memo } from 'react';
import { Activity, AlertTriangle, BatteryWarning, Radio, Signal, Zap } from 'lucide-react';
import type { LogEntry, NodeTelemetry } from '@/types';
import { DANGER_LEVEL_CM, WARN_LEVEL_CM } from '@/mesh';
import { TerminalLog } from './TerminalLog';

interface SidebarProps {
  nodes: NodeTelemetry[];
  logs: LogEntry[];
  connected: boolean;
  source: 'ws' | 'sim';
}

function StatCard({
  label,
  value,
  icon,
  tone,
}: {
  label: string;
  value: number | string;
  icon: React.ReactNode;
  tone: 'ok' | 'danger' | 'alert' | 'neutral';
}) {
  const toneClasses: Record<string, string> = {
    ok: 'text-ok-400',
    danger: 'text-danger-400',
    alert: 'text-alert-400',
    neutral: 'text-ash-100',
  };
  return (
    <div className="rounded-md border border-ash-600/60 bg-ash-800/70 px-3 py-2">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-medium uppercase tracking-wider text-ash-200">{label}</span>
        <span className={toneClasses[tone]}>{icon}</span>
      </div>
      {/* CHANGED: text-3xl to text-2xl, font-bold to font-medium, added opacity-90 to tone down the color */}
      <div className={`mt-1 font-sans tracking-tight text-2xl font-medium leading-none tabular-nums opacity-90 ${toneClasses[tone]}`}>
        {value}
      </div>
    </div>
  );
}

function SidebarInner({ nodes, logs, connected, source }: SidebarProps) {
  const total = nodes.length;
  const active = nodes.filter((n) => n.is_active).length;
  const dead = nodes.filter((n) => !n.is_active).length;
  const critical = nodes.filter((n) => n.is_active && n.battery_percent < 20 && !n.is_charging).length;
  const alerts = nodes.filter(
    (n) => n.water_level_cm != null && n.water_level_cm >= DANGER_LEVEL_CM,
  ).length;
  const warnings = nodes.filter(
    (n) => n.water_level_cm != null && n.water_level_cm >= WARN_LEVEL_CM && n.water_level_cm < DANGER_LEVEL_CM,
  ).length;

  const sensor = nodes.find((n) => n.kind === 'sensor' && n.water_level_cm != null);
  const level = sensor?.water_level_cm ?? 0;
  const levelTone = level >= DANGER_LEVEL_CM ? 'text-danger-400' : level >= WARN_LEVEL_CM ? 'text-alert-400' : 'text-ok-400';

  return (
    <div className="flex h-full flex-col gap-2 overflow-hidden p-2">
      {/* Brand / status */}
      <div className="flex items-center rounded-md border border-ash-600/60 bg-ash-800/70 px-3 py-2.5">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-ash-700/80 ring-1 ring-ash-500/40 shadow-sm">
            <Radio className="h-4 w-4 text-ash-100" />
          </div>
          <div className="text-lg font-bold tracking-tight text-white">
            HydroMesh
          </div>
        </div>
      </div>

      {/* Network health stats — compact grid */}
      <div className="grid grid-cols-2 gap-2">
        <StatCard label="Nodes" value={total} icon={<Signal className="h-3.5 w-3.5" />} tone="neutral" />
        <StatCard label="Active" value={active} icon={<Activity className="h-3.5 w-3.5" />} tone="ok" />
        <StatCard label="Critical" value={critical} icon={<BatteryWarning className="h-3.5 w-3.5" />} tone="alert" />
        <StatCard label="Dead" value={dead} icon={<AlertTriangle className="h-3.5 w-3.5" />} tone="danger" />
      </div>

      {/* Active alerts — full-width matching StatCard style */}
      <div className="rounded-md border border-ash-600/60 bg-ash-800/70 px-3 py-2">
        {/* Top Row: Label and Icon */}
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-medium uppercase tracking-wider text-ash-200">Alerts</span>
          <AlertTriangle className={`h-3.5 w-3.5 ${alerts > 0 ? 'text-danger-400 animate-blink' : 'text-ok-400'}`} />
        </div>
        
        {/* Bottom Row: Big Number & Long Descriptions */}
        <div className="mt-1 flex flex-wrap items-baseline gap-3">
          {/* CHANGED: text-3xl to text-2xl, font-bold to font-medium, added opacity-90 to match StatCards */}
          <span className={`font-sans tracking-tight text-2xl font-medium leading-none tabular-nums opacity-90 ${alerts > 0 ? 'text-danger-400' : 'text-ok-400'}`}>
            {alerts}
          </span>
          
          {/* Detailed metrics / long description area */}
          <div className="flex flex-wrap items-center gap-2">
            {warnings > 0 && (
              <span className="font-sans font-medium text-xs tracking-tight text-alert-400 opacity-90">
                +{warnings} warnings
              </span>
            )}
            {sensor && (
              <span className={`flex items-center gap-0.5 font-sans font-medium text-xs tracking-tight opacity-90 ${levelTone}`}>
                <Zap className="h-3 w-3" />
                {level.toFixed(0)}cm
              </span>
            )}
            
            {/* Optional: You can easily add a long description string here if alerts exist */}
            {alerts > 0 && (
               <span className="ml-1 font-sans text-xs font-medium text-danger-400/80">
                 System thresholds exceeded.
               </span>
            )}
          </div>
        </div>
      </div>

      {/* Terminal log — maximised */}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-md border border-ash-600/60 bg-black/60">
        <div className="flex items-center justify-between border-b border-ash-700/60 px-3 py-2">
          <span className="text-[10px] font-medium uppercase tracking-wider text-ash-200">
            Gateway Packet Log
          </span>
          <span className="font-sans text-[10px] font-medium text-ash-400">
            RAW · 433MHz
          </span>
        </div>
        <TerminalLog logs={logs} />
      </div>
    </div>
  );
}

export const Sidebar = memo(SidebarInner);