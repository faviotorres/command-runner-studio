import { useEffect, useMemo, useState } from 'react';
import { Plus, Search, Terminal, Server, AlertTriangle, Square, FolderOpen } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/hooks/use-toast';
import {
  fetchTests, runCommand, saveTests, getApiBase,
  fetchSettings, saveSettings,
} from '@/lib/api';
import type { LogLine, Settings, Test, TestsFile } from '@/lib/types';
import { ConsoleOutput } from '@/components/ConsoleOutput';
import { TestRow } from '@/components/TestRow';
import { TestFormDialog } from '@/components/TestFormDialog';

const Index = () => {
  const [data, setData] = useState<TestsFile | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<Test | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [lines, setLines] = useState<LogLine[]>([]);
  const [running, setRunning] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [stop, setStop] = useState<(() => void) | null>(null);

  // Load tests + settings
  useEffect(() => {
    Promise.all([fetchTests(), fetchSettings()])
      .then(([t, s]) => { setData(t); setSettings(s); })
      .catch((e) => setLoadError(String(e?.message || e)));
  }, []);

  const filtered = useMemo(() => {
    if (!data) return [];
    const q = search.toLowerCase().trim();
    if (!q) return data.tests;
    return data.tests.filter(
      (t) => t.name.toLowerCase().includes(q) || t.tag.toLowerCase().includes(q),
    );
  }, [data, search]);

  const persist = async (next: TestsFile) => {
    setData(next);
    try { await saveTests(next); }
    catch (e) {
      toast({ title: 'Save failed', description: String(e), variant: 'destructive' });
    }
  };

  const persistSettings = async (next: Settings) => {
    setSettings(next);
    try { await saveSettings(next); }
    catch (e) {
      toast({ title: 'Save failed', description: String(e), variant: 'destructive' });
    }
  };

  const upsert = (t: Test) => {
    if (!data) return;
    const exists = data.tests.some((x) => x.id === t.id);
    const tests = exists
      ? data.tests.map((x) => (x.id === t.id ? t : x))
      : [...data.tests, t];
    persist({ ...data, tests });
  };

  const remove = (id: string) => {
    if (!data) return;
    persist({ ...data, tests: data.tests.filter((x) => x.id !== id) });
  };

  const setTemplate = (commandTemplate: string) => {
    if (!data) return;
    persist({ ...data, commandTemplate });
  };

  const appendLine = (kind: LogLine['kind'], text: string) =>
    setLines((prev) => [...prev, { id: crypto.randomUUID(), kind, text, at: Date.now() }]);

  const run = (test: Test) => {
    if (!data || running) return;
    const template = data.commandTemplate || 'echo {tag}';
    const cmd = template.split('{tag}').join(test.tag);
    const cwd = settings?.workingDir?.trim() || '';
    setLines([]);
    setRunning(true);
    setActiveId(test.id);
    if (cwd) appendLine('info', `cwd: ${cwd}`);
    appendLine('info', `$ ${cmd}`);

    const close = runCommand(cmd, cwd, {
      onStdout: (c) => appendLine('stdout', c),
      onStderr: (c) => appendLine('stderr', c),
      onEnd: (code) => {
        appendLine('end', `\n[process exited with code ${code}]`);
        setRunning(false);
        setStop(null);
      },
      onError: (err) => {
        appendLine('stderr', err);
        setRunning(false);
        setStop(null);
      },
    });
    setStop(() => close);
  };

  const cancel = () => {
    stop?.();
    setRunning(false);
    appendLine('end', '\n[cancelled]');
  };

  return (
    <div className="min-h-screen bg-background font-sans">
      {/* Header */}
      <header className="border-b border-border bg-card/40 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-md bg-primary/10 text-primary shadow-glow">
              <Terminal className="h-5 w-5" />
            </div>
            <div>
              <h1 className="font-mono text-lg font-semibold tracking-tight glow-text">
                test_runner
              </h1>
              <p className="font-mono text-xs text-muted-foreground">
                local command launcher
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 font-mono text-xs text-muted-foreground">
            <Server className="h-3.5 w-3.5" />
            <span>helper:</span>
            <code className="rounded bg-secondary px-2 py-1 text-primary">{getApiBase()}</code>
          </div>
        </div>
      </header>

      {/* Body */}
      <main className="mx-auto max-w-7xl px-6 py-8">
        {loadError && (
          <div className="mb-6 flex items-start gap-3 rounded-md border border-destructive/40 bg-destructive/10 p-4 font-mono text-sm">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
            <div className="space-y-1">
              <div className="font-semibold text-destructive">Local helper not reachable</div>
              <div className="text-muted-foreground">
                Run{' '}
                <code className="rounded bg-background px-1.5 py-0.5 text-primary">
                  node server/server.mjs
                </code>{' '}
                in your project, then refresh.
              </div>
              <div className="text-xs text-muted-foreground/70">{loadError}</div>
            </div>
          </div>
        )}

        {data && settings && (
          <>
            <div className="grid gap-6 lg:grid-cols-[minmax(0,420px)_1fr]">
              {/* LEFT: Tests list */}
              <section className="flex flex-col">
                <div className="mb-3 flex items-center justify-between">
                  <h2 className="font-mono text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                    Tests <span className="text-primary">({data.tests.length})</span>
                  </h2>
                  <Button
                    size="sm"
                    onClick={() => { setEditing(null); setDialogOpen(true); }}
                    className="h-8 bg-primary font-mono text-primary-foreground hover:bg-primary/90"
                  >
                    <Plus className="mr-1 h-4 w-4" /> New
                  </Button>
                </div>

                <div className="relative mb-3">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="filter by name or tag…"
                    className="pl-9 font-mono"
                  />
                </div>

                <div
                  className="space-y-2 overflow-y-auto pr-1"
                  style={{ maxHeight: 'calc(5.5 * (2.5rem + 1rem + 0.5rem))' }}
                >
                  {filtered.length === 0 && (
                    <div className="rounded-md border border-dashed border-border p-8 text-center font-mono text-sm text-muted-foreground">
                      {data.tests.length === 0 ? 'No tests yet — create one.' : 'No matches.'}
                    </div>
                  )}
                  {filtered.map((t) => (
                    <TestRow
                      key={t.id}
                      test={t}
                      running={running}
                      active={activeId === t.id}
                      onRun={() => run(t)}
                      onEdit={() => { setEditing(t); setDialogOpen(true); }}
                      onDelete={() => remove(t.id)}
                    />
                  ))}
                </div>
              </section>

              {/* RIGHT: working dir + command */}
              <div className="space-y-4">
                <section className="rounded-lg border border-border bg-card p-5">
                  <Label htmlFor="cwd" className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
                    Working directory
                  </Label>
                  <div className="mt-2 flex items-center gap-2">
                    <FolderOpen className="h-4 w-4 shrink-0 text-primary" />
                    <Input
                      id="cwd"
                      value={settings.workingDir}
                      onChange={(e) => persistSettings({ ...settings, workingDir: e.target.value })}
                      className="font-mono"
                      placeholder="/Users/me/projects/my-app"
                    />
                  </div>
                  <p className="mt-2 font-mono text-xs text-muted-foreground">
                    Commands are executed from this directory. Saved to{' '}
                    <code className="text-primary">server/settings.json</code>.
                  </p>
                </section>

                <section className="rounded-lg border border-border bg-card p-5">
                  <Label htmlFor="cmd" className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
                    Command
                  </Label>
                  <div className="mt-2 flex items-start gap-2">
                    <span className="mt-2 font-mono text-primary">$</span>
                    <Textarea
                      id="cmd"
                      value={data.commandTemplate}
                      onChange={(e) => setTemplate(e.target.value)}
                      className="min-h-[120px] resize-y font-mono text-sm"
                      placeholder={'echo "Running {tag}"\nnpm test -- --tag {tag}'}
                      spellCheck={false}
                    />
                  </div>
                  <p className="mt-2 font-mono text-xs text-muted-foreground">
                    Multi-line supported. Use <code className="text-primary">{'{tag}'}</code> as a placeholder for the test's tag.
                  </p>
                </section>
              </div>
            </div>

            {/* BOTTOM: Output (full width) */}
            <section className="mt-6 flex min-h-[60vh] flex-col">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="font-mono text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                  Output
                </h2>
                {running && (
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={cancel}
                    className="h-8 font-mono"
                  >
                    <Square className="mr-1 h-3.5 w-3.5 fill-current" /> Stop
                  </Button>
                )}
              </div>
              <div className="flex-1">
                <ConsoleOutput
                  lines={lines}
                  running={running}
                  onClear={() => setLines([])}
                />
              </div>
            </section>
          </>
        )}
      </main>

      <TestFormDialog
        open={dialogOpen}
        initial={editing}
        onOpenChange={setDialogOpen}
        onSubmit={upsert}
      />
    </div>
  );
};

export default Index;
