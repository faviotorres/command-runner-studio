import { useEffect, useMemo, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import type { LogLine } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { ExternalLink, Square, Trash2 } from 'lucide-react';
import { openPath } from '@/lib/api';
import { toast } from '@/hooks/use-toast';

// Standard ANSI 16-color palette (xterm-ish)
const ANSI_BASIC: Record<number, string> = {
  30: '#000000', 31: '#cd3131', 32: '#0dbc79', 33: '#e5e510',
  34: '#2472c8', 35: '#bc3fbc', 36: '#11a8cd', 37: '#e5e5e5',
  90: '#666666', 91: '#f14c4c', 92: '#23d18b', 93: '#f5f543',
  94: '#3b8eea', 95: '#d670d6', 96: '#29b8db', 97: '#ffffff',
};
const ANSI_BG: Record<number, string> = Object.fromEntries(
  Object.entries(ANSI_BASIC).map(([k, v]) => [Number(k) + 10, v]),
);

function xterm256(n: number): string {
  if (n < 16) return ANSI_BASIC[n < 8 ? 30 + n : 82 + n] || '#ffffff';
  if (n >= 232) {
    const c = (n - 232) * 10 + 8;
    return `rgb(${c},${c},${c})`;
  }
  const i = n - 16;
  const r = Math.floor(i / 36), g = Math.floor((i % 36) / 6), b = i % 6;
  const conv = (v: number) => (v === 0 ? 0 : 55 + v * 40);
  return `rgb(${conv(r)},${conv(g)},${conv(b)})`;
}

type AnsiState = { fg?: string; bg?: string; bold?: boolean; italic?: boolean; underline?: boolean };
type Seg = AnsiState & { text: string };

// Match real ESC[...m sequences AND bare "[...m" (some logs / SSE strip the ESC byte).
// Also strip common non-color CSI sequences (cursor moves, erase) so they don't show as junk.
const ANSI_SGR = /(?:\x1b\[|\[)([0-9;]*)m/g;
const ANSI_NON_SGR = /\x1b\[[0-9;?]*[A-HJKSTfhlmnsu]/g;

function applyCodes(state: AnsiState, raw: string): AnsiState {
  const codes = raw.split(';').filter(Boolean).map(Number);
  if (codes.length === 0) codes.push(0);
  let s = { ...state };
  for (let i = 0; i < codes.length; i++) {
    const c = codes[i];
    if (c === 0) s = {};
    else if (c === 1) s.bold = true;
    else if (c === 3) s.italic = true;
    else if (c === 4) s.underline = true;
    else if (c === 22) s.bold = false;
    else if (c === 23) s.italic = false;
    else if (c === 24) s.underline = false;
    else if (c === 39) s.fg = undefined;
    else if (c === 49) s.bg = undefined;
    else if ((c >= 30 && c <= 37) || (c >= 90 && c <= 97)) s.fg = ANSI_BASIC[c];
    else if ((c >= 40 && c <= 47) || (c >= 100 && c <= 107)) s.bg = ANSI_BG[c <= 47 ? c : c - 60];
    else if (c === 38 && codes[i + 1] === 5) { s.fg = xterm256(codes[i + 2]); i += 2; }
    else if (c === 48 && codes[i + 1] === 5) { s.bg = xterm256(codes[i + 2]); i += 2; }
    else if (c === 38 && codes[i + 1] === 2) { s.fg = `rgb(${codes[i+2]},${codes[i+3]},${codes[i+4]})`; i += 4; }
    else if (c === 48 && codes[i + 1] === 2) { s.bg = `rgb(${codes[i+2]},${codes[i+3]},${codes[i+4]})`; i += 4; }
  }
  return s;
}

function parseAnsi(input: string, initial: AnsiState): { segs: Seg[]; state: AnsiState } {
  // Drop non-SGR CSI sequences (cursor moves etc.) — we don't render them.
  const cleaned = input.replace(ANSI_NON_SGR, (m) => (/[0-9;]*m$/.test(m) ? m : ''));
  const segs: Seg[] = [];
  let state: AnsiState = { ...initial };
  let last = 0;
  let m: RegExpExecArray | null;
  ANSI_SGR.lastIndex = 0;
  while ((m = ANSI_SGR.exec(cleaned)) !== null) {
    const text = cleaned.slice(last, m.index);
    if (text) segs.push({ ...state, text });
    state = applyCodes(state, m[1]);
    last = m.index + m[0].length;
  }
  const tail = cleaned.slice(last);
  if (tail) segs.push({ ...state, text: tail });
  return { segs, state };
}

function AnsiSegs({ segs }: { segs: Seg[] }) {
  return (
    <>
      {segs.map((s, i) => {
        const style: React.CSSProperties = {};
        if (s.fg) style.color = s.fg;
        if (s.bg) style.backgroundColor = s.bg;
        if (s.bold) style.fontWeight = 'bold';
        if (s.italic) style.fontStyle = 'italic';
        if (s.underline) style.textDecoration = 'underline';
        return <span key={i} style={style}>{s.text}</span>;
      })}
    </>
  );
}

type Props = {
  lines: LogLine[];
  running: boolean;
  onClear: () => void;
  onStop?: () => void;
  label?: string;
  startedAt?: number | null;
  endedAt?: number | null;
};

function formatDuration(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => n.toString().padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

export function ConsoleOutput({ lines, running, onClear, onStop, label, startedAt, endedAt }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!running || !startedAt) return;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [running, startedAt]);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [lines]);

  const reportPath = useMemo(() => {
    // Scan from the end for the last "Created report:" occurrence with a non-empty path.
    for (let i = lines.length - 1; i >= 0; i--) {
      const text = lines[i].text;
      const match = text.match(/Created report:[ \t]*(\S.*?)\s*$/m);
      if (match) return match[1].trim();
    }
    return null;
  }, [lines]);

  const resultIcon = useMemo(() => {
    if (running || !endedAt) return null;
    for (let i = lines.length - 1; i >= 0; i--) {
      const t = lines[i].text;
      if (/test\s+passed/i.test(t)) return '✅';
      if (/test\s+failed/i.test(t)) return '❌';
    }
    return null;
  }, [lines, running, endedAt]);

  const handleOpenReport = async () => {
    if (!reportPath) return;
    if (/^https?:\/\//i.test(reportPath)) {
      window.open(reportPath, '_blank', 'noopener,noreferrer');
      return;
    }
    try {
      await openPath(reportPath);
    } catch (e) {
      toast({ title: 'Failed to open report', description: String(e), variant: 'destructive' });
    }
  };

  return (
    <div className="relative flex h-full flex-col overflow-hidden rounded-lg border border-border bg-terminal-bg">
      {resultIcon && (
        <div
          className="pointer-events-none absolute inset-x-0 top-0 h-[2px]"
          style={{
            background: resultIcon === '✅'
              ? 'linear-gradient(90deg, transparent, hsl(142 76% 45%), transparent)'
              : 'linear-gradient(90deg, transparent, hsl(0 84% 60%), transparent)',
            boxShadow: resultIcon === '✅'
              ? '0 0 12px 2px hsl(142 76% 45% / 0.7), 0 0 24px 4px hsl(142 76% 45% / 0.4)'
              : '0 0 12px 2px hsl(0 84% 60% / 0.7), 0 0 24px 4px hsl(0 84% 60% / 0.4)',
          }}
        />
      )}
      <div className="flex items-center justify-between border-b border-border bg-card/60 px-4 py-2">
        <div className="flex items-center gap-2">
          {startedAt ? (
            <span className="font-mono text-xs text-muted-foreground">
              {resultIcon ? `${resultIcon} ` : ''}{running ? 'Running' : 'Finished'}
              {label ? ` ${label}` : ''} — {formatDuration((running ? now : (endedAt ?? now)) - startedAt)}
            </span>
          ) : (
            <span className="font-mono text-xs text-muted-foreground">console</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {reportPath && (
            <Button
              size="sm"
              onClick={handleOpenReport}
              className="h-8 bg-primary font-mono text-primary-foreground hover:bg-primary/90"
            >
              <ExternalLink className="mr-1 h-4 w-4" /> Open Report
            </Button>
          )}
          {onStop ? (
            <Button
              size="sm"
              variant="destructive"
              onClick={onStop}
              className="h-8 font-mono"
            >
              <Square className="mr-1.5 h-3.5 w-3.5 fill-current" /> Stop
            </Button>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              onClick={onClear}
              className="h-8 text-muted-foreground hover:bg-border hover:text-foreground"
            >
              <Trash2 className="mr-1.5 h-3.5 w-3.5" /> Clear
            </Button>
          )}
        </div>
      </div>

      <div
        ref={scrollRef}
        className="relative flex-1 overflow-auto p-4 font-mono text-[13px] leading-relaxed"
      >
        {lines.length === 0 && !running && (
          <div className="text-terminal-dim">
            <span className="text-terminal-prompt">$</span> waiting for a test run…
          </div>
        )}

        {(() => {
          let state: AnsiState = {};
          return lines.map((l) => {
            const { segs, state: next } = parseAnsi(l.text, state);
            state = next;
            return (
              <pre
                key={l.id}
                className={cn(
                  'whitespace-pre-wrap break-words',
                  l.kind === 'stdout' && 'text-terminal-text',
                  l.kind === 'stderr' && 'text-terminal-error',
                  l.kind === 'info' && 'text-terminal-prompt glow-text',
                  l.kind === 'end' && 'text-muted-foreground',
                )}
              >
                <AnsiSegs segs={segs} />
              </pre>
            );
          });
        })()}

        {running && <div className="cursor-blink inline-block h-4" />}
      </div>
    </div>
  );
}
