import { memo, useEffect, useMemo, useRef, useState } from 'react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Calendar, Clock, History, Radio, TrendingUp } from 'lucide-react';
import type { LevelPoint } from '@/types';
import { DANGER_LEVEL_CM, WARN_LEVEL_CM } from '@/mesh';

interface RiverChartProps {
  live: LevelPoint[];
}

type Mode = 'live' | 'historical';

function generateHistorical(range: 'daily' | 'weekly', days: number): LevelPoint[] {
  const points: LevelPoint[] = [];
  const now = Date.now();
  const count = range === 'daily' ? 96 : 84;
  const stepMs = (days * 24 * 60 * 60 * 1000) / count;
  let level = 210 + Math.random() * 20;
  for (let i = count; i >= 0; i--) {
    const t = now - i * stepMs;
    const wave = Math.sin(i / (range === 'daily' ? 8 : 14)) * 22;
    const surge = i % 24 === 0 ? 35 : 0;
    level = 215 + wave + (Math.random() - 0.5) * 12 + surge * 0.4;
    level = Math.max(150, Math.min(380, level));
    const d = new Date(t);
    const label =
      range === 'daily'
        ? d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
        : d.toLocaleDateString('en-GB', { month: 'short', day: 'numeric' }) +
          ' ' +
          d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
    points.push({ t, label, level: Math.round(level * 10) / 10 });
  }
  return points;
}

function generateCustom(from: Date, to: Date): LevelPoint[] {
  const points: LevelPoint[] = [];
  const span = to.getTime() - from.getTime();
  const count = 120;
  const stepMs = span / count;
  let level = 200 + Math.random() * 30;
  for (let i = 0; i <= count; i++) {
    const t = from.getTime() + i * stepMs;
    const wave = Math.sin(i / 12) * 28 + Math.sin(i / 40) * 14;
    level = 215 + wave + (Math.random() - 0.5) * 10;
    level = Math.max(150, Math.min(380, level));
    const d = new Date(t);
    const label = d.toLocaleDateString('en-GB', { month: 'short', day: 'numeric' });
    points.push({ t, label, level: Math.round(level * 10) / 10 });
  }
  return points;
}

function CustomTooltip({ active, payload, unit }: { active?: boolean; payload?: { value: number; payload: LevelPoint }[]; unit: string }) {
  if (!active || !payload || !payload.length) return null;
  const p = payload[0].payload;
  return (
    <div className="rounded-md border border-ash-600 bg-ash-900/95 px-3 py-2 shadow-panel backdrop-blur">
      {/* Changed to font-sans for the time label */}
      <div className="font-sans font-medium text-[10px] text-ash-300">{p.label}</div>
      
      {/* Changed to font-sans, made it bold, and tightened tracking for the value */}
      <div className="mt-0.5 flex items-center gap-1.5 font-sans font-bold tracking-tight text-sm text-river-300 tabular-nums">
        <span className="h-2 w-2 rounded-full bg-river-400" />
        {p.level.toFixed(1)} {unit}
      </div>
    </div>
  );
}

