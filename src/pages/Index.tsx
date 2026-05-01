import { useEffect, useMemo, useState } from 'react';
import { Plus, Search, Terminal, AlertTriangle, Square, FolderOpen, Play, Download, Upload, Cpu } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { toast } from '@/hooks/use-toast';
import {
  fetchTests, runCommand, saveTests,
  fetchSettings, saveSettings,
} from '@/lib/api';
import type { ApkConfig, AppiumConfig, LogLine, Settings, Test, TestsFile } from '@/lib/types';
import { ConsoleOutput } from '@/components/ConsoleOutput';
import { TestRow } from '@/components/TestRow';
import { TestFormDialog } from '@/components/TestFormDialog';

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

const Index = () => {
  const [data, setData] = useState<TestsFile | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [section, setSection] = useState<Section>('tests');
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

  const appendLine = (kind: LogLine['kind'], text: string) =>
    setLines((prev) => [...prev, { id: crypto.randomUUID(), kind, text, at: Date.now() }]);

  const startRun = (cmd: string, id: string, stdin?: string) => {
    const cwd = settings?.workingDir?.trim() || '';
    setLines([]);
    setRunning(true);
    setActiveId(id);
    if (cwd) appendLine('info', `cwd: ${cwd}`);
    appendLine('info', `$ ${cmd}`);
    if (stdin != null) appendLine('info', `[stdin] ${stdin}`);

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
    }, stdin);
    setStop(() => close);
  };

  const run = (test: Test) => {
    if (!data || running) return;
    const template = data.commandTemplate || 'echo {tag}';
    const cmd = template.split('{tag}').join(test.tag);
    startRun(cmd, test.id);
  };

  const runApk = (kind: ApkKind) => {
    if (!data || running) return;
    const action = apk[kind];
    startRun(action.commandTemplate, `apk-${kind}`);
  };

  const runAppium = () => {
    if (!data || running) return;
    startRun(appium.commandTemplate, 'appium');
  };

  const cancel = () => {
    stop?.();
    setRunning(false);
    appendLine('end', '\n[cancelled]');
  };

  return (
    <Tabs value={section} onValueChange={(v) => setSection(v as Section)} className="min-h-screen bg-background font-sans flex flex-col">
      {/* Header */}
      <header className="border-b border-border bg-card/40 backdrop-blur">
        <div className="mx-auto grid max-w-7xl grid-cols-3 items-center px-6 py-2.5">
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
                Appium
              </TabsTrigger>
              <TabsTrigger value="apk" className="font-mono text-xs uppercase tracking-wider">
                APK
              </TabsTrigger>
              <TabsTrigger value="tests" className="font-mono text-xs uppercase tracking-wider">
                Tests
              </TabsTrigger>
            </TabsList>
          </div>
          <div />
        </div>
      </header>

      {/* Body */}
      <main className="mx-auto max-w-7xl px-6 pt-4 pb-8">
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
            <div className="grid gap-6 lg:grid-cols-[minmax(0,420px)_1fr]">
              {/* LEFT: Section tabs + list */}
              <section className="flex flex-col">
                <>
                  <TabsContent value="tests" className="mt-0">
                    <div className="mb-3 flex items-center gap-2">
                      <div className="relative flex-1">
                        <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                        <Input
                          value={search}
                          onChange={(e) => setSearch(e.target.value)}
                          placeholder="filter by name or tag…"
                          className="pl-9 font-mono"
                        />
                      </div>
                      <Button
                        size="sm"
                        onClick={() => { setEditing(null); setDialogOpen(true); }}
                        disabled={running}
                        className="h-9 shrink-0 bg-primary font-mono text-primary-foreground hover:bg-primary/90 disabled:opacity-40"
                      >
                        <Plus className="mr-1 h-4 w-4" /> New
                      </Button>
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
                  </TabsContent>

                  <TabsContent value="apk" className="mt-0">
                    <div className="space-y-2">
                      <ApkRow
                        icon={<Download className="h-3.5 w-3.5" />}
                        label="Download"
                        running={running}
                        active={activeId === 'apk-download'}
                        onRun={() => runApk('download')}
                      />
                      <ApkRow
                        icon={<Upload className="h-3.5 w-3.5" />}
                        label="Upload"
                        running={running}
                        active={activeId === 'apk-upload'}
                        onRun={() => runApk('upload')}
                      />
                    </div>
                  </TabsContent>

                  <TabsContent value="appium" className="mt-0">
                    <div
                      className={
                        'flex items-center gap-3 rounded-md border border-border bg-card px-3 py-2.5 transition-all hover:border-primary/50 hover:bg-secondary' +
                        (activeId === 'appium' ? ' border-primary/70 shadow-glow' : '')
                      }
                    >
                      <Button
                        size="sm"
                        onClick={runAppium}
                        disabled={running}
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
                    </div>
                  </TabsContent>
                </>
              </section>

              {/* RIGHT: working dir + command(s) */}
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

                {section === 'tests' ? (
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
                      Use <code className="text-primary">{'{tag}'}</code> as a placeholder for the test's tag.
                    </p>
                  </section>
                ) : section === 'apk' ? (
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
                ) : (
                  <ApkCommandSection
                    title="Appium command"
                    value={appium.commandTemplate}
                    onChange={(v) => updateAppium(v)}
                    hint="Runs in the configured working directory."
                  />
                )}
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
    </Tabs>
  );
};

type ApkRowProps = {
  icon: React.ReactNode;
  label: string;
  running: boolean;
  active: boolean;
  onRun: () => void;
};

function ApkRow({ icon, label, running, active, onRun }: ApkRowProps) {
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
        <Play className="h-3.5 w-3.5 fill-current" />
      </Button>
      <div className="flex shrink-0 items-center gap-1.5 font-mono text-xs uppercase tracking-wider text-primary/80">
        {icon}
        <span>{label}</span>
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
      <div className="mt-2 flex items-start gap-2">
        <span className="mt-2 font-mono text-primary">$</span>
        <Textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="min-h-[80px] resize-y font-mono text-sm"
          spellCheck={false}
        />
      </div>
      {hint && <p className="mt-2 font-mono text-xs text-muted-foreground">{hint}</p>}
    </section>
  );
}

export default Index;
