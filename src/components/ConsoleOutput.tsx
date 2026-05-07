import { useEffect, useMemo, useRef } from 'react';
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

type Seg = { text: string; fg?: string; bg?: string; bold?: boolean; italic?: boolean; underline?: boolean };

function parseAnsi(input: string): Seg[] {
  // Match ESC[...m sequences (also tolerate bare "[...m" since user-shown logs sometimes drop ESC)
  const regex = /\x1b\[([0-9;]*)m/g;
  const segs: Seg[] = [];
  let cur: Seg = { text: '' };
  let last = 0;
  let m: RegExpExecArray | null;
  const push = () => { if (cur.text) segs.push({ ...cur }); cur.text = ''; };
  while ((m = regex.exec(input)) !== null) {
    cur.text += input.slice(last, m.index);
    push();
    const codes = m[1].split(';').filter(Boolean).map(Number);
    if (codes.length === 0) codes.push(0);
    for (let i = 0; i < codes.length; i++) {
      const c = codes[i];
      if (c === 0) { cur = { text: '' }; }
      else if (c === 1) cur.bold = true;
      else if (c === 3) cur.italic = true;
      else if (c === 4) cur.underline = true;
      else if (c === 22) cur.bold = false;
      else if (c === 23) cur.italic = false;
      else if (c === 24) cur.underline = false;
      else if (c === 39) cur.fg = undefined;
      else if (c === 49) cur.bg = undefined;
      else if ((c >= 30 && c <= 37) || (c >= 90 && c <= 97)) cur.fg = ANSI_BASIC[c];
      else if ((c >= 40 && c <= 47) || (c >= 100 && c <= 107)) cur.bg = ANSI_BG[c <= 47 ? c : c - 60];
      else if (c === 38 && codes[i + 1] === 5) { cur.fg = xterm256(codes[i + 2]); i += 2; }
      else if (c === 48 && codes[i + 1] === 5) { cur.bg = xterm256(codes[i + 2]); i += 2; }
      else if (c === 38 && codes[i + 1] === 2) { cur.fg = `rgb(${codes[i+2]},${codes[i+3]},${codes[i+4]})`; i += 4; }
      else if (c === 48 && codes[i + 1] === 2) { cur.bg = `rgb(${codes[i+2]},${codes[i+3]},${codes[i+4]})`; i += 4; }
    }
    last = m.index + m[0].length;
  }
  cur.text += input.slice(last);
  push();
  return segs;
}

function AnsiText({ text }: { text: string }) {
  const segs = parseAnsi(text);
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
};

export function ConsoleOutput({ lines, running, onClear, onStop }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);

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
    <div className="flex h-full flex-col overflow-hidden rounded-lg border border-border bg-terminal-bg">
      <div className="flex items-center justify-between border-b border-border bg-card/60 px-4 py-2">
        <div className="flex items-center gap-2">
          <span className="font-mono text-xs text-muted-foreground">
            console — {running ? 'running' : 'idle'}
          </span>
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

        {lines.map((l) => (
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
            <AnsiText text={l.text} />
          </pre>
        ))}

        {running && <div className="cursor-blink inline-block h-4" />}
      </div>
    </div>
  );
}
