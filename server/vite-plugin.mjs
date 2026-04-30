// Vite plugin that boots the local helper server alongside `vite`.
// This way `npm run dev` starts both the web UI and the command runner.
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SERVER_PATH = join(__dirname, 'server.mjs');

export function testRunnerHelper() {
  let child = null;

  const start = () => {
    if (child) return;
    child = spawn(process.execPath, [SERVER_PATH], {
      stdio: 'inherit',
      env: process.env,
    });
    child.on('exit', (code) => {
      child = null;
      if (code && code !== 0) {
        console.error(`[test-runner-helper] exited with code ${code}`);
      }
    });
  };

  const stop = () => {
    if (!child) return;
    try { child.kill(); } catch {}
    child = null;
  };

  return {
    name: 'test-runner-helper',
    apply: 'serve',
    configureServer() {
      start();
      const cleanup = () => stop();
      process.once('exit', cleanup);
      process.once('SIGINT', () => { cleanup(); process.exit(0); });
      process.once('SIGTERM', () => { cleanup(); process.exit(0); });
    },
    closeBundle() { stop(); },
  };
}
