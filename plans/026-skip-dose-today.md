# Plan 026: She can say "I'm not taking this dose" instead of tapping "taken"

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 97ba274..HEAD -- src/lib/doses.ts src/lib/schedule.ts src/components/DoseCard.tsx src/app/page.tsx src/app/history/page.tsx src/lib/i18n/pt.ts src/lib/i18n/zh.ts tests/schedule.test.ts`
> Plan 025 is expected to have edited `src/lib/schedule.ts` and `tests/schedule.test.ts`; locate lines by content. On any other mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S–M
- **Risk**: LOW–MED (new way to write a dose log; sync/push already handle the `skipped` status)
- **Depends on**: none (edits `src/lib/schedule.ts` and `tests/schedule.test.ts` like plan 025 — run one at a time, 025 first)
- **Category**: bug (usability) / correctness of the dose record
- **Planned at**: commit `97ba274`, 2026-11-16

## Why this matters

The Today page offers only two actions on a pending dose: "taken" and "snooze 15 min". If she should not or will not take a dose (the doctor stopped it, she feels unwell, she already took it elsewhere), the card stays red and "overdue" all day, the second push reminder rings, and the only way to clear it is to tap "taken" — recording a dose she did not take, which falsifies the history the family relies on. The app already has a `skipped` dose status (types, merge, reminders, display) but nothing can create it. After this plan a third button "这次不吃 / Não vou tomar" (with a confirmation) records the dose as skipped: it moves to the finished list, push reminders stop, the progress bar ignores it, and the history shows it as skipped rather than as a missed dose.

## Current state

- `src/lib/types.ts` — `DoseStatus = "pending" | "taken" | "skipped" | "snoozed"`; `DoseLog` has `id` (`${medicationId}|${scheduledFor}`), `medicationId`, `scheduledFor`, `takenAt?`, `snoozedUntil?`, `status`, `updatedAt?`.
- `src/lib/doses.ts` — writes dose logs (exemplar to copy):
```ts
export async function markTaken(medicationId: string, scheduledFor: string, now: Date = new Date(), database: PlannerDB = db): Promise<DoseLog> {
  const log: DoseLog = { id: doseId(medicationId, scheduledFor), medicationId, scheduledFor, takenAt: now.toISOString(), status: "taken", updatedAt: now.toISOString() };
  await database.doseLogs.put(log);
  return log;
}
```
  `snoozeDose` and `undoDose` follow the same shape (`undoDose` deletes the log).
- Already handles `skipped` (do not change): `src/lib/schedule.ts` `doseView` returns `"skipped"`; `splitDoses` puts taken+skipped in `done`; `src/lib/reminders/jobs.ts` skips taken/skipped doses (so no push is sent); `src/lib/sync/merge.ts` has `STATUS_RANK` including `skipped`; `ReminderJobsSync.tsx` re-uploads reminder jobs when a log's status changes; `DoneDoseRow` in `src/components/DoseCard.tsx` renders a skipped dose as grey text with `m.today.status.skipped` and an Undo button.
- `src/components/DoseCard.tsx` — props `{ dose, onTake, onSnooze, onUndo }`; for open doses renders a `Button variant="success"` ("✓ taken") and a `Button variant="secondary"` ("⏱ snooze"), otherwise the Undo ghost button. `Button` (`src/components/ui.tsx`) supports `variant` values including `"ghost"`, `"secondary"`, `"success"`, `"danger"`.
- `src/app/page.tsx` (Today) — `const { taken, total } = summarize(doses);` then:
  - `total === 0 ? <Notice>{m.today.noDoses}</Notice> : (<> <summary card…> {taken === total ? <p …>{m.today.allTaken}</p> : null} …lists… </>)`
  - progress bar width `(taken / total) * 100`%.
  - Two `ConfirmDialog`s (taken, undo) driven by state (`confirming`, `undoing`) with `useCallback` close handlers and a `run(fn)` helper that toasts `m.common.errorGeneric` on failure; the taken dialog toasts `m.today.recorded` after `markTaken`.
- `src/lib/schedule.ts` `summarize(doses)` returns `{ taken: count of view "taken", total: doses.length }`. Existing test in `tests/schedule.test.ts` expects `summarize(doses)` to equal `{ taken: 1, total: 2 }` for 2 doses, one taken.
- `src/app/history/page.tsx` — per day computes `const taken = doses.filter((d) => d.view === "taken").length;`, shows `m.history.count(taken, doses.length)` (green if all taken else red) and per row: `ok ? "✓ time" : pendingToday ? m.today.status.upcoming : m.history.notTaken` (red).
- i18n: `src/lib/i18n/pt.ts` defines `Messages` (the type is derived from it); `zh.ts` must match. The `today` block has `taken`, `snooze`, `undo`, `confirmTitle`, `confirmBody(name, dose, time)`, `confirmYes`, `confirmNo`, `undoTitle`, `undoBody`, `status.skipped` (zh "未服用", pt "Não tomado"); `m.common.cancel` exists.
- Conventions: Portuguese comments, 2-space indent, double quotes, large tap targets (`min-h-16` primary, 12+ for ghost). Tests use `testDb()` and `input()` from `tests/helpers.ts`; see `tests/schedule.test.ts` for `markTaken`/`snoozeDose` tests to model on.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Typecheck | `npm run typecheck` | exit 0 |
| All tests | `npm test` | exit 0 |
| Schedule tests only | `npx vitest run tests/schedule.test.ts` | all pass |

## Scope

**In scope**: `src/lib/doses.ts`, `src/lib/schedule.ts` (`summarize` only), `src/components/DoseCard.tsx`, `src/app/page.tsx`, `src/app/history/page.tsx`, `src/lib/i18n/pt.ts`, `src/lib/i18n/zh.ts`, `tests/schedule.test.ts`.

**Out of scope** (do NOT touch):
- `src/lib/sync/*`, `src/lib/reminders/jobs.ts`, `server/*` (they already handle `skipped`).
- The `DoseLog` type, the database schema, the data model.
- A "skip" action anywhere other than the Today pending-dose card (no bulk skip, no skipping from History).
- `DoneDoseRow` (already correct).

## Git workflow

- Branch: `advisor/026-skip-dose-today`
- One commit; message ends with `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.
- Do NOT push or open a PR.

## Steps

### Step 1: `skipDose`

In `src/lib/doses.ts` add next to `snoozeDose`, copying `markTaken`'s shape but without `takenAt`:

```ts
/** Marca a toma como "não vou tomar" (ex.: o médico suspendeu, ou já a tomou por outra via). */
export async function skipDose(medicationId: string, scheduledFor: string, now: Date = new Date(), database: PlannerDB = db): Promise<DoseLog> {
  const log: DoseLog = { id: doseId(medicationId, scheduledFor), medicationId, scheduledFor, status: "skipped", updatedAt: now.toISOString() };
  await database.doseLogs.put(log);
  return log;
}
```

**Verify**: `npm run typecheck` → exit 0.

### Step 2: `summarize` ignores skipped doses

In `src/lib/schedule.ts` change `summarize` so `total` excludes skipped doses:

```ts
export function summarize(doses: Dose[]): { taken: number; total: number } {
  const counted = doses.filter((d) => d.view !== "skipped");
  return { taken: counted.filter((d) => d.view === "taken").length, total: counted.length };
}
```

**Verify**: `npx vitest run tests/schedule.test.ts` → existing `summarize` test still passes.

### Step 3: Messages (BOTH files, same keys)

Add to the `today` block: `skip`, `skipTitle`, `skipYes`.
- pt: `skip: "Não vou tomar"`, `skipTitle: "Não vai tomar esta dose?"`, `skipYes: "Sim, não vou tomar"`
- zh: `skip: "这次不吃"`, `skipTitle: "这次不吃这个药吗？"`, `skipYes: "是的，这次不吃"`

**Verify**: `npm run typecheck` → exit 0 (fails if one language misses a key).

### Step 4: Button on the card

In `src/components/DoseCard.tsx` add a required prop `onSkip: (d: Dose) => void` to `DoseCard`. In the open-dose branch, after the snooze button add:

```tsx
<Button variant="ghost" block className="min-h-14 text-lg" onClick={() => onSkip(dose)}>
  {m.today.skip}
