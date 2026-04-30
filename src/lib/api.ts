import type { Settings, TestsFile } from './types';

export const getApiBase = () =>
  (typeof window !== 'undefined' && localStorage.getItem('apiBase')) ||
  'http://localhost:8787';

export async function fetchTests(): Promise<TestsFile> {
  const res = await fetch(`${getApiBase()}/api/tests`);
  if (!res.ok) throw new Error(`GET /api/tests ${res.status}`);
  return res.json();
}

export async function saveTests(data: TestsFile): Promise<TestsFile> {
  const res = await fetch(`${getApiBase()}/api/tests`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(`PUT /api/tests ${res.status}`);
  return res.json();
}

export async function fetchSettings(): Promise<Settings> {
  const res = await fetch(`${getApiBase()}/api/settings`);
  if (!res.ok) throw new Error(`GET /api/settings ${res.status}`);
  return res.json();
}

export async function saveSettings(data: Settings): Promise<Settings> {
  const res = await fetch(`${getApiBase()}/api/settings`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(`PUT /api/settings ${res.status}`);
  return res.json();
}

export type RunHandlers = {
  onStart?: (cmd: string) => void;
  onStdout?: (chunk: string) => void;
  onStderr?: (chunk: string) => void;
  onEnd?: (code: number) => void;
  onError?: (err: string) => void;
};

export function runCommand(cmd: string, cwd: string, handlers: RunHandlers): () => void {
  const params = new URLSearchParams({ cmd });
  if (cwd) params.set('cwd', cwd);
  const url = `${getApiBase()}/api/run?${params.toString()}`;
  const es = new EventSource(url);

  es.addEventListener('start', (e: MessageEvent) => {
    try { handlers.onStart?.(JSON.parse(e.data).cmd); } catch {}
  });
  es.addEventListener('stdout', (e: MessageEvent) => {
    try { handlers.onStdout?.(JSON.parse(e.data).chunk); } catch {}
  });
  es.addEventListener('stderr', (e: MessageEvent) => {
    try { handlers.onStderr?.(JSON.parse(e.data).chunk); } catch {}
  });
  es.addEventListener('end', (e: MessageEvent) => {
    try { handlers.onEnd?.(JSON.parse(e.data).code); } catch {}
    es.close();
  });
  es.onerror = () => {
    handlers.onError?.('Connection to local helper failed. Is `node server/server.mjs` running?');
    es.close();
  };

  return () => es.close();
}
