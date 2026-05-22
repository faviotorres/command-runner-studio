import { useEffect, useMemo, useState } from 'react';
import { Plus, Search, Terminal, AlertTriangle, Square, FolderOpen, Play, Download, Upload, Cpu, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from '@/components/ui/resizable';
import { toast } from '@/hooks/use-toast';
import {
  fetchTests, runCommand, saveTests,
  fetchSettings, saveSettings,
} from '@/lib/api';
import type { ApkConfig, AppiumConfig, LogLine, RunResult, Settings, Test, TestsFile } from '@/lib/types';
import { ConsoleOutput } from '@/components/ConsoleOutput';
import { TestRow } from '@/components/TestRow';
import { TestFormDialog } from '@/components/TestFormDialog';
import { RunResultBadge } from '@/components/RunResultBadge';

const DEFAULT_APK: ApkConfig = {
  download: {
    commandTemplate: `bash -c 'echo "Starting download..."; sleep 1; echo "Connecting to device..."; sleep 2; read -p "Enter APK filename: " f && echo "" && echo "Got filename: $f" && echo "Pulling /sdcard/Download/$f -> ./$f"'`,
    filename: 'app-release.apk',
  },
  upload: {
    commandTemplate: 'adb install -r "{filename}"',
    filename: 'app-release.apk',
  },
};

const DEFAULT_APPIUM: AppiumConfig = {
  commandTemplate: 'npm run start-appium',
};

type Section = 'tests' | 'apk' | 'appium';
type ApkKind = 'download' | 'upload';

type RunState = {
  lines: LogLine[];
  running: boolean;
  activeId: string | null;
  activeLabel: string;
  startedAt: number | null;
  endedAt: number | null;
  stop: (() => void) | null;
  cancelled: boolean;
};

const initialRun: RunState = {
  lines: [],
  running: false,
  activeId: null,
  activeLabel: '',
  startedAt: null,
  endedAt: null,
  stop: null,
  cancelled: false,
};

const Index = () => {
  const [data, setData] = useState<TestsFile | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [section, setSection] = useState<Section>('tests');
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<Test | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [testEnv, setTestEnv] = useState<'Local' | 'Labs'>('Local');

  const ECHO_ENV_RE = /echo\s+"(Local|Labs)"/;
  const handleTestEnvChange = (val: 'Local' | 'Labs') => {
    if (!data) return;
    setTestEnv(val);
    const current = data.commandTemplate || '';
    const next = ECHO_ENV_RE.test(current)
      ? current.replace(ECHO_ENV_RE, `echo "${val}"`)
      : (current ? `${current}\necho "${val}"` : `echo "${val}"`);
    setTemplate(next);
  };
  const [runs, setRuns] = useState<Record<Section, RunState>>({
    tests: { ...initialRun },
    apk: { ...initialRun },
    appium: { ...initialRun },
  });

  const updateRun = (sec: Section, patch: Partial<RunState> | ((r: RunState) => Partial<RunState>)) =>
    setRuns((prev) => {
      const cur = prev[sec];
      const next = typeof patch === 'function' ? patch(cur) : patch;
      return { ...prev, [sec]: { ...cur, ...next } };
    });

  // Load tests + settings
  useEffect(() => {
    Promise.all([fetchTests(), fetchSettings()])
      .then(([t, s]) => {
        if (!t.apk) t.apk = DEFAULT_APK;
        if (!t.appium) t.appium = DEFAULT_APPIUM;
        setData(t);
        setSettings(s);
      })
      .catch((e) => setLoadError(String(e?.message || e)));
  }, []);

  const apk = data?.apk ?? DEFAULT_APK;
  const appium = data?.appium ?? DEFAULT_APPIUM;

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

  const updateApk = (kind: ApkKind, patch: Partial<ApkConfig['download']>) => {
    if (!data) return;
    const nextApk: ApkConfig = {
      ...apk,
      [kind]: { ...apk[kind], ...patch },
    };
    persist({ ...data, apk: nextApk });
  };

  const updateAppium = (commandTemplate: string) => {
    if (!data) return;
    persist({ ...data, appium: { commandTemplate } });
  };

  const appendLine = (sec: Section, kind: LogLine['kind'], text: string) =>
    updateRun(sec, (r) => ({
      lines: [...r.lines, { id: crypto.randomUUID(), kind, text, at: Date.now() }],
    }));

  const saveResult = (id: string, success: boolean, durationMs: number) => {
    setData((prev) => {
      if (!prev) return prev;
      const next: TestsFile = {
        ...prev,
        results: { ...(prev.results ?? {}), [id]: { at: Date.now(), success, durationMs } },
      };
      saveTests(next).catch((e) =>
        toast({ title: 'Save failed', description: String(e), variant: 'destructive' }),
      );
      return next;
    });
  };

  const detectResult = (buf: string): boolean | null => {
    // Scan from the end, matching the same logic ConsoleOutput uses for the header.
    const lines = buf.split('\n');
    for (let i = lines.length - 1; i >= 0; i--) {
      const t = lines[i];
      if (/test\s+passed/i.test(t)) return true;
      if (/test\s+failed/i.test(t)) return false;
    }
    return null;
  };

  const startRun = (sec: Section, cmd: string, id: string, label: string, stdin?: string) => {
    const cwd = settings?.workingDir?.trim() || '';
    let cancelled = false;
    let buffer = '';
    const startedAt = Date.now();
    updateRun(sec, {
      lines: [],
      running: true,
      activeId: id,
      activeLabel: label,
      startedAt,
      endedAt: null,
      cancelled: false,
    });
    if (cwd) appendLine(sec, 'info', `cwd: ${cwd}`);
    appendLine(sec, 'info', `$ ${cmd}`);
    if (stdin != null) appendLine(sec, 'info', `[stdin] ${stdin}`);

    const close = runCommand(cmd, cwd, {
      onStdout: (c) => { buffer += c + '\n'; appendLine(sec, 'stdout', c); },
      onStderr: (c) => { buffer += c + '\n'; appendLine(sec, 'stderr', c); },
      onEnd: (code) => {
        appendLine(sec, 'end', `\n[process exited with code ${code}]`);
        const endedAt = Date.now();
        updateRun(sec, { running: false, stop: null, endedAt });
        if (cancelled) return;
        const result = detectResult(buffer);
        if (result !== null) saveResult(id, result, endedAt - startedAt);
      },
      onError: (err) => {
        appendLine(sec, 'stderr', err);
        updateRun(sec, { running: false, stop: null, endedAt: Date.now() });
      },
    }, stdin);
    updateRun(sec, { stop: () => { cancelled = true; close(); } });
  };

  const run = (test: Test) => {
    if (!data || runs.tests.running) return;
    const template = data.commandTemplate || 'echo {tag}';
    const cmd = template.split('{tag}').join(test.tag);
    startRun('tests', cmd, test.id, test.tag);
  };

  const runApk = (kind: ApkKind) => {
    if (!data || runs.apk.running) return;
    const action = apk[kind];
    startRun('apk', action.commandTemplate, `apk-${kind}`, `apk-${kind}`);
  };

  const runAppium = () => {
    if (!data || runs.appium.running) return;
    startRun('appium', appium.commandTemplate, 'appium', 'appium');
  };

  const cancel = (sec: Section) => {
    const r = runs[sec];
    r.stop?.();
    updateRun(sec, { running: false, endedAt: Date.now() });
    appendLine(sec, 'end', '\n[cancelled]');
  };

  const currentRun = runs[section];

  return (
    <Tabs value={section} onValueChange={(v) => setSection(v as Section)} className="h-screen bg-background font-sans flex flex-col overflow-hidden">
      {/* Header */}
      <header className="toolbar border-b border-border bg-background text-foreground shrink-0">
        <div className="grid w-full grid-cols-3 items-center px-6 py-2.5">
          <div className="flex items-center gap-2.5">
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary/10 text-primary">
              <Terminal className="h-4 w-4" />
            </div>
            <div>
              <h1 className="font-mono text-sm font-semibold tracking-tight">
                test_runner
              </h1>
              <p className="font-mono text-[10px] leading-tight text-muted-foreground">
                local command launcher
              </p>
            </div>
          </div>
          <div className="flex justify-center">
            <TabsList className="h-9 bg-secondary font-mono">
              <TabsTrigger value="appium" className="font-mono text-xs uppercase tracking-wider">
                Appium{runs.appium.running ? ' •' : ''}
              </TabsTrigger>
              <TabsTrigger value="apk" className="font-mono text-xs uppercase tracking-wider">
                APK{runs.apk.running ? ' •' : ''}
              </TabsTrigger>
              <TabsTrigger value="tests" className="font-mono text-xs uppercase tracking-wider">
                Tests{runs.tests.running ? ' •' : ''}
              </TabsTrigger>
            </TabsList>
          </div>
          <div className="flex justify-end">
            {settings && (
              <div className="flex items-center gap-2 w-full max-w-sm">
                <FolderOpen className="h-4 w-4 shrink-0 text-primary" />
                <Input
                  id="cwd"
                  value={settings.workingDir}
                  onChange={(e) => persistSettings({ ...settings, workingDir: e.target.value })}
                  className="h-8 font-mono text-xs bg-[#001E60] text-white border-white/20 placeholder:text-white/50"
                  placeholder="/Users/me/projects/my-app"
                />
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Body */}
      <main className="w-full flex-1 min-h-0 px-6 pt-4 pb-6 overflow-hidden">
        <ResizablePanelGroup direction="horizontal">
        {/* LEFT column: scrollable content */}
        <ResizablePanel defaultSize={50} minSize={25} maxSize={50} className="flex min-h-0 flex-col pr-3">
          {loadError && (
            <div className="mb-6 flex items-start gap-3 rounded-md border border-destructive/40 bg-destructive/10 p-4 font-mono text-sm">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
              <div className="space-y-1">
                <div className="font-semibold text-destructive">Local helper not reachable</div>
                <div className="text-muted-foreground">
                  Run{' '}
                  <code className="rounded bg-background px-1.5 py-0.5 text-primary">
                    npm run dev
                  </code>{' '}
                  in your project, then refresh.
                </div>
                <div className="text-xs text-muted-foreground/70">{loadError}</div>
              </div>
            </div>
          )}

          {data && settings && (
            <>
              {/* Top: scrollable list area */}
              <div className="flex-1 min-h-0 overflow-y-auto pr-1">
                <TabsContent value="tests" className="mt-0">
                  <div className="sticky top-0 z-10 mb-3 flex items-center gap-2 bg-background pb-2">
                    <div className="relative flex-1">
                      <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="filter by name or tag…"
                        className="pl-9 font-mono bg-gray-100"
                      />
                    </div>
                    <Button
                      size="sm"
                      onClick={() => { setEditing(null); setDialogOpen(true); }}
                      disabled={runs.tests.running}
                      className="h-9 shrink-0 bg-primary font-mono text-primary-foreground hover:bg-primary/90 disabled:opacity-40"
                    >
                      <Plus className="mr-1 h-4 w-4" /> New
                    </Button>
                  </div>

                  <div className="space-y-2">
                    {filtered.length === 0 && (
                      <div className="rounded-md border border-dashed border-border p-8 text-center font-mono text-sm text-muted-foreground">
                        {data.tests.length === 0 ? 'No tests yet — create one.' : 'No matches.'}
                      </div>
                    )}
                    {filtered.map((t) => (
                      <TestRow
                        key={t.id}
                        test={t}
                        running={runs.tests.running}
                        active={runs.tests.activeId === t.id}
                        result={data.results?.[t.id]}
                        onRun={() => run(t)}
                        onEdit={() => { setEditing(t); setDialogOpen(true); }}
                        onDelete={() => remove(t.id)}
                      />
                    ))}
                  </div>
                </TabsContent>

                <TabsContent value="apk" className="mt-0">
                  <div className="space-y-2">
                    <ApkRow
                      icon={<Download className="h-3.5 w-3.5" />}
                      label="Download"
                      running={runs.apk.running}
                      active={runs.apk.activeId === 'apk-download'}
                      result={data.results?.['apk-download']}
                      onRun={() => runApk('download')}
                    />
                    <ApkRow
                      icon={<Upload className="h-3.5 w-3.5" />}
                      label="Upload"
                      running={runs.apk.running}
                      active={runs.apk.activeId === 'apk-upload'}
                      result={data.results?.['apk-upload']}
                      onRun={() => runApk('upload')}
                    />
                  </div>
                </TabsContent>

                <TabsContent value="appium" className="mt-0">
                  <div
                    className={
                      'flex items-center gap-3 rounded-md border border-border bg-card px-3 py-2.5 transition-all hover:border-primary/50 hover:bg-secondary' +
                      (runs.appium.activeId === 'appium' ? ' border-primary/70 shadow-glow' : '')
                    }
                  >
                    <Button
                      size="sm"
                      onClick={runAppium}
                      disabled={runs.appium.running}
                      className="h-8 shrink-0 bg-primary px-3 font-mono text-primary-foreground hover:bg-primary/90 disabled:opacity-40"
                    >
                      <Play className="h-3.5 w-3.5 fill-current" />
                    </Button>
                    <div className="flex shrink-0 items-center gap-1.5 font-mono text-xs uppercase tracking-wider text-primary/80">
                      <Cpu className="h-3.5 w-3.5" />
                      <span>Start Appium</span>
                    </div>
                    <code className="flex-1 truncate font-mono text-xs text-muted-foreground">
                      {appium.commandTemplate}
                    </code>
                    <RunResultBadge result={data.results?.['appium']} />
                  </div>
                </TabsContent>
              </div>

              {/* Bottom: fixed command section */}
              <div className="shrink-0 mt-3 space-y-3">
                {section === 'tests' && (
                  <section className="rounded-lg border border-border bg-card p-5">
                    <div className="flex items-center justify-between gap-3">
                      <div className="inline-flex h-9 items-center rounded-md bg-secondary p-1 font-mono">
                        {(['Local', 'Labs'] as const).map((opt) => (
                          <button
                            key={opt}
                            type="button"
                            onClick={() => handleTestEnvChange(opt)}
                            className={
                              'inline-flex h-7 items-center rounded-sm px-3 text-xs uppercase tracking-wider transition-colors ' +
                              (testEnv === opt
                                ? 'bg-background text-foreground shadow-sm'
                                : 'text-muted-foreground hover:text-foreground')
                            }
                          >
                            {opt}
                          </button>
                        ))}
                      </div>
                      <Label htmlFor="cmd" className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
                        Command
                      </Label>
                    </div>
                    <div className="mt-2 flex items-start gap-2">
                      <span className="mt-2 font-mono text-primary">$</span>
                      <Textarea
                        id="cmd"
                        value={data.commandTemplate}
                        onChange={(e) => setTemplate(e.target.value)}
                        rows={5}
                        className="min-h-[120px] resize-y font-mono text-sm bg-gray-100"
                        placeholder={'echo "Running {tag}"\nnpm test -- --tag {tag}'}
                        spellCheck={false}
                      />
                    </div>
                    <p className="mt-2 font-mono text-xs text-muted-foreground">
                      Use <code className="text-primary">{'{tag}'}</code> as a placeholder for the test's tag.
                    </p>
                  </section>
                )}
                {section === 'apk' && (
                  <>
                    <ApkCommandSection
                      title="Download command"
                      value={apk.download.commandTemplate}
                      onChange={(v) => updateApk('download', { commandTemplate: v })}
                    />
                    <ApkCommandSection
                      title="Upload command"
                      value={apk.upload.commandTemplate}
                      onChange={(v) => updateApk('upload', { commandTemplate: v })}
                    />
                  </>
                )}
                {section === 'appium' && (
                  <ApkCommandSection
                    title="Appium command"
                    value={appium.commandTemplate}
                    onChange={(v) => updateAppium(v)}
                    hint="Runs in the configured working directory."
                  />
                )}
              </div>
            </>
          )}
        </ResizablePanel>

        {/* RIGHT column: fixed full-height console */}
        {data && settings && (
          <>
            <ResizableHandle className="w-1 bg-transparent hover:bg-primary/30 transition-colors" />
            <ResizablePanel defaultSize={50} minSize={50} maxSize={75} className="flex min-h-0 flex-col pl-3">
              <ConsoleOutput
                lines={currentRun.lines}
                running={currentRun.running}
                onClear={() => updateRun(section, { ...initialRun })}
                onStop={currentRun.running ? () => cancel(section) : undefined}
                label={currentRun.activeLabel}
                startedAt={currentRun.startedAt}
                endedAt={currentRun.endedAt}
              />
            </ResizablePanel>
          </>
        )}
        </ResizablePanelGroup>
      </main>

      <TestFormDialog
        open={dialogOpen}
        initial={editing}
        onOpenChange={setDialogOpen}
        onSubmit={upsert}
      />
    </Tabs>
  );
};

type ApkRowProps = {
  icon: React.ReactNode;
  label: string;
  running: boolean;
  active: boolean;
  result?: RunResult;
  onRun: () => void;
};

function ApkRow({ icon, label, running, active, result, onRun }: ApkRowProps) {
  return (
    <div
      className={
        'flex items-center gap-3 rounded-md border border-border bg-card px-3 py-2.5 transition-all hover:border-primary/50 hover:bg-secondary' +
        (active ? ' border-primary/70 shadow-glow' : '')
      }
    >
      <Button
        size="sm"
        onClick={onRun}
        disabled={running}
        className="h-8 shrink-0 bg-primary px-3 font-mono text-primary-foreground hover:bg-primary/90 disabled:opacity-40"
      >
        {active && running ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Play className="h-3.5 w-3.5 fill-current" />
        )}
      </Button>
      <div className="flex shrink-0 items-center gap-1.5 font-mono text-xs uppercase tracking-wider text-primary/80">
        {icon}
        <span>{label}</span>
      </div>
      <div className="ml-auto">
        <RunResultBadge result={result} />
      </div>
    </div>
  );
}

function ApkCommandSection({
  title, value, onChange, hint,
}: { title: string; value: string; onChange: (v: string) => void; hint?: string }) {
  return (
    <section className="rounded-lg border border-border bg-card p-5">
      <Label className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
        {title}
      </Label>
      <div className="mt-2 flex items-center gap-2">
        <span className="font-mono text-primary">$</span>
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="font-mono text-sm bg-gray-100"
          spellCheck={false}
        />
      </div>
      {hint && <p className="mt-2 font-mono text-xs text-muted-foreground">{hint}</p>}
    </section>
  );
}

export default Index;
