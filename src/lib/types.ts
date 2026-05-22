export type Test = {
  id: string;
  name: string;
  tag: string;
};

export type ApkAction = {
  commandTemplate: string;
  filename: string;
};

export type ApkConfig = {
  download: ApkAction;
  upload: ApkAction;
};

export type AppiumItem = {
  id: string;
  label: string;
  commandTemplate: string;
};

export type AppiumConfig = {
  /** @deprecated kept for backward compat with older saved files */
  commandTemplate?: string;
  items: AppiumItem[];
};

export type RunResult = {
  at: number;
  success: boolean;
  durationMs?: number;
};

export type TestsFile = {
  commandTemplate: string;
  tests: Test[];
  apk?: ApkConfig;
  appium?: AppiumConfig;
  results?: Record<string, RunResult>;
};

export type Settings = {
  workingDir: string;
};

export type LogLine = {
  id: string;
  kind: 'info' | 'stdout' | 'stderr' | 'end';
  text: string;
  at: number;
};
