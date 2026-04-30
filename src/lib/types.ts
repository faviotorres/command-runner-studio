export type Test = {
  id: string;
  name: string;
  tag: string;
};

export type TestsFile = {
  commandTemplate: string;
  tests: Test[];
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
