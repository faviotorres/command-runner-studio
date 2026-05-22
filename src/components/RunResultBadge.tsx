import type { RunResult } from '@/lib/types';

function formatWhen(at: number) {
  const d = new Date(at);
  return d.toLocaleString(undefined, {
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatDuration(ms?: number) {
  if (ms == null) return '';
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

export function RunResultBadge({ result }: { result?: RunResult }) {
  if (!result) return null;
  return (
    <div
      className="flex shrink-0 items-center gap-1.5 font-mono text-[11px] text-muted-foreground"
      title={`Last run: ${new Date(result.at).toLocaleString()} — ${result.success ? 'passed' : 'failed'}${result.durationMs != null ? ` in ${formatDuration(result.durationMs)}` : ''}`}
    >
      <span aria-hidden>{result.success ? '✅' : '❌'}</span>
      <span>{formatWhen(result.at)}</span>
      {result.durationMs != null && (
        <span className="text-muted-foreground/60">· {formatDuration(result.durationMs)}</span>
      )}
    </div>
  );
}
