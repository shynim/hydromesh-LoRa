import { memo, useEffect, useRef } from 'react';
import type { LogEntry } from '@/types';

interface TerminalLogProps {
  logs: LogEntry[];
}

const KIND_COLOR: Record<LogEntry['kind'], string> = {
  rx: 'text-river-300',
  tx: 'text-ok-400',
  alert: 'text-danger-400',
  sys: 'text-ash-300',
};

function timeStr(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleTimeString('en-GB', { hour12: false }) + '.' + String(d.getMilliseconds()).padStart(3, '0').slice(0, 2);
}

function TerminalLogInner({ logs }: TerminalLogProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const prevLen = useRef(logs.length);

  useEffect(() => {
    if (logs.length > prevLen.current && scrollRef.current) {
      scrollRef.current.scrollTop = 0;
    }
    prevLen.current = logs.length;
  }, [logs.length]);

  return (
    <div
      ref={scrollRef}
      className="scroll-thin relative h-full overflow-y-auto px-2 py-1.5 font-mono text-[9.5px] leading-snug"
    >
      {logs.length === 0 ? (
        <div className="flex h-full items-center justify-center text-ash-400">awaiting packets…</div>
      ) : (
        <div className="flex flex-col gap-px">
          {logs.map((log) => (
            <div key={log.id} className="flex animate-slideIn gap-1.5">
              <span className="shrink-0 text-ash-400">{timeStr(log.ts)}</span>
              <span className={`min-w-0 break-words ${KIND_COLOR[log.kind]}`}>{log.raw}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export const TerminalLog = memo(TerminalLogInner);
