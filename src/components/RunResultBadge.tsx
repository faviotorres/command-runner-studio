import { useEffect, useState }  from 'react';
import type { RunResult } from '@/lib/types';

function formatRelative(at: number) {
  const diff = Date.now() - at;
  const seconds = Math.floor(diff / 1000);

  if (seconds < 60) return 'just now';

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return minutes === 1 ? '1 min ago' : `${minutes} mins ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return hours === 1 ? '1 hr ago' : `${hours} hrs ago`;

  const days = Math.floor(hours / 24);
  if (days < 7) return days === 1 ? '1 day ago' : `${days} days ago`;

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
  const [, tick] = useState(0);

  useEffect(() => {
    const bump = () => tick((n) => n + 1);
    const id = setInterval(bump, 60_000);
    const onVisible = () => {
      if (document.visibilityState === 'visible') bump();
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', bump);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', bump);
    };
  }, []);

  if (!result) return null;
  return (
    <div
      className="flex shrink-0 items-center gap-1.5 font-mono text-[11px] text-muted-foreground"
      title={`Last run: ${new Date(result.at).toLocaleString()} — ${result.success ? 'passed' : 'failed'}${result.durationMs != null ? ` in ${formatDuration(result.durationMs)}` : ''}`}
    >
      <span aria-hidden>{result.success ? '✅' : '❌'}</span>
      <span>{formatRelative(result.at)}</span>
      {result.durationMs != null && (
        <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] leading-none text-muted-foreground">
          {formatDuration(result.durationMs)}
        </span>
      )}
    </div>
  );
}
