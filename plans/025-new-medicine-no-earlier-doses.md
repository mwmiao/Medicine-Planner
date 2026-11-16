# Plan 025: A newly added medicine does not show today's earlier doses as overdue

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 97ba274..HEAD -- src/lib/schedule.ts tests/schedule.test.ts`
> If either file changed, compare the "Current state" excerpts with the live code; on a mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none (edits `src/lib/schedule.ts` like plan 026 — run one at a time, 025 first)
- **Category**: bug (usability)
- **Planned at**: commit `97ba274`, 2026-11-16

## Why this matters

When a medicine is added at 14:00 with a dose at 08:00, the Today page immediately shows a red card "! 已过时间 (overdue)" for the 08:00 dose, the progress bar counts it as a dose not taken, the medicines list says "今天 08:00：还没吃", and the history page marks it "没有记录" (not taken). The dose was never due while the medicine existed, so this is a false alarm that confuses the elderly user (and the family) on every first day of every new medicine. After this plan, doses whose time (plus the app's 30-minute window) was already past when the medicine was created are not generated for that day — unless a log for that dose already exists (for example she took it before entering it).

## Current state

- `src/lib/schedule.ts` — pure scheduling logic. Every Today/History/list view derives doses from it.
  - Line 5: `export const DUE_WINDOW_MINUTES = 30;`
  - `generateDoses` (about lines 57–70):
```ts
export function generateDoses(meds: Medication[], logs: DoseLog[], date: Date, now: Date = new Date()): Dose[] {
  const key = toDateKey(date);
  const byId = new Map(logs.map((l) => [l.id, l]));
  const doses: Dose[] = [];
  for (const med of meds) {
    if (!isScheduledOn(med, date)) continue;
    for (const time of [...new Set(med.times)]) {
      const scheduledFor = `${key}T${time}`;
      const id = doseId(med.id, scheduledFor);
      const log = byId.get(id);
      doses.push({ id, medication: med, scheduledFor, time, log, view: doseView(scheduledFor, log, now) });
    }
  }
  return doses.sort(...);
}
```
  - `overdueDoseToday(med, logs, now)` (end of file) loops the med's times and returns the first not-taken/skipped dose whose `parseLocalDateTime(at).getTime() + 60_000 * DUE_WINDOW_MINUTES < now.getTime()`. Used by `src/app/medications/page.tsx` and `src/app/medications/view/page.tsx`.
  - Imports already present: `addDays`, `daysBetween`, `parseDateKey`, `parseLocalDateTime`, `toDateKey` from `./dates`; `doseId` is defined in this file.
- `Medication.createdAt` is an ISO UTC string (e.g. `"2026-11-16T14:03:00.000Z"`), set once at creation and preserved on edit (`src/lib/medications.ts` `createMedication` / `updateMedication`). `scheduledFor` is a LOCAL time string `"YYYY-MM-DDTHH:mm"`; `parseLocalDateTime(scheduledFor)` returns a `Date` for it.
- `tests/schedule.test.ts` fixture: `med(id, overrides)` creates a Medication with `createdAt: "2026-10-01T09:00:00.000Z"` (long before the test dates, so existing tests must be unaffected). Tests use fixed dates such as `new Date(2026, 9, 25, 8, 10)` (25 Oct 2026 is a Sunday) and DB-backed logs via `testDb()` from `tests/helpers.ts`.
- Conventions: Portuguese comments, 2-space indent, double quotes.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Typecheck | `npm run typecheck` | exit 0 |
| All tests | `npm test` | exit 0 |
| Schedule tests only | `npx vitest run tests/schedule.test.ts` | all pass |

## Scope

**In scope**: `src/lib/schedule.ts`, `tests/schedule.test.ts`.

**Out of scope** (do NOT touch):
- `src/lib/reminders/jobs.ts` (push reminders; a follow-up push right after adding is acceptable).
- Editing a medicine's times later in the day (`createdAt` is the original creation time; using `updatedAt` would wrongly hide genuinely missed doses after any unrelated edit). Do not change `createdAt`/`updatedAt` handling.
- `nextDose` behaviour, the Today/History/list pages, i18n files, the data model.

## Git workflow

- Branch: `advisor/025-new-medicine-no-earlier-doses`
- One commit; message ends with `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.
- Do NOT push or open a PR.

