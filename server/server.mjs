// Local helper server for the Test Runner web app.
// Run with:  node server/server.mjs
// Default port: 8787. Override with PORT env var.
//
// Endpoints:
//   GET  /api/tests             -> { tests: Test[] }
//   PUT  /api/tests             -> body: { tests: Test[] }   replace all
//   GET  /api/run?cmd=...       -> Server-Sent Events stream of stdout/stderr
//
// Tests are stored in ./tests.json (next to this file).

import http from 'node:http';
import { spawn } from 'node:child_process';
import { readFile, writeFile, access } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TESTS_FILE = join(__dirname, 'tests.json');
const PORT = process.env.PORT ? Number(process.env.PORT) : 8787;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

async function ensureFile() {
  try { await access(TESTS_FILE); }
  catch {
    const seed = {
      commandTemplate: 'echo "Running test with tag: {tag}"',
      tests: [
        { id: crypto.randomUUID(), name: 'Example smoke test', tag: 'smoke' },
        { id: crypto.randomUUID(), name: 'Login flow',          tag: 'auth.login' },
      ],
    };
    await writeFile(TESTS_FILE, JSON.stringify(seed, null, 2));
  }
}

async function readJson() {
  await ensureFile();
  const raw = await readFile(TESTS_FILE, 'utf8');
  return JSON.parse(raw);
}

async function writeJson(data) {
  await writeFile(TESTS_FILE, JSON.stringify(data, null, 2));
}

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
      const data = await readJson();
      return send(res, 200, data);
    }

    if (url.pathname === '/api/tests' && req.method === 'PUT') {
      const body = await readBody(req);
      const data = await readJson();
      const next = {
        commandTemplate: typeof body.commandTemplate === 'string' ? body.commandTemplate : data.commandTemplate,
        tests: Array.isArray(body.tests) ? body.tests : data.tests,
      };
      await writeJson(next);
      return send(res, 200, next);
    }

    if (url.pathname === '/api/run' && req.method === 'GET') {
      const cmd = url.searchParams.get('cmd');
      if (!cmd) return send(res, 400, { error: 'Missing cmd' });

      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        ...CORS,
      });

      const write = (event, data) =>
        res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);

      write('start', { cmd, at: new Date().toISOString() });

      const child = spawn(cmd, { shell: true });

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
  console.log(`  Tests file: ${TESTS_FILE}\n`);
});
