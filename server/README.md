# Test Runner — Local Helper

This tiny Node server lets the web UI execute terminal commands on your
machine and persist your tests list to a JSON file.

## Run

It starts automatically with `npm run dev` (via a Vite plugin in
`server/vite-plugin.mjs`). No separate command needed.

To run it standalone:

```bash
node server/server.mjs
```

Default port: `8787`. Override with `PORT=9000 node server/server.mjs`.

If your web app runs on a different host/port, set its API base via
`localStorage.setItem('apiBase', 'http://localhost:8787')` in the browser
console — otherwise it defaults to `http://localhost:8787`.

## Storage

Tests live in `server/tests.json`. Shape:

```json
{
  "commandTemplate": "npm test -- --tag {tag}",
  "tests": [
    { "id": "uuid", "name": "Smoke", "tag": "smoke" }
  ]
}
```

`{tag}` in `commandTemplate` is replaced with the test's tag at run time.

## Security

The server runs **any** shell command sent to `/api/run`. Keep it bound to
localhost and don't expose it to the network.
