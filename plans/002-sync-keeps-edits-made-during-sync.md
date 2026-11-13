# Plan 002: Edits made while a sync is running are never erased

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 60b8a06..HEAD -- src/lib/sync/engine.ts tests/sync-engine.test.ts`
> Plan 001 is expected to have changed these files (it adds `tests/sync-engine.test.ts`
> and edits `markReplaceAll`/`connect`). Any *other* difference in the excerpts
> below is a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED
- **Depends on**: plans/001-first-connect-never-overwrites-nas.md (same files; reuses its `fakeNas` test helper)
- **Category**: bug
- **Planned at**: commit `60b8a06`, 2026-11-13

## Why this matters

The app's core promise is that a recorded dose is never lost. A sync cycle is:
read local data → send to NAS (network wait) → **overwrite the phone's whole
database with the snapshot taken before the wait**. Anything the user does in
that wait (e.g. taps "Já tomei") is erased by the overwrite, and the next sync
reads the already-erased database, so the dose is lost for good. Deletes made in
the window also lose their tombstone. The wait is one network round trip, so it
is most likely on slow mobile connections — exactly the real-world case.

## Current state

File: `src/lib/sync/engine.ts` (`SyncEngine`). Local changes are tracked by Dexie
hooks (`installHooks`) that bump a counter in `localStorage` (`K.dirty`) via
`onLocalChange()`, unless `this.applying` is true. Deletes also call
`addTombstone` which writes `K.tombstones` immediately.

```ts
private async attempt(): Promise<boolean> {
  const code = this.kv.get(K.code) ?? "";
  const remote = (await this.request("GET", code)) as Remote;
  const dirtyAtStart = Number(this.kv.get(K.dirty) ?? 0);
  const lastRevision = this.kv.get(K.revision);
  ...
  const plan = planSync({ local: await this.readLocal(), remote: remoteData, force: ..., pendingChanges: dirtyAtStart, firstTime: ... });

  if (plan.kind === "pull") {
    if (String(remote.revision) !== lastRevision) await this.applyLocal(plan.data);
    this.kv.set(K.revision, String(remote.revision));
    return true;
  }

  try {
    const saved = (await this.request("PUT", code, { baseRevision: remote.revision, force: plan.force, data: plan.data })) as Remote;
    this.kv.set(K.revision, String(saved.revision));
  } catch (e) {
    if (e instanceof HttpError && e.status === 409) return false;
    throw e;
  }
  await this.applyLocal(plan.data);
  this.kv.remove(K.force);
  // Só limpa as alterações pendentes se não houve outras durante a sincronização.
  if (Number(this.kv.get(K.dirty) ?? 0) === dirtyAtStart) this.kv.set(K.dirty, "0");
  else this.again = true;
  return true;
}

