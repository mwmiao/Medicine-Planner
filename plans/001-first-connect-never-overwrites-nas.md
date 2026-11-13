# Plan 001: Connecting a phone for the first time never overwrites the NAS

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 60b8a06..HEAD -- src/lib/sync/engine.ts tests/`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `60b8a06`, 2026-11-13

## Why this matters

This is a medication app for an elderly person; the NAS copy is the family's
safety net. "Apagar todos os dados" and "Importar dados" call
`markReplaceAll()`, which sets a persistent "force" flag meaning *this phone's
data is the truth, overwrite the NAS*. The flag is set **even when the phone is
not connected to the NAS**. When the phone later connects, the first sync sees
the stale flag and force-pushes the phone's (possibly empty) data over the
NAS, instead of the documented "first connection merges both sides". Result:
the NAS history is wiped by a phone that was cleared before connecting.

## Current state

Files:
- `src/lib/sync/engine.ts` — `SyncEngine`; `markReplaceAll()` at ~line 141, `connect()` at ~line 150, `disconnect()` at ~line 162, `attempt()` at ~line 208.
- `src/lib/sync/plan.ts` — pure `planSync`; `force: true` always wins and returns `{kind:"push", force:true}`.
- `tests/server-sync.test.ts` — existing end-to-end tests against a real spawned server (do not modify).
- `tests/helpers.ts` — exports `testDb()` (fresh fake-indexeddb Dexie DB) and `input()` (medication input factory).

Code today (`engine.ts`):

```ts
/** Depois de importar ou apagar tudo: a cópia deste telemóvel passa a ser a verdade. */
markReplaceAll(): void {
  this.kv.set(K.force, "1");
  this.kv.set(K.tombstones, JSON.stringify(emptyTombstones()));
  if (this.connected) this.schedule(500);
}

async connect(code: string): Promise<SyncStatus> {
  try {
    await this.request("GET", code.trim());
  } catch (e) {
    return this.errorStatus(e);
  }
  this.kv.set(K.code, code.trim());
  this.kv.remove(K.revision); // primeira vez: junta em vez de substituir
  await this.syncNow();
  return this.state.status;
}

disconnect(): void {
  for (const k of [K.code, K.revision, K.force, K.lastSyncedAt]) this.kv.remove(k);
  ...
}
```

Conventions: Portuguese comments, short; tests are Vitest in `tests/`, Portuguese test names (see `tests/sync-merge.test.ts` for a pure-style exemplar and `tests/server-sync.test.ts` for the engine style, including `memoryKv()`).

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| One test file | `npx vitest run tests/sync-engine.test.ts` | all pass |
| All tests | `npm test` | exit 0 (66+ tests) |
| Typecheck | `npm run typecheck` | exit 0, no output |

## Scope

**In scope**:
- `src/lib/sync/engine.ts`
- `tests/sync-engine.test.ts` (create)

**Out of scope**:
- `src/lib/sync/plan.ts`, `merge.ts` — logic is right; the flag lifecycle is the bug.
- `src/app/settings/page.tsx` — callers of `markReplaceAll()` stay as they are.
- Any server file.

## Git workflow

- Branch: `advisor/001-first-connect-no-overwrite`
- Commit style (see `git log`): short imperative sentence, e.g. `Add optional NAS sync so data survives Safari/home-screen split`.
- Do NOT push or open a PR.

## Steps

### Step 1: Create the test file with a fake NAS and the failing regression test

Create `tests/sync-engine.test.ts`. It uses an in-memory fake of the NAS HTTP API
injected through the `SyncEngine` constructor's third argument
(`{ fetchFn }`, type `NasIo` from `src/lib/sync/nas.ts`). The engine calls
`fetchFn("/api/data", { method, headers: { Authorization: "Bearer <code>", ... }, body })`.

```ts
import { describe, expect, it } from "vitest";
import { deleteAllData } from "@/lib/backup";
import type { KeyValue } from "@/lib/kv";
import { createMedication } from "@/lib/medications";
import { SyncEngine } from "@/lib/sync/engine";
import { emptyTombstones, type SyncData } from "@/lib/sync/merge";
import { input, testDb } from "./helpers";

const CODE = "fake-code";

function memoryKv(): KeyValue {
  const m = new Map<string, string>();
  return { get: (k) => m.get(k) ?? null, set: (k, v) => void m.set(k, v), remove: (k) => void m.delete(k) };
}

