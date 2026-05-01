import { useEffect, useMemo, useRef } from 'react';
import { cn } from '@/lib/utils';
import type { LogLine } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { ExternalLink, Trash2 } from 'lucide-react';

type Props = {
  lines: LogLine[];
  running: boolean;
  onClear: () => void;
};

export function ConsoleOutput({ lines, running, onClear }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [lines]);

  const reportPath = useMemo(() => {
    // Scan from the end for the last "Created report:" occurrence.
    for (let i = lines.length - 1; i >= 0; i--) {
      const text = lines[i].text;
      const match = text.match(/Created report:\s*(.+?)\s*$/m);
      if (match) return match[1].trim();
    }
    return null;
  }, [lines]);

  const reportHref = useMemo(() => {
    if (!reportPath) return null;
    if (/^[a-z]+:\/\//i.test(reportPath)) return reportPath;
    // Treat as a local filesystem path -> file:// URL
    const normalized = reportPath.replace(/\\/g, '/');
    return normalized.startsWith('/')
      ? `file://${normalized}`
      : `file:///${normalized}`;
  }, [reportPath]);

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-lg border border-border bg-terminal-bg">
      <div className="flex items-center justify-between border-b border-border bg-card/60 px-4 py-2">
        <div className="flex items-center gap-2">
          <span className="font-mono text-xs text-muted-foreground">
            console — {running ? 'running' : 'idle'}
          </span>
        </div>
        <div className="flex items-center gap-1">
          {reportHref && (
            <Button
              variant="ghost"
              size="sm"
              asChild
              className="h-7 text-primary hover:text-primary"
            >
              <a href={reportHref} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="mr-1.5 h-3.5 w-3.5" /> Open Report
              </a>
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={onClear}
            className="h-7 text-muted-foreground hover:text-foreground"
          >
            <Trash2 className="mr-1.5 h-3.5 w-3.5" /> Clear
          </Button>
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
            {l.text}
          </pre>
        ))}

        {running && <div className="cursor-blink inline-block h-4" />}
      </div>
    </div>
  );
}
