# Plan 003: Wrong-code lockout applies per real client, not per reverse proxy

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 60b8a06..HEAD -- server/server.mjs tests/server-sync.test.ts README.md`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: security
- **Planned at**: commit `60b8a06`, 2026-11-13

## Why this matters

The server blocks an address for 15 minutes after 10 wrong sync codes. It
identifies the address with `req.socket.remoteAddress`. The README requires
running behind an HTTPS reverse proxy (Nginx Proxy Manager, Caddy, Cloudflare
Tunnel), so every request arrives from the proxy's address: ten wrong attempts
from anyone lock out **every** user, including the family's real phones, and the
brute-force limit is shared across the whole internet. The fix is to optionally
trust the proxy's `X-Forwarded-For` header, off by default (so direct exposure
cannot be bypassed by spoofing the header).

## Current state

File: `server/server.mjs` (plain Node ESM, no framework).

```js
const failures = new Map(); // ip -> { count, until }
const FAIL_LIMIT = 10;
const FAIL_WINDOW_MS = 15 * 60 * 1000;
...
function authorize(req, res) {
  const ip = req.socket.remoteAddress ?? "?";
  if (blocked(ip)) { sendJson(res, 429, { error: "too_many_attempts" }); return false; }
  if (!checkCode(req)) { recordFailure(ip); sendJson(res, 401, { error: "bad_code" }); return false; }
  failures.delete(ip);
  return true;
}
```

Config is read from env at the top of the file (`const CRON_SECRET = process.env.CRON_SECRET ?? "";`
etc.). Tests spawn the real server with extra env: `tests/server-sync.test.ts`
has `startServer(env)` which spawns `node server/server.mjs` and resolves `{ proc, base }`;
`CODE` is the sync code; tests use `fetch(\`${base}/api/data\`, { headers: { Authorization: \`Bearer ${CODE}\` } })`.
README documents env vars in a table under "Lembretes (Web Push a partir do NAS)" ("Variáveis do contentor").

Design: new env `TRUST_PROXY=1`. When set, the client address is the **rightmost**
entry of `X-Forwarded-For` (the one appended by the trusted proxy; earlier
entries are client-controlled). If the header is missing, fall back to the socket
address. When not set, the header is ignored entirely.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Server tests | `npx vitest run tests/server-sync.test.ts` | all pass |
| All tests | `npm test` | exit 0 |
| Typecheck | `npm run typecheck` | exit 0 |

## Scope

**In scope**:
- `server/server.mjs`
- `tests/server-sync.test.ts` (append one `describe`)
- `README.md` (one row in the container-variables table, plus one sentence in the Segurança section)

**Out of scope**:
- `server/push.mjs`, the Dockerfile, the GitHub workflow.
- Any change to `FAIL_LIMIT`/`FAIL_WINDOW_MS` or to what counts as a failure.
- Cleanup of the `failures` map (not in this plan).

## Git workflow

- Branch: `advisor/003-lockout-client-ip`
- One commit; short imperative message.
- Do NOT push or open a PR.

## Steps

### Step 1: Write the failing tests

Append to `tests/server-sync.test.ts` a `describe("bloqueio por endereço atrás de proxy", ...)`
that starts its own server (so the lockout state is isolated):

```ts
describe("bloqueio por endereço atrás de proxy", () => {
  async function wrong(base: string, xff?: string) {
    return (await fetch(`${base}/api/data`, { headers: { Authorization: "Bearer wrong", ...(xff ? { "X-Forwarded-For": xff } : {}) } })).status;
  }

  it("com TRUST_PROXY, um cliente bloqueado não bloqueia os outros", async () => {
    const s = await startServer({ SYNC_CODE: CODE, TRUST_PROXY: "1" });
    try {
      for (let i = 0; i < 10; i++) expect(await wrong(s.base, "203.0.113.5")).toBe(401);
      expect(await wrong(s.base, "203.0.113.5")).toBe(429);
      const ok = await fetch(`${s.base}/api/data`, { headers: { Authorization: `Bearer ${CODE}`, "X-Forwarded-For": "198.51.100.7" } });
      expect(ok.status).toBe(200);
    } finally {
      s.proc.kill();
    }
  });

  it("só confia no último valor de X-Forwarded-For (o do proxy)", async () => {
    const s = await startServer({ SYNC_CODE: CODE, TRUST_PROXY: "1" });
    try {
      // O atacante muda o início da lista a cada pedido; o último valor é o mesmo.
      for (let i = 0; i < 10; i++) await wrong(s.base, `10.0.0.${i}, 203.0.113.9`);
      expect(await wrong(s.base, "10.0.0.99, 203.0.113.9")).toBe(429);
    } finally {
      s.proc.kill();
    }
  });

  it("sem TRUST_PROXY, o cabeçalho é ignorado (não dá para fugir ao bloqueio)", async () => {
    const s = await startServer({ SYNC_CODE: CODE });
    try {
      for (let i = 0; i < 10; i++) await wrong(s.base, `10.0.0.${i}`);
      expect(await wrong(s.base, "10.0.0.200")).toBe(429);
    } finally {
      s.proc.kill();
    }
  });
});
```

The module-level `proc`/`base` variables in that test file belong to the main
server; do not reuse them. `startServer` returns `{ proc, base }` — use the local
`s` as shown.

**Verify**: `npx vitest run tests/server-sync.test.ts` → the first two new tests
FAIL (first: the good code is blocked with 429; second: not blocked, or 429 not
reached for a different reason), the third passes. If the first passes already,
STOP.

### Step 2: Implement `clientAddress` in `server.mjs`

Near the other env constants add:

```js
const TRUST_PROXY = process.env.TRUST_PROXY === "1";
```

Add next to `digest`/`checkCode`:

```js
/** Endereço do cliente: com TRUST_PROXY, o último valor de X-Forwarded-For (o do proxy de confiança). */
function clientAddress(req) {
  if (TRUST_PROXY) {
    const forwarded = String(req.headers["x-forwarded-for"] ?? "").split(",").pop()?.trim();
    if (forwarded) return forwarded;
  }
  return req.socket.remoteAddress ?? "?";
}
```

In `authorize`, replace `const ip = req.socket.remoteAddress ?? "?";` with
`const ip = clientAddress(req);`. Change nothing else in the file.

**Verify**: `npx vitest run tests/server-sync.test.ts` → all pass.

### Step 3: Document it

In `README.md`:
- Add a row to the "Variáveis do contentor" table:
  `| \`TRUST_PROXY=1\` | Opcional; atrás de um proxy reverso, conta as tentativas erradas por cliente (cabeçalho \`X-Forwarded-For\`) em vez de bloquear todos. Só ative se o proxy for o único caminho até ao contentor |`
- In the "Segurança" section, change the first bullet's last sentence so it says the block is per address and, behind a proxy, needs `TRUST_PROXY=1` to be per client. Keep it to one sentence.

**Verify**: `grep -n "TRUST_PROXY" README.md server/server.mjs` → matches in both.

### Step 4: Full verification

**Verify**: `npm run typecheck` → exit 0; `npm test` → exit 0.

## Test plan

- 3 new tests as above (isolated server per test): per-client blocking, only-rightmost trust, header ignored without the env var.
- Pattern: the `startServer(env)` usage in the existing "sem SYNC_CODE" test at `tests/server-sync.test.ts` (the `off` server).

## Done criteria

- [ ] `npm run typecheck` exits 0
- [ ] `npm test` exits 0 with 3 more passing tests
- [ ] `grep -n "remoteAddress" server/server.mjs` shows only the fallback inside `clientAddress`
- [ ] `git status` shows only `server/server.mjs`, `tests/server-sync.test.ts`, `README.md` changed
- [ ] `plans/README.md` status row updated

## STOP conditions

- The first new test passes before the fix.
- Spawning extra servers in tests is flaky or conflicts with the main server's port (report; do not change the port logic in `startServer`).
- `authorize` is used from somewhere other than the places shown, with a different notion of identity.

## Maintenance notes

- With `TRUST_PROXY=1` and a proxy that does **not** append to `X-Forwarded-For`, a client could spoof the whole header; the README line says to enable it only when the proxy is the only path to the container. With a chain of two proxies, "rightmost" is the inner proxy, which re-introduces the shared-bucket problem; an `N`-hops setting is deliberately not added (YAGNI).
- Reviewer: confirm `/api/cron/tick` with a valid `CRON_SECRET` still bypasses `authorize` (unchanged).
