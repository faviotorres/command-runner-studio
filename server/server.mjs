// Local helper server for the Test Runner web app.
// Run with:  node server/server.mjs
// Default port: 8787. Override with PORT env var.
//
// Endpoints:
//   GET  /api/tests                       -> { commandTemplate, tests: Test[] }
//   PUT  /api/tests                       -> body: { commandTemplate?, tests? }
//   GET  /api/settings                    -> { workingDir }
//   PUT  /api/settings                    -> body: { workingDir }
//   GET  /api/run?cmd=...&cwd=...         -> SSE stream of stdout/stderr
//
// Tests live in ./tests.json, settings in ./settings.json.

import http from 'node:http';
import { spawn } from 'node:child_process';
import { readFile, writeFile, access } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TESTS_FILE = join(__dirname, 'tests.json');
const SETTINGS_FILE = join(__dirname, 'settings.json');
const PORT = process.env.PORT ? Number(process.env.PORT) : 8787;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

async function ensureFile(path, seed) {
  try { await access(path); }
  catch { await writeFile(path, JSON.stringify(seed, null, 2)); }
}

async function readJson(path, seed) {
  await ensureFile(path, seed);
  return JSON.parse(await readFile(path, 'utf8'));
}

async function writeJson(path, data) {
  await writeFile(path, JSON.stringify(data, null, 2));
}

const TESTS_SEED = {
  commandTemplate: 'echo "Running test with tag: {tag}"',
  tests: [
    { id: crypto.randomUUID(), name: 'Example smoke test', tag: 'smoke' },
    { id: crypto.randomUUID(), name: 'Login flow',          tag: 'auth.login' },
  ],
  apk: {
    download: {
      // Simulates the real download flow: prints progress, waits ~3s, THEN
      // prompts for the filename (mimicking the 30s delay before the real
      // tool asks for input). The web UI auto-feeds {filename} into stdin,
      // which sits in the pipe buffer until `read` consumes it.
      commandTemplate: 'bash -c \'echo "Starting download..."; sleep 1; echo "Connecting to device..."; sleep 2; read -p "Enter APK filename: " f && echo "" && echo "Got filename: $f" && echo "Pulling /sdcard/Download/$f -> ./$f"\'',
      filename: 'app-release.apk',
    },
    upload: {
      commandTemplate: 'adb install -r "{filename}"',
      filename: 'app-release.apk',
    },
  },
};

const SETTINGS_SEED = { workingDir: '' };

function send(res, status, body, extra = {}) {
  res.writeHead(status, { 'Content-Type': 'application/json', ...CORS, ...extra });
  res.end(JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', () => {
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')); }
      catch (e) { reject(e); }
    });
    req.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') { res.writeHead(204, CORS); return res.end(); }

  const url = new URL(req.url, `http://localhost:${PORT}`);

  try {
    if (url.pathname === '/api/tests' && req.method === 'GET') {
      const data = await readJson(TESTS_FILE, TESTS_SEED);
      if (!data.apk) data.apk = TESTS_SEED.apk;
      return send(res, 200, data);
    }

    if (url.pathname === '/api/tests' && req.method === 'PUT') {
      const body = await readBody(req);
      const data = await readJson(TESTS_FILE, TESTS_SEED);
      const next = {
        commandTemplate: typeof body.commandTemplate === 'string' ? body.commandTemplate : data.commandTemplate,
        tests: Array.isArray(body.tests) ? body.tests : data.tests,
        apk: (body.apk && typeof body.apk === 'object') ? body.apk : (data.apk || TESTS_SEED.apk),
      };
      await writeJson(TESTS_FILE, next);
      return send(res, 200, next);
    }

    if (url.pathname === '/api/settings' && req.method === 'GET') {
      return send(res, 200, await readJson(SETTINGS_FILE, SETTINGS_SEED));
    }

    if (url.pathname === '/api/settings' && req.method === 'PUT') {
      const body = await readBody(req);
      const next = { workingDir: typeof body.workingDir === 'string' ? body.workingDir : '' };
      await writeJson(SETTINGS_FILE, next);
      return send(res, 200, next);
    }

    if (url.pathname === '/api/run' && req.method === 'GET') {
      const cmd = url.searchParams.get('cmd');
      const cwdParam = url.searchParams.get('cwd');
      const stdinParam = url.searchParams.get('stdin');
      if (!cmd) return send(res, 400, { error: 'Missing cmd' });

      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        ...CORS,
      });

      const write = (event, data) =>
        res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);

      const cwd = cwdParam && cwdParam.trim() ? cwdParam : undefined;
      write('start', { cmd, cwd: cwd || process.cwd(), at: new Date().toISOString() });

      let child;
      try {
        child = spawn(cmd, { shell: true, cwd });
      } catch (err) {
        write('stderr', { chunk: String(err) });
        write('end', { code: -1 });
        return res.end();
      }

      // Auto-feed stdin (e.g. APK filename) so interactive prompts get answered.
      if (stdinParam != null) {
        try { child.stdin.write(stdinParam.endsWith('\n') ? stdinParam : stdinParam + '\n'); } catch {}
      }
      try { child.stdin.end(); } catch {}

      child.stdout.on('data', d => write('stdout', { chunk: d.toString() }));
      child.stderr.on('data', d => write('stderr', { chunk: d.toString() }));
      child.on('close', code => { write('end', { code }); res.end(); });
      child.on('error', err => { write('stderr', { chunk: String(err) }); write('end', { code: -1 }); res.end(); });

      req.on('close', () => { try { child.kill(); } catch {} });
      return;
    }

    send(res, 404, { error: 'Not found' });
  } catch (err) {
    send(res, 500, { error: String(err?.message || err) });
  }
});

server.listen(PORT, () => {
  console.log(`\n  Test Runner helper listening on http://localhost:${PORT}`);
  console.log(`  Tests file:    ${TESTS_FILE}`);
  console.log(`  Settings file: ${SETTINGS_FILE}\n`);
});