function RiverChartInner({ live }: RiverChartProps) {
  const [mode, setMode] = useState<Mode>('live');
  const [range, setRange] = useState<'daily' | 'weekly' | 'custom'>('daily');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [customData, setCustomData] = useState<LevelPoint[] | null>(null);
  const chartWrapRef = useRef<HTMLDivElement>(null);
  const [chartH, setChartH] = useState(180);

  useEffect(() => {
    const el = chartWrapRef.current;
    if (!el || typeof window === 'undefined') return;
    const ro = new ResizeObserver((entries) => {
      const r = entries[0].contentRect;
      setChartH(Math.max(60, Math.round(r.height)));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const historical = useMemo(() => {
    if (mode !== 'historical') return [];
    if (range === 'custom') return customData ?? [];
    return generateHistorical(range, range === 'daily' ? 1 : 7);
  }, [mode, range, customData]);

  const data = mode === 'live' ? live : historical;
  const unit = 'cm';

  const stats = useMemo(() => {
    if (!data.length) return { min: 0, max: 0, avg: 0, cur: 0 };
    const levels = data.map((d) => d.level);
    return {
      min: Math.min(...levels),
      max: Math.max(...levels),
      avg: levels.reduce((a, b) => a + b, 0) / levels.length,
      cur: levels[levels.length - 1],
    };
  }, [data]);

  const applyCustom = () => {
    if (!customFrom || !customTo) return;
    const f = new Date(customFrom);
    const t = new Date(customTo);
    if (isNaN(f.getTime()) || isNaN(t.getTime()) || f >= t) return;
    setCustomData(generateCustom(f, t));
    setRange('custom');
  };

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Control bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-ash-700/60 bg-ash-850/60 px-3 py-1.5">
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 text-white">
            <TrendingUp className="h-4 w-4 text-river-400" />
            <span className="text-sm font-semibold">River Water Level</span>
          </div>
          <div className="flex items-center gap-1 rounded-md border border-ash-600/60 bg-ash-900/60 p-0.5">
            <ModeBtn active={mode === 'live'} onClick={() => setMode('live')} icon={<Radio className="h-3.5 w-3.5" />}>
              Live
            </ModeBtn>
            <ModeBtn active={mode === 'historical'} onClick={() => setMode('historical')} icon={<History className="h-3.5 w-3.5" />}>
              History
            </ModeBtn>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {mode === 'live' ? (
            <span className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wider text-ok-400 opacity-90">
              <span className="h-1.5 w-1.5 animate-blink rounded-full bg-ok-500" />
              streaming
            </span>
          ) : (
            <div className="flex items-center gap-1.5">
              <RangeBtn active={range === 'daily'} onClick={() => setRange('daily')} icon={<Clock className="h-3 w-3" />}>
                24H
              </RangeBtn>
              <RangeBtn active={range === 'weekly'} onClick={() => setRange('weekly')} icon={<Calendar className="h-3 w-3" />}>
                7D
              </RangeBtn>
              <div className="flex items-center gap-1 rounded-md border border-ash-600/60 bg-ash-900/60 px-1.5 py-0.5">
                <input
                  type="datetime-local"
                  value={customFrom}
                  onChange={(e) => setCustomFrom(e.target.value)}
                  className="bg-transparent text-[10px] text-ash-100 outline-none [color-scheme:dark]"
                  aria-label="Custom range start"
                />
                <span className="text-ash-400">→</span>
                <input
                  type="datetime-local"
                  value={customTo}
                  onChange={(e) => setCustomTo(e.target.value)}
                  className="bg-transparent text-[10px] text-ash-100 outline-none [color-scheme:dark]"
                  aria-label="Custom range end"
                />
                <button
                  onClick={applyCustom}
                  className="rounded bg-river-600/80 px-1.5 py-0.5 text-[10px] font-medium text-white hover:bg-river-500"
                >
                  Apply
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Stat strip */}
      <div className="flex items-center gap-4 border-b border-ash-700/50 bg-ash-900/40 px-3 py-1">
        <StatChip label="Current" value={`${stats.cur.toFixed(1)} ${unit}`} tone={stats.cur >= DANGER_LEVEL_CM ? 'danger' : stats.cur >= WARN_LEVEL_CM ? 'alert' : 'ok'} />
        <StatChip label="Min" value={`${stats.min.toFixed(0)} ${unit}`} tone="neutral" />
        <StatChip label="Avg" value={`${stats.avg.toFixed(0)} ${unit}`} tone="neutral" />
        <StatChip label="Max" value={`${stats.max.toFixed(0)} ${unit}`} tone="alert" />
        <div className="ml-auto flex items-center gap-3 text-[10px]">
          <span className="flex items-center gap-1 text-alert-400">
            <span className="h-0.5 w-3 bg-alert-400" /> Warn {WARN_LEVEL_CM}
          </span>
          <span className="flex items-center gap-1 text-danger-400">
            <span className="h-0.5 w-3 bg-danger-400" /> Danger {DANGER_LEVEL_CM}
          </span>
        </div>
      </div>

      {/* Chart */}
      <div ref={chartWrapRef} className="relative min-h-0 flex-1">
        {data.length === 0 ? (
          <div className="flex h-full items-center justify-center text-sm text-ash-400">
            {mode === 'historical' && range === 'custom' && !customData
              ? 'Select a custom date range and click Apply'
              : 'Awaiting telemetry…'}
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={chartH}>
            {mode === 'live' ? (
              <AreaChart data={data} margin={{ top: 8, right: 16, bottom: 4, left: 0 }}>
                <defs>
                  <linearGradient id="riverFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#2f9eff" stopOpacity={0.55} />
                    <stop offset="70%" stopColor="#1680f5" stopOpacity={0.18} />
                    <stop offset="100%" stopColor="#000000" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 6" stroke="#262626" vertical={false} />
                <XAxis
                  dataKey="label"
                  tick={{ fill: '#737373', fontSize: 10}}
                  tickLine={false}
                  axisLine={{ stroke: '#262626' }}
                  minTickGap={48}
                />
                <YAxis
                  domain={[120, 400]}
                  tick={{ fill: '#737373', fontSize: 10}}
                  tickLine={false}
                  axisLine={false}
                  width={36}
                  tickFormatter={(v) => `${v}`}
                />
                <Tooltip content={<CustomTooltip unit={unit} />} />
                <ReferenceLine y={WARN_LEVEL_CM} stroke="#f59e0b" strokeDasharray="4 4" strokeOpacity={0.6} />
                <ReferenceLine y={DANGER_LEVEL_CM} stroke="#ef4444" strokeDasharray="4 4" strokeOpacity={0.6} />
                <Area
                  type="monotone"
                  dataKey="level"
                  stroke="#59bcff"
                  strokeWidth={2}
                  fill="url(#riverFill)"
                  isAnimationActive
                  animationDuration={600}
                  dot={false}
                  activeDot={{ r: 4, fill: '#59bcff', stroke: '#000000', strokeWidth: 2 }}
                />
              </AreaChart>
            ) : (
              <LineChart data={data} margin={{ top: 8, right: 16, bottom: 4, left: 0 }}>
                <CartesianGrid strokeDasharray="3 6" stroke="#262626" vertical={false} />
                <XAxis
                  dataKey="label"
                  tick={{ fill: '#737373', fontSize: 10}}
                  tickLine={false}
                  axisLine={{ stroke: '#262626' }}
                  minTickGap={48}
                />
                <YAxis
                  domain={[120, 400]}
                  tick={{ fill: '#737373', fontSize: 10 }}
                  tickLine={false}
                  axisLine={false}
                  width={36}
                />
                <Tooltip content={<CustomTooltip unit={unit} />} />
                <ReferenceLine y={WARN_LEVEL_CM} stroke="#f59e0b" strokeDasharray="4 4" strokeOpacity={0.6} />
                <ReferenceLine y={DANGER_LEVEL_CM} stroke="#ef4444" strokeDasharray="4 4" strokeOpacity={0.6} />
                <Line
                  type="monotone"
                  dataKey="level"
                  stroke="#2f9eff"
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4, fill: '#2f9eff', stroke: '#000000', strokeWidth: 2 }}
                  isAnimationActive
                  animationDuration={500}
                />
              </LineChart>
            )}
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}

function ModeBtn({
  active,
  onClick,
  icon,
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-medium transition ${
        active ? 'bg-river-600/30 text-river-200 ring-1 ring-river-500/40' : 'text-ash-200 hover:text-white'
      }`}
    >
      {icon}
      {children}
    </button>
  );
}

function RangeBtn({
  active,
  onClick,
  icon,
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium transition ${
        active ? 'bg-river-600/30 text-river-200 ring-1 ring-river-500/40' : 'text-ash-200 hover:bg-ash-800 hover:text-white'
      }`}
    >
      {icon}
      {children}
    </button>
  );
}

function StatChip({ label, value, tone }: { label: string; value: string; tone: 'ok' | 'alert' | 'danger' | 'neutral' }) {
  const tones: Record<string, string> = {
    ok: 'text-ok-400',
    alert: 'text-alert-400',
    danger: 'text-danger-400',
    neutral: 'text-ash-100', 
  };
  
  return (
    <div className="flex items-baseline gap-1.5">
      {/* FIXED: Restored text-ash-200 so the label isn't too low-opacity */}
      <span className="text-[10px] font-medium uppercase tracking-wider text-ash-200">
        {label}
      </span>
      {/* FIXED: Kept text-sm so the numbers stay small and neat */}
      <span className={`font-sans text-sm font-medium tracking-tight tabular-nums opacity-90 ${tones[tone]}`}>
        {value}
      </span>
    </div>
  );
}

export const RiverChart = memo(RiverChartInner);