## Steps

### Step 1: Helper and use it in `generateDoses`

In `src/lib/schedule.ts` add, above `generateDoses`:

```ts
/** A toma já tinha passado (além da janela) quando o medicamento foi adicionado: nunca esteve em atraso. */
function predatesMedication(med: Medication, scheduledFor: string): boolean {
  return parseLocalDateTime(scheduledFor).getTime() + 60_000 * DUE_WINDOW_MINUTES < new Date(med.createdAt).getTime();
}
```

In `generateDoses`, after `const log = byId.get(id);` add:

```ts
if (!log && predatesMedication(med, scheduledFor)) continue;
```

(A log means the user already recorded something for that dose; keep showing it.)

**Verify**: `npm run typecheck` → exit 0; `npx vitest run tests/schedule.test.ts` → all existing tests still pass.

### Step 2: Same rule in `overdueDoseToday`

In `overdueDoseToday`, after `const log = byId.get(doseId(med.id, at));` and the existing `taken`/`skipped` continue line, add `if (!log && predatesMedication(med, at)) continue;`.

**Verify**: `npm run typecheck` → exit 0.

### Step 3: Tests

In `tests/schedule.test.ts` add `describe("medicamento acabado de adicionar", ...)` with a med `med("n", { times: ["08:00", "20:00"], createdAt: new Date(2026, 9, 25, 14, 0).toISOString() })` (local 14:00 on Sunday 25 Oct 2026) and `now = new Date(2026, 9, 25, 14, 5)`:
1. `generateDoses([m], [], now, now)` returns only the 20:00 dose (the 08:00 one is not generated).
2. `overdueDoseToday(m, [], now)` is `undefined` (08:00 predates creation; 20:00 is not yet due).
3. A dose within the window of creation still appears: med created at local 08:10 with time `08:00`, now 08:12 → one dose, view `"due"`.
4. With a `taken` log for the 08:00 dose of the 14:00-created med (`markTaken("n", "2026-10-25T08:00", now, db)` with `testDb()` and `await db.doseLogs.toArray()`), `generateDoses` includes the 08:00 dose with view `"taken"`.
5. Next day (`new Date(2026, 9, 26, 7, 0)`) both 08:00 and 20:00 are generated.

**Verify**: `npm test` → exit 0 with the 5 new tests.

## Test plan

The 5 cases in Step 3, plus every existing test (their fixture is created long before the test dates, so they must pass unchanged).

## Done criteria

- [ ] `npm run typecheck` exits 0
- [ ] `npm test` exits 0; the 5 new tests exist and pass
- [ ] `grep -n "predatesMedication" src/lib/schedule.ts` shows 1 definition and 2 uses
- [ ] Only `src/lib/schedule.ts` and `tests/schedule.test.ts` are modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

- The excerpts do not match the live code.
- An existing test fails after Step 1 (the rule must not affect medicines created before the tested day).
- You find `createdAt` is not an ISO string in some code path (e.g. imported backups) such that `new Date(med.createdAt)` is `Invalid Date` — report instead of guessing (an invalid date makes the comparison false, which is the safe default; confirm that and report).

## Maintenance notes

- Uses the same `DUE_WINDOW_MINUTES` as `doseView`; keep them in sync.
- Known remaining case: changing a medicine's time to an earlier hour later the same day shows that dose as overdue (not handled; `createdAt` is not reset on edit).
- Reviewer: check manually on a phone/browser: add a medicine at a time of day after its dose time and confirm Today shows no red overdue card for the earlier dose (desktop and ~375 px wide).
