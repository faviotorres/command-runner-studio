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

export type AppiumConfig = {
  commandTemplate: string;
};

export type TestsFile = {
  commandTemplate: string;
  tests: Test[];
  apk?: ApkConfig;
  appium?: AppiumConfig;
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
