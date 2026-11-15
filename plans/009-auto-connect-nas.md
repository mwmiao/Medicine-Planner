# Plan 009: The phone connects to the NAS by itself (opt-in), and the "Ligar ao NAS" button leaves the Today screen

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 75400ad..HEAD -- server/server.mjs src/lib/sync/engine.ts src/lib/sync/index.ts src/app/page.tsx src/lib/i18n/pt.ts src/lib/i18n/zh.ts tests/server-sync.test.ts tests/sync-engine.test.ts README.md`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED (hands out the sync secret when the opt-in flag is set)
- **Depends on**: none (plans 001–008 are already merged on `main`)
- **Category**: direction (usability)
- **Planned at**: commit `75400ad`, 2026-11-15

## Why this matters

The owner does not want their mother to tap "Ligar ao NAS" / "连接 NAS". Today
the app only syncs after someone types the sync code on that copy of the app;
the code is stored in `localStorage`, which on iOS is separate for Safari and
the home-screen app and can be cleared. The owner decided (explicitly chosen
over a one-time setup link) that the **server hands the code to the app when an
opt-in environment variable is set**. After this plan: with `AUTO_CONNECT=1` on
the NAS, any copy of the app that is not connected fetches the code from
`GET /api/connect` and connects silently (merging, never overwriting — see plan 001);
a copy whose stored code went stale reconnects with the fresh one; the Today
screen no longer shows the connect prompt/button. Default is OFF, so existing
deployments are unchanged.

**Security trade-off (must be documented, see Step 6)**: with the flag on,
anyone who can open the app's URL can read the sync code and therefore all data.
It is only appropriate when the URL is private (home Wi-Fi, VPN, or behind an
access-control layer such as Cloudflare Access).

## Current state

`server/server.mjs` (plain Node ESM). Env constants at the top:

```js
const SYNC_CODE = process.env.SYNC_CODE ?? "";
...
const TRUST_PROXY = process.env.TRUST_PROXY === "1";
const INTERNAL_CRON = process.env.INTERNAL_CRON !== "off";
```

`handleApi(req, res, url)` starts with:

```js
async function handleApi(req, res, url) {
  if (url.pathname === "/api/health") {
    return sendJson(res, 200, { ok: true, sync: Boolean(SYNC_CODE), push: Boolean(push) });
  }
  if (url.pathname === "/api/cron/tick") { ...
```

`sendJson` already sets `Cache-Control: no-store`. The startup line (tests wait for the text `Medicine Planner on`):

```js
console.log(`Medicine Planner on :${PORT} — static: ${ROOT} — data: ${DATA_DIR} — sync ${SYNC_CODE ? "ON" : "OFF (set SYNC_CODE)"}`);
```

`src/lib/sync/engine.ts` — `SyncEngine` class. Relevant parts:

```ts
const K = { code: "mp.sync.code", revision: "mp.sync.revision", dirty: ..., force: ..., tombstones: ..., lastSyncedAt: ... } as const;
constructor(private readonly db: PlannerDB, private readonly kv: KeyValue, private readonly io: NasIo = {}) {
  this.state = { status: kv.get(K.code) ? "idle" : "off", ... };
}
get connected(): boolean { return Boolean(this.kv.get(K.code)); }

async connect(code: string): Promise<SyncStatus> {
  try { await this.request("GET", code.trim()); } catch (e) { return this.errorStatus(e); }
  this.kv.set(K.code, code.trim());
  this.kv.remove(K.revision); // primeira vez: junta em vez de substituir
  this.kv.remove(K.force);
  await this.syncNow();
  return this.state.status;
}

disconnect(): void {
  for (const k of [K.code, K.revision, K.force, K.lastSyncedAt]) this.kv.remove(k);
  this.setState({ status: "off", lastSyncedAt: undefined });
}
```

`NasIo = { baseUrl?: string; fetchFn?: typeof fetch }` (in `src/lib/sync/nas.ts`); the engine's private `request` uses `this.io`. `errorStatus(e)` maps HttpError 401/429 → `"unauthorized"`. `isObj(v)` helper exists in `engine.ts`. `syncAvailable(baseUrl, fetchFn)` at the bottom of the file is the exemplar for a defensive `fetch` + `res.ok` + `res.json()` in try/catch — match it.

`src/lib/sync/index.ts` — `startSync()`:

```ts
export function startSync(): () => void {
  const e = getSync();
  e.installHooks();
  void e.syncNow();
  const onVisible = () => document.visibilityState === "visible" && void e.syncNow();
  const onOnline = () => void e.syncNow();
  ...
```

`src/app/page.tsx` (Today) — the prompt to remove and its imports:

```tsx
import { useSyncAvailable, useSyncState } from "@/lib/sync";
...
const syncAvailable = useSyncAvailable();
const sync = useSyncState();
...
{syncAvailable && sync.status === "off" ? (
  <div className="mb-4">
    <Notice tone="warn">
      <p className="font-bold">☁️ {m.sync.todayPrompt}</p>
      <div className="mt-2">
        <LinkButton href="/settings/#family" block>{m.sync.todayPromptAction}</LinkButton>
      </div>
    </Notice>
  </div>
) : sync.status === "unauthorized" || sync.status === "unavailable" || sync.status === "error" ? (
  <div className="mb-4"> <Notice tone="error"> <a href="/settings/#family" className="underline">{m.sync.todayProblem}</a> </Notice> </div>
) : null}
```

`m.sync.todayPrompt` / `todayPromptAction` exist in `src/lib/i18n/pt.ts` (`"Guarde os medicamentos no NAS para não os perder."`, `"Ligar ao NAS"`) and `zh.ts` (`"把药品资料保存到 NAS，就不会丢失。"`, `"连接 NAS"`) and are used nowhere else (verified with grep at planning time).

Tests: `tests/sync-engine.test.ts` has `memoryKv()`, exported `fakeNas(initial)` returning `{ store, fetchFn }` (the fake checks `Authorization: Bearer fake-code`; constant `CODE = "fake-code"`), and uses `new SyncEngine(db, memoryKv(), { fetchFn: nas.fetchFn })`. `tests/server-sync.test.ts` has `startServer(env)` returning `{ proc, base }` (spawns the real server, random port) and `CODE`; follow the existing `describe("bloqueio por endereço atrás de proxy", ...)` for the start/kill pattern (`try { ... } finally { s.proc.kill(); }`).

Conventions: Portuguese comments, 2-space indent, double quotes. The family-settings card (`SyncSection.tsx`) with the manual code form stays as the fallback for NAS installs without `AUTO_CONNECT`.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Typecheck | `npm run typecheck` | exit 0 |
| All tests | `npm test` | exit 0 (87 passed at planning time) |
| Server tests | `npx vitest run tests/server-sync.test.ts` | all pass |
| Engine tests | `npx vitest run tests/sync-engine.test.ts` | all pass |

## Scope

**In scope**:
- `server/server.mjs`
- `src/lib/sync/engine.ts`
- `src/lib/sync/index.ts`
- `src/app/page.tsx`
- `src/lib/i18n/pt.ts`, `src/lib/i18n/zh.ts` (delete the two unused keys)
- `tests/server-sync.test.ts`, `tests/sync-engine.test.ts`
- `README.md` (one table row, one security bullet)

**Out of scope**:
- `src/components/SyncSection.tsx` (manual form stays), `server/push.mjs`, `src/lib/push.ts`, `RemindersSection.tsx` (enabling reminders still needs the iOS permission tap and cannot be automated).
- The Docker/compose files and the compose example in the README.
- Any change to authorization of `/api/data` or `/api/push/*`, the lockout logic, or `/api/health`.

## Git workflow

- Branch: `advisor/009-auto-connect-nas`
- One commit, short imperative message (history style: "Keep push subscription on 403 and repair a missing one"); end it with `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.
- Do NOT push or open a PR.

## Steps

### Step 1: Failing server tests

Append to `tests/server-sync.test.ts` a `describe("ligação automática", ...)`:

```ts
describe("ligação automática", () => {
  async function get(base: string, path: string, method = "GET") {
    const res = await fetch(`${base}${path}`, { method });
    return { status: res.status, body: await res.json().catch(() => null) };
  }

  it("com AUTO_CONNECT=1 entrega o código sem autenticação", async () => {
    const s = await startServer({ SYNC_CODE: CODE, AUTO_CONNECT: "1" });
    try {
      const r = await get(s.base, "/api/connect");
      expect(r.status).toBe(200);
      expect(r.body).toEqual({ code: CODE });
      expect((await get(s.base, "/api/connect", "POST")).status).toBe(404);
    } finally {
      s.proc.kill();
    }
  });

  it("sem AUTO_CONNECT não entrega o código", async () => {
    const s = await startServer({ SYNC_CODE: CODE });
    try {
      expect((await get(s.base, "/api/connect")).status).toBe(404);
    } finally {
      s.proc.kill();
    }
  });

  it("com AUTO_CONNECT mas sem SYNC_CODE não há nada para entregar", async () => {
    const s = await startServer({ SYNC_CODE: "", AUTO_CONNECT: "1" });
    try {
      expect((await get(s.base, "/api/connect")).status).toBe(404);
    } finally {
      s.proc.kill();
    }
  });
});
```

**Verify**: `npx vitest run tests/server-sync.test.ts` → the first new test fails (404 instead of 200); the other two may already pass. Expected.

### Step 2: Server endpoint

In `server/server.mjs`: add `const AUTO_CONNECT = process.env.AUTO_CONNECT === "1";` next to `TRUST_PROXY`. In `handleApi`, immediately after the `/api/health` block, add:

```js
  if (url.pathname === "/api/connect") {
    // Opcional (AUTO_CONNECT=1): entrega o código para a app se ligar sozinha. Qualquer pessoa que abra o endereço o recebe.
    if (!AUTO_CONNECT || !SYNC_CODE || req.method !== "GET") return sendJson(res, 404, { error: "not_found" });
    return sendJson(res, 200, { code: SYNC_CODE });
  }
```

Extend the startup `console.log` **on the same line** (keep the text `Medicine Planner on` first) by appending:
`` ` — auto-connect ${AUTO_CONNECT && SYNC_CODE ? "ON (anyone who can open this URL gets the sync code)" : "off"}` ``.

**Verify**: `npx vitest run tests/server-sync.test.ts` → all pass.

### Step 3: Failing engine tests

In `tests/sync-engine.test.ts` append (reuse `memoryKv`, `fakeNas`, `CODE`, `testDb`, `input`; add imports only if missing):

```ts
/** Junta ao NAS falso o endereço /api/connect (código ou 404). */
function withConnect(nas: ReturnType<typeof fakeNas>, code: string | null) {
  let calls = 0;
  const fetchFn = ((url: string | URL | Request, init?: RequestInit) => {
    if (String(url).endsWith("/api/connect")) {
      calls++;
      return Promise.resolve(code ? Response.json({ code }) : Response.json({ error: "not_found" }, { status: 404 }));
    }
    return nas.fetchFn(url, init);
  }) as typeof fetch;
  return { fetchFn, calls: () => calls };
}

describe("ligação automática ao NAS", () => {
  it("liga-se sozinha quando o servidor entrega o código", async () => {
    const nas = fakeNas();
    const io = withConnect(nas, CODE);
    const kv = memoryKv();
    const engine = new SyncEngine(testDb(), kv, { fetchFn: io.fetchFn });
    expect(engine.getState().status).toBe("off");
    await engine.autoConnect();
    expect(engine.getState().status).toBe("idle");
    expect(kv.get("mp.sync.code")).toBe(CODE);
  });

  it("não faz nada se o servidor não oferece o código (404)", async () => {
    const io = withConnect(fakeNas(), null);
    const engine = new SyncEngine(testDb(), memoryKv(), { fetchFn: io.fetchFn });
    await engine.autoConnect();
    expect(engine.getState().status).toBe("off");
  });

  it("depois de desligar à mão não volta a ligar sozinha, mas a ligação manual limpa isso", async () => {
    const nas = fakeNas();
    const io = withConnect(nas, CODE);
    const engine = new SyncEngine(testDb(), memoryKv(), { fetchFn: io.fetchFn });
    await engine.autoConnect();
    engine.disconnect();
    const before = io.calls();
    await engine.autoConnect();
    expect(engine.getState().status).toBe("off");
    expect(io.calls()).toBe(before); // nem sequer pergunta ao servidor
    expect(await engine.connect(CODE)).toBe("idle");
    engine.disconnect();
    expect(engine.getState().status).toBe("off");
  });

  it("um código guardado que deixou de servir é substituído pelo novo", async () => {
    const nas = fakeNas();
    const io = withConnect(nas, CODE);
    const kv = memoryKv();
    kv.set("mp.sync.code", "codigo-antigo");
    const engine = new SyncEngine(testDb(), kv, { fetchFn: io.fetchFn });
    await engine.syncNow();
    expect(engine.getState().status).toBe("unauthorized");
    await engine.autoConnect();
    expect(engine.getState().status).toBe("idle");
    expect(kv.get("mp.sync.code")).toBe(CODE);
  });

  it("já ligada e a funcionar, não pergunta ao servidor", async () => {
    const nas = fakeNas();
    const io = withConnect(nas, CODE);
    const engine = new SyncEngine(testDb(), memoryKv(), { fetchFn: io.fetchFn });
    await engine.connect(CODE);
    await engine.autoConnect();
    expect(io.calls()).toBe(0);
  });
});
```

(The last test of the third case relies on `connect` clearing the "desligado à mão" flag; the final `disconnect()` + `status off` line only confirms the engine still works. If `engine.syncNow()` in the fourth test does not end in `"unauthorized"` — check `errorStatus` — STOP and report.)

**Verify**: `npx vitest run tests/sync-engine.test.ts` → the new tests fail (`autoConnect is not a function`); existing ones pass.

### Step 4: Engine `autoConnect`

In `src/lib/sync/engine.ts`:

1. Add to `K`: `autoOff: "mp.sync.autoOff",`.
2. In `connect(code)`, after the code is validated and stored, add `this.kv.remove(K.autoOff);` (a manual connection re-enables automatic reconnection).
3. In `disconnect()`, add `this.kv.set(K.autoOff, "1");` (do not add `autoOff` to the removal list).
4. Add a field `private autoRunning: Promise<void> | null = null;` and `private autoUnavailable = false;`, and the method (place right after `disconnect()`):

```ts
  /**
   * NAS com AUTO_CONNECT=1: pede o código ao servidor e liga-se sem o utilizador escrever nada.
   * Nunca lança erro. Não faz nada se já está ligada e a funcionar, se o servidor não oferece o
   * código, ou se a ligação foi desfeita à mão.
   */
  autoConnect(): Promise<void> {
    if (this.connected && this.state.status !== "unauthorized") return Promise.resolve();
    if (this.kv.get(K.autoOff) === "1" || this.autoUnavailable) return Promise.resolve();
    this.autoRunning ??= this.tryAutoConnect().finally(() => {
      this.autoRunning = null;
    });
    return this.autoRunning;
  }

  private async tryAutoConnect(): Promise<void> {
    const { baseUrl = "", fetchFn = (...a: Parameters<typeof fetch>) => fetch(...a) } = this.io;
    try {
      const res = await fetchFn(`${baseUrl}/api/connect`, { cache: "no-store" });
      if (!res.ok) {
        if (res.status === 404) this.autoUnavailable = true; // não oferece: não voltar a perguntar nesta sessão
        return;
      }
      const body: unknown = await res.json();
      if (isObj(body) && typeof body.code === "string" && body.code.trim()) await this.connect(body.code);
    } catch {
      // sem rede ou resposta inválida: tenta outra vez mais tarde
    }
  }
```

**Verify**: `npx vitest run tests/sync-engine.test.ts` → all pass. `npm run typecheck` → exit 0.

### Step 5: Call it at startup, and remove the Today prompt

In `src/lib/sync/index.ts` `startSync()`: after `void e.syncNow();` add `void e.autoConnect();`; in `onVisible` and `onOnline` also call `void e.autoConnect()` (keep the existing `syncNow` calls). Do not add it to the 60-second interval.

In `src/app/page.tsx`: delete the `syncAvailable && sync.status === "off"` branch so the block becomes only the error notice:

```tsx
{sync.status === "unauthorized" || sync.status === "unavailable" || sync.status === "error" ? (
  <div className="mb-4">
    <Notice tone="error">
      <a href="/settings/#family" className="underline">{m.sync.todayProblem}</a>
    </Notice>
  </div>
) : null}
```

Remove `const syncAvailable = useSyncAvailable();` and `useSyncAvailable` from the import (leave `useSyncState`). Leave `LinkButton`/`Notice` imports if still used elsewhere in the file (they are; confirm with typecheck). In `pt.ts` and `zh.ts` delete the two now-unused keys `todayPrompt` and `todayPromptAction` from the `sync` block.

**Verify**: `npm run typecheck` → exit 0; `grep -rn "todayPrompt" src` → no matches; `npm test` → exit 0.

### Step 6: Document it

In `README.md`: add a row to the "Variáveis do contentor" table:
`| \`AUTO_CONNECT=1\` | Opcional; a app liga-se sozinha ao NAS (o servidor entrega o código em \`GET /api/connect\`, sem o utilizador escrever nada). **Quem conseguir abrir o endereço da app recebe o código e todos os dados** — use só se o endereço for privado (rede de casa, VPN ou atrás de Cloudflare Access) |`
and add a bullet to the "Segurança" list: `- Com \`AUTO_CONNECT=1\` o código de sincronização deixa de ser um segredo para quem chega ao endereço da app; não o ative num endereço público sem controlo de acesso.`

**Verify**: `grep -n "AUTO_CONNECT" README.md` → two matches.

### Step 7: Full verification

`npm run typecheck` → exit 0. `npm test` → exit 0 (87 + 3 server + 5 engine = 95 tests). `git status` → only in-scope files.

## Test plan

Server: flag on / flag off / flag on without code, and non-GET → 404. Engine:
auto-connect succeeds, endpoint 404 is harmless, manual disconnect is respected
(and doesn't hit the server), stale code is replaced, already-connected does no
request. Pattern: existing "primeira ligação ao NAS" tests and the proxy-lockout
`describe`. The browser/iPhone behaviour is not covered by automation: say so.

## Done criteria

- [ ] `npm run typecheck` exits 0; `npm test` exits 0 with the 8 new tests passing
- [ ] `grep -rn "todayPrompt" src` returns no matches
- [ ] `grep -n "AUTO_CONNECT" server/server.mjs README.md` shows the constant, the endpoint, and both README mentions
- [ ] `git diff --stat -- src/components server/push.mjs src/lib/push.ts` shows nothing
- [ ] No files outside the in-scope list changed
- [ ] `plans/README.md` status row updated

## STOP conditions

- Code in "Current state" doesn't match.
- A step's verification fails twice.
- The "stale code" test cannot reach `"unauthorized"` (see Step 3).
- You find the manual-connect form in `SyncSection.tsx` would need a change.
- `useSyncAvailable` turns out to be used elsewhere in `page.tsx` that you'd have to rework.

## Maintenance notes

- **Security**: `/api/connect` is intentionally unauthenticated and bypasses the wrong-code lockout. It exists only when the owner sets `AUTO_CONNECT=1`. Reviewer: confirm the default is off and that no other route returns the code.
- Rotating `SYNC_CODE` on the NAS: phones in the `"unauthorized"` state fetch the new code on next open/return-to-app/online event.
- Real-device checks the unit tests cannot cover: with `AUTO_CONNECT=1` on the NAS and the app opened fresh on an iPhone (Safari and home-screen copy), the connection and the first sync should happen with no taps, and the Today screen must show no connect button.
- Reminders (Web Push) still need the one-time "打开提醒" tap for the iOS permission prompt; auto-connect only removes the NAS step they depend on.