/** NAS falso em memória: mesma API de /api/data (revisão + 409 em conflito). */
export function fakeNas(initial: SyncData | null = null) {
  const store = { revision: initial ? 1 : 0, updatedAt: null as string | null, data: initial as SyncData | null };
  const json = (status: number, body: unknown) => Promise.resolve(Response.json(body, { status }));
  const fetchFn = (async (url: string | URL | Request, init?: RequestInit) => {
    const headers = init?.headers as Record<string, string>;
    if (headers.Authorization !== `Bearer ${CODE}`) return Response.json({ error: "bad_code" }, { status: 401 });
    if (init?.method === "GET") return json(200, store);
    const body = JSON.parse(String(init?.body)) as { baseRevision: number; force: boolean; data: SyncData };
    if (!body.force && body.baseRevision !== store.revision) return json(409, { error: "conflict", ...store });
    store.revision++;
    store.data = body.data;
    return json(200, { revision: store.revision, updatedAt: null });
  }) as typeof fetch;
  return { store, fetchFn };
}
```

(Keep `fakeNas` exported from the test file only if plan 002 appends to the same
file — it does, so keep it in this file and do not move it.)

Add the regression test:

```ts
describe("primeira ligação ao NAS", () => {
  it("apagar tudo antes de ligar não apaga o NAS (junta em vez de substituir)", async () => {
    // O NAS já tem um medicamento (de outro telemóvel).
    const seedDb = testDb();
    const seed = await createMedication(input({ name: "Ben-u-ron" }), new Date(), seedDb);
    const nasData: SyncData = {
      schema: 1,
      medications: [seed],
      doseLogs: [],
      infarmedCache: [],
      tombstones: emptyTombstones(),
    };
    const nas = fakeNas(nasData);

    // Este telemóvel apaga tudo ANTES de se ligar ao NAS.
    const db = testDb();
    const engine = new SyncEngine(db, memoryKv(), { fetchFn: nas.fetchFn });
    engine.installHooks();
    await deleteAllData(db);
    engine.markReplaceAll();

    expect(await engine.connect(CODE)).toBe("idle");
    expect(nas.store.data?.medications.map((m) => m.name)).toEqual(["Ben-u-ron"]);
    expect((await db.medications.toArray()).map((m) => m.name)).toEqual(["Ben-u-ron"]);
  });

  it("apagar tudo já ligado continua a substituir o NAS", async () => {
    const seedDb = testDb();
    const seed = await createMedication(input({ name: "Ben-u-ron" }), new Date(), seedDb);
    const nas = fakeNas({ schema: 1, medications: [seed], doseLogs: [], infarmedCache: [], tombstones: emptyTombstones() });
    const db = testDb();
    const engine = new SyncEngine(db, memoryKv(), { fetchFn: nas.fetchFn });
    engine.installHooks();
    expect(await engine.connect(CODE)).toBe("idle");
    expect(await db.medications.count()).toBe(1);

    await deleteAllData(db);
    engine.markReplaceAll();
    await engine.syncNow();
    expect(nas.store.data?.medications).toEqual([]);
  });
});
```

Note: `deleteAllData` and `markReplaceAll` are what `src/app/settings/page.tsx`
calls (lines ~78 and ~193), in that order.

**Verify**: `npx vitest run tests/sync-engine.test.ts` → the first test FAILS
(expected `["Ben-u-ron"]`, received `[]`), the second passes. If the first test
passes before any fix, STOP (see conditions).

### Step 2: Fix the flag lifecycle in `engine.ts`

Two small changes (both, belt and braces):

1. `markReplaceAll()` sets the force flag only when connected:

```ts
markReplaceAll(): void {
  this.kv.set(K.tombstones, JSON.stringify(emptyTombstones()));
  if (!this.connected) return; // sem NAS ainda: na primeira ligação os dados juntam-se
  this.kv.set(K.force, "1");
  this.schedule(500);
}
```

2. `connect()` discards any stale flag before the first sync:

```ts
this.kv.set(K.code, code.trim());
this.kv.remove(K.revision); // primeira vez: junta em vez de substituir
this.kv.remove(K.force);
await this.syncNow();
```

Do not change anything else in the file.

**Verify**: `npx vitest run tests/sync-engine.test.ts` → both tests pass.

### Step 3: Full verification

**Verify**: `npm run typecheck` → exit 0. `npm test` → exit 0, all tests pass (baseline was 66 tests; now 68).

## Test plan

- `tests/sync-engine.test.ts` (new, 2 tests): the regression (replace-all before connect merges), and the preserved behavior (replace-all while connected still replaces the NAS).
- Structural pattern: `tests/server-sync.test.ts` (`memoryKv`, `testDb`, engine usage).

## Done criteria

- [ ] `npm run typecheck` exits 0
- [ ] `npm test` exits 0; `tests/sync-engine.test.ts` has 2 passing tests
- [ ] Before step 2 the first new test failed; after it, passes
- [ ] `git status` shows only `src/lib/sync/engine.ts` and `tests/sync-engine.test.ts` changed
- [ ] `plans/README.md` status row updated

## STOP conditions

- The first new test passes *before* the fix (the bug is already gone or the fake NAS does not mimic the engine's calls) — report instead of proceeding.
- `engine.ts` no longer contains `markReplaceAll` with `K.force` as shown above.
- `Response.json` is not available in the vitest environment (use `new Response(JSON.stringify(...), { status, headers: {"Content-Type":"application/json"} })` instead — that is allowed, not a stop).
- The fix seems to require touching `plan.ts` or the UI.

## Maintenance notes

- Plan 002 appends to `tests/sync-engine.test.ts` and reuses `fakeNas`; keep that helper's shape.
- Reviewer: confirm "Importar dados" before connecting now merges with the NAS rather than replacing it. That is intended (the README promises the first connection merges), but it means an import on a not-yet-connected phone cannot be used to reset the NAS; the user would import after connecting.