private async applyLocal(data: SyncData): Promise<void> {
  const db = this.db;
  this.applying = true;
  try {
    await db.transaction("rw", db.medications, db.doseLogs, db.infarmedCache, async () => {
      await Promise.all([db.medications.clear(), db.doseLogs.clear(), db.infarmedCache.clear()]);
      await db.medications.bulkPut(data.medications);
      await db.doseLogs.bulkPut(data.doseLogs);
      await db.infarmedCache.bulkPut(data.infarmedCache);
    });
  } finally {
    this.applying = false;
  }
  this.kv.set(K.tombstones, JSON.stringify(data.tombstones));
}
```

The bug: `applyLocal` clears the tables and writes `data` (a pre-wait snapshot);
edits made after `readLocal()` are destroyed. The `else this.again = true` branch
only schedules another sync *after* the edit is already gone.

**Chosen design** (do not redesign): do the "has anything changed locally since
this sync started?" check **inside the Dexie read-write transaction**, where no
other write can interleave. If it changed, **skip applying** and mark `again`:
the next attempt sees `dirty > 0`, merges local (with the edit) with the NAS, and
pushes. Merging is idempotent, so nothing is lost and no data is dropped. Also
move the `K.tombstones` write inside the transaction so a delete cannot slip
between the transaction and the write.

Why not merge-on-apply: for the *pull* path that would resurrect records after
another phone's "replace all" (which empties tombstones), breaking propagation.

Conventions: Portuguese comments; no new abstractions; match surrounding style.
Test exemplar: `tests/sync-engine.test.ts` from plan 001 (`fakeNas`, `memoryKv`).

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| This file's tests | `npx vitest run tests/sync-engine.test.ts` | all pass |
| All tests | `npm test` | exit 0 |
| Typecheck | `npm run typecheck` | exit 0, no output |

## Scope

**In scope**:
- `src/lib/sync/engine.ts` (`attempt`, `applyLocal` only)
- `tests/sync-engine.test.ts` (append)

**Out of scope**:
- `plan.ts`, `merge.ts`, `nas.ts`, `kv.ts`, the server.
- Do not change `onLocalChange`, `installHooks`, or the dirty-counter semantics.

## Git workflow

- Branch: `advisor/002-sync-keeps-midsync-edits` (after plan 001 is merged or on top of its branch)
- One commit; short imperative message.
- Do NOT push or open a PR.

## Steps

### Step 1: Write the failing race tests

Append to `tests/sync-engine.test.ts` (imports: add `markTaken` from `@/lib/doses`
and `deleteMedication` from `@/lib/medications`). Make a variant of `fakeNas`
that runs a hook just before answering a PUT. Do this by wrapping the
`fetchFn` the helper returns:

```ts
/** Chama `duringPut` a meio do PUT (simula o utilizador a tocar durante a sincronização). */
function withEditDuringPut(nas: ReturnType<typeof fakeNas>, duringPut: () => Promise<void>) {
  let done = false;
  const fetchFn = (async (url: string | URL | Request, init?: RequestInit) => {
    if (init?.method === "PUT" && !done) {
      done = true;
      await duringPut();
    }
    return nas.fetchFn(url, init);
  }) as typeof fetch;
  return fetchFn;
}
```

Tests (inside a new `describe("alterações durante a sincronização", ...)`):

1. **Dose marked taken during a push survives.** Setup: `nas = fakeNas(null)`; `db = testDb()`; create a medication in `db` (dirty, so the first sync pushes); engine with `fetchFn: withEditDuringPut(nas, () => markTaken(med.id, "2026-10-25T08:00", new Date(), db).then(() => undefined))`; `installHooks()`; `await engine.connect(CODE)`; then `await engine.syncNow(); await engine.syncNow();` (the follow-up sync is started by the engine itself; awaiting `syncNow()` twice lets it settle). Expect: `await db.doseLogs.count()` is `1` AND `nas.store.data?.doseLogs.length` is `1` AND `nas.store.data?.doseLogs[0].status` is `"taken"`.
2. **Delete during a push is not resurrected.** Same setup with two medications; during the PUT call `deleteMedication(second.id, db)`. After settling: `db.medications` has 1 row, and `nas.store.data?.medications` has 1 row (the deleted one is gone, via tombstone).
3. **Edit during a pull survives.** Setup: NAS has data (seed from another db as in plan 001 test) and the phone has no local changes (connect once, settle). Then bump the NAS (do a PUT through a second engine/db with a new medication so the NAS revision changes), and on the first phone use a `fetchFn` wrapper that, on its next `GET`, first calls `markTaken(...)` on the phone's db. Easiest implementation: wrap `nas.fetchFn` in a function that, on the 2nd GET of the phone's `syncNow()`, awaits an edit before returning. Expect after settling: the phone has both the new NAS medication and the dose log, and the NAS has the dose log.

If test 3 turns out to need more than ~25 lines of setup, keep tests 1 and 2 and
note in your report that 3 was skipped (that is allowed — tests 1 and 2 cover the
push path where the bug occurs; the pull path is covered by the in-transaction
check, which is the same code).

**Verify**: `npx vitest run tests/sync-engine.test.ts` → tests 1 and 2 FAIL
(dose / delete lost) and the plan-001 tests still pass. If they pass before the
fix, STOP.

### Step 2: Make `applyLocal` skip when local changed, atomically

Change the signature and body of `applyLocal` to take the dirty count at the
start of this sync and return whether it applied:

```ts
/**
 * Substitui os dados do telemóvel pela versão juntada (sem registar como alteração local).
 * Se o utilizador alterou algo desde o início desta sincronização, não substitui nada
 * (devolve false): a próxima sincronização junta essa alteração e envia-a.
 */
