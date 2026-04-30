export type Test = {
  id: string;
  name: string;
  tag: string;
};

export type TestsFile = {
  commandTemplate: string;
  tests: Test[];
};

export type LogLine = {
  id: string;
  kind: 'info' | 'stdout' | 'stderr' | 'end';
  text: string;
  at: number;
};
