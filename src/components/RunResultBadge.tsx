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

export function RunResultBadge({ result }: { result?: RunResult }) {
  if (!result) return null;
  return (
    <div
      className="flex shrink-0 items-center gap-1.5 font-mono text-[11px] text-muted-foreground"
      title={`Last run: ${new Date(result.at).toLocaleString()} — ${result.success ? 'passed' : 'failed'}`}
    >
      <span aria-hidden>{result.success ? '✅' : '❌'}</span>
      <span>{formatWhen(result.at)}</span>
    </div>
  );
}