private async applyLocal(data: SyncData, dirtyAtStart: number): Promise<boolean> {
  const db = this.db;
  this.applying = true;
  try {
    return await db.transaction("rw", db.medications, db.doseLogs, db.infarmedCache, async () => {
      // Dentro da transação nenhuma outra escrita se pode intercalar.
      if (Number(this.kv.get(K.dirty) ?? 0) !== dirtyAtStart) return false;
      await Promise.all([db.medications.clear(), db.doseLogs.clear(), db.infarmedCache.clear()]);
      await db.medications.bulkPut(data.medications);
      await db.doseLogs.bulkPut(data.doseLogs);
      await db.infarmedCache.bulkPut(data.infarmedCache);
      this.kv.set(K.tombstones, JSON.stringify(data.tombstones));
      return true;
    });
  } finally {
    this.applying = false;
  }
}
```

(The `this.kv.set(K.tombstones, ...)` line moves *into* the transaction; delete
the old line after the `try/finally`.)

Caveat to verify, not assume: `this.applying` is true while the transaction runs;
hooks of *other* writers run inside their own (serialized) transactions, so they
cannot observe `applying === true`. If a test shows an edit being treated as
"applying", STOP.

### Step 3: Update both callers in `attempt()`

Pull path:

```ts
if (plan.kind === "pull") {
  if (String(remote.revision) !== lastRevision) {
    // Alterado entretanto: não adota o NAS agora; a próxima tentativa junta tudo.
    if (!(await this.applyLocal(plan.data, dirtyAtStart))) {
      this.again = true;
      return true;
    }
  }
  this.kv.set(K.revision, String(remote.revision));
  return true;
}
```

Push path (after the successful PUT):

```ts
const applied = await this.applyLocal(plan.data, dirtyAtStart);
this.kv.remove(K.force);
if (!applied) {
  this.again = true; // há alterações novas: a próxima sincronização junta-as e envia-as
  return true;
}
// Só limpa as alterações pendentes se não houve outras durante a sincronização.
if (Number(this.kv.get(K.dirty) ?? 0) === dirtyAtStart) this.kv.set(K.dirty, "0");
else this.again = true;
return true;
```

`K.revision` is already set to the saved revision before this point (unchanged).
Do not touch anything else.

**Verify**: `npx vitest run tests/sync-engine.test.ts` → all pass.

### Step 4: Full verification

**Verify**: `npm run typecheck` → exit 0. `npm test` → exit 0 (including `tests/server-sync.test.ts`, which exercises the real server path end to end).

## Test plan

- New tests as in Step 1 (2–3). They simulate the user acting during the network wait by running an edit inside the fake `fetchFn`.
- Existing coverage that must stay green: `tests/server-sync.test.ts` (Safari ↔ home-screen propagation, undo, delete), `tests/sync-merge.test.ts`, `tests/sync-plan.test.ts`.

## Done criteria

- [ ] `npm run typecheck` exits 0
- [ ] `npm test` exits 0
- [ ] New race tests failed before Step 2 and pass after
- [ ] `grep -n "applyLocal(" src/lib/sync/engine.ts` shows every call passes `dirtyAtStart`
- [ ] `grep -n "K.tombstones, JSON.stringify(data.tombstones)" src/lib/sync/engine.ts` shows it only inside the transaction
- [ ] `git status` shows only `src/lib/sync/engine.ts` and `tests/sync-engine.test.ts` changed
- [ ] `plans/README.md` status row updated

## STOP conditions

- The new race tests pass before the fix (the fake does not reproduce the race).
- After the fix, test 1 or 2 still loses data: do not add retry loops or merging inside `applyLocal`; report the failing test output.
- Dexie rejects reading `localStorage`-backed state inside the transaction or the transaction auto-commits early (symptom: `TransactionInactiveError`). Do not add `await`s of non-Dexie promises inside the callback; report.
- `tests/server-sync.test.ts` starts failing (e.g. a sync that used to converge now needs extra rounds): report rather than adjust that test.

## Maintenance notes

- The invariant to keep: *never overwrite the local database unless no local write happened since the snapshot was read*, checked inside the transaction. Any future code path that calls `applyLocal` must pass the dirty count it read before reading local data.
- Cost of the design: when an edit lands mid-sync, that cycle skips applying and triggers one extra sync. Under constant edits this repeats but still converges (each cycle pushes the merge).
- Reviewer: check that the `again` re-run really happens (the `finally` in `syncNow` restarts when `again` is true) and that `K.force` is removed even when not applied.
- Deferred: a diff-based apply (write only changed rows instead of clear + bulkPut) would also stop full-table live-query re-renders; not needed for correctness.