</Button>
```

(Visually weaker than "taken" and "snooze" so it is not tapped by mistake.)

**Verify**: `npm run typecheck` → fails only because `src/app/page.tsx` does not pass `onSkip` yet (expected until Step 5).

### Step 5: Today page

In `src/app/page.tsx`:
1. Import `skipDose` with `markTaken, snoozeDose, undoDose` from `@/lib/doses`.
2. Add `const [skipping, setSkipping] = useState<Dose | null>(null);` and `const closeSkip = useCallback(() => setSkipping(null), []);` next to the existing ones.
3. Pass `onSkip={setSkipping}` to `<DoseCard>`.
4. Add a third `ConfirmDialog` after the taken one, modelled on it: `open={!!skipping}`, `title={m.today.skipTitle}`, `confirmLabel={m.today.skipYes}`, `cancelLabel={m.common.cancel}`, default tone (not "success"), `onCancel={closeSkip}`, `onConfirm` that copies the dose, `setSkipping(null)`, then `void run(async () => { await skipDose(d.medication.id, d.scheduledFor); toast(m.today.recorded); })`. Body: `<p className="text-xl text-ink">{m.today.confirmBody(skipping.medication.name, formatDose(skipping.medication, m), skipping.time)}</p>` when `skipping` is set.
5. Because `summarize` now excludes skipped doses, `total` can be 0 while doses exist (all skipped). Change the empty guard from `total === 0` to `doses.length === 0`, and render the summary card only when `total > 0`; inside it keep `allTaken` for `taken === total`. The open/done lists must still render when `total === 0` (so the skipped doses stay visible with Undo). Concretely: keep one fragment containing `{total > 0 ? <summary card/> : null}` followed by the existing open and done lists.

**Verify**: `npm run typecheck` → exit 0; `npm test` → exit 0.

### Step 6: History shows skipped as skipped

In `src/app/history/page.tsx`, per day compute `const counted = doses.filter((d) => d.view !== "skipped");`, use `taken === counted.length` for the green/red class and `m.history.count(taken, counted.length)`; and in the row, when `d.view === "skipped"` show `m.today.status.skipped` in muted colour (`text-muted`) instead of the red `m.history.notTaken`. A day with only skipped doses must not show "0 / 0" in red: if `counted.length === 0`, omit the count line.

**Verify**: `npm run typecheck` → exit 0.

### Step 7: Tests

In `tests/schedule.test.ts` (imports `markTaken, snoozeDose` already; add `skipDose`) add:
1. `skipDose` writes a log `{ status: "skipped", updatedAt: <now ISO> }` with no `takenAt`, id `"a|2026-10-25T08:00"` (use `testDb()`, read back with `db.doseLogs.toArray()`).
2. After `skipDose`, `generateDoses` returns that dose with `view === "skipped"` and `splitDoses` puts it in `done`.
3. `summarize` with one taken, one skipped, one open dose returns `{ taken: 1, total: 2 }`.
4. `overdueDoseToday` returns `undefined` for a skipped past dose (already true; locks the behaviour).
5. `buildReminderJobs` (model on `tests/reminder-jobs.test.ts`, put this one there) produces no job for a skipped dose.

**Verify**: `npm test` → exit 0 with the 5 new tests.

## Test plan

The 5 tests in Step 7. UI (not covered by automated tests) — reviewer checks on desktop and a ~375 px-wide viewport: on Today, a pending card shows three buttons (taken, snooze, "这次不吃"); tapping the third opens the confirm dialog; confirming moves the card to the finished list with grey "未服用" and an Undo button, shows the "已记录" toast, updates the progress ("已吃 x 次，共 y 次" excludes it); undo brings it back; skipping every dose of the day shows no progress card and no error; History shows the dose as "未服用" in grey, not red.

## Done criteria

- [ ] `npm run typecheck` exits 0
- [ ] `npm test` exits 0; the 5 new tests exist and pass
- [ ] `grep -rn "skipDose" src` shows 1 definition and 1 use in `src/app/page.tsx`
- [ ] `grep -n "skip" src/lib/i18n/pt.ts src/lib/i18n/zh.ts` shows `skip`, `skipTitle`, `skipYes` in both
- [ ] Only in-scope files are modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

- The excerpts do not match the live code (other than plan 025's edits to `schedule.ts`/its test).
- `Button` has no `"ghost"` variant, or `ConfirmDialog` does not accept the props used (read `src/components/ui.tsx` and `ConfirmDialog.tsx`, then report instead of inventing props).
- Any step requires touching `src/lib/sync/*`, `server/*` or the `DoseLog` type.
- A step's verification fails twice.

## Maintenance notes

- `skipped` logs sync like any other log; a `taken` log from another copy still wins (`pickDoseLog` in `src/lib/sync/merge.ts`).
- Today's progress now means "taken out of doses that are not skipped"; History uses the same rule. Anything new that counts doses must decide how to treat skipped ones.
- Deferred on purpose: choosing a reason for skipping, editing the time a dose was taken, and a stop/pause switch for a whole medicine (separate product decision).
