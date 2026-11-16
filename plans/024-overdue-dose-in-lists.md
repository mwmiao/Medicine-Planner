# Plan 024: The medicines list and detail page say when today's dose is overdue

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 43fad38..HEAD -- src/lib/schedule.ts src/app/medications/page.tsx src/app/medications/view/page.tsx src/lib/i18n/pt.ts src/lib/i18n/zh.ts tests/schedule.test.ts`
> Plans 018/022/023 are expected to have edited `view/page.tsx`; locate lines by content. On any other mismatch, treat it as a STOP condition.

## Status

- **Priority**: P3
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none (edits `view/page.tsx` like 018/022/023 — run one at a time)
- **Category**: bug (usability)
- **Planned at**: commit `43fad38`, 2026-11-15

## Why this matters

On the live site Today shows "08:00 ! 已过时间 (overdue)" for a dose not yet taken, while "我的药" says "下次服药: 11月16日周一 08:00" (tomorrow). The list silently skips the overdue dose, so it looks as if nothing is pending. After this plan both the list and the detail page show a red line "今天 08:00 还没吃" for an untaken dose of today whose time (plus the app's 30-minute window) has passed, above the existing "next dose" line.

## Current state

- `src/lib/schedule.ts:5` `export const DUE_WINDOW_MINUTES = 30;` Lines 80–95:
```ts
export function nextDose(med: Medication, logs: DoseLog[], now: Date = new Date()): string | undefined {
  const byId = new Map(logs.map((l) => [l.id, l]));
  const times = [...new Set(med.times)].sort();
  for (let i = 0; i < 60; i++) {
    const day = addDays(now, i);
    if (!isScheduledOn(med, day)) continue;
    const key = toDateKey(day);
    for (const time of times) {
      const at = `${key}T${time}`;
      const log = byId.get(doseId(med.id, at));
      if (log?.status === "taken" || log?.status === "skipped") continue;
      if (parseLocalDateTime(at).getTime() + 60_000 * DUE_WINDOW_MINUTES >= now.getTime()) return at;
    }
  }
  return undefined;
}
```
  Imports in this file include `addDays`, `toDateKey`, `parseLocalDateTime`, `doseId`, `isScheduledOn` (already used above).
- `src/app/medications/page.tsx:18,37-58` — fetches today's logs and renders per medicine: dose line, frequency line, then `<p className="mt-1 text-lg font-semibold text-primary">{m.meds.nextDose}: …</p>`.
- `src/app/medications/view/page.tsx:42,80-83` — `const next = logs ? nextDose(med, logs, now) : undefined;` and the "next dose" `<dt>/<dd>` row; `logs` there are today-and-later logs of this medicine.
- `tests/schedule.test.ts:41-56` — existing `nextDose` tests (fixed `now` dates like `new Date(2026, 9, 25, 12, 0)`, a `Medication` fixture `m`, and DB-backed logs on line 56). Model new tests on them.
- i18n: `pt.ts` defines `Messages`; `zh.ts` typed; block `meds` has `nextDose` (zh "下次服药"). New key in BOTH.
- Conventions: Portuguese comments, 2-space indent, double quotes.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Typecheck | `npm run typecheck` | exit 0 |
| All tests | `npm test` | exit 0 |

## Scope

**In scope**: `src/lib/schedule.ts`, `src/app/medications/page.tsx`, `src/app/medications/view/page.tsx`, `src/lib/i18n/pt.ts`, `src/lib/i18n/zh.ts`, `tests/schedule.test.ts`.

**Out of scope**: `nextDose` behaviour (must not change), the Today page, reminders, doses of previous days.

## Git workflow

- Branch: `advisor/024-overdue-dose`
- One commit; message ends with `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.
- Do NOT push or open a PR.

## Steps

### Step 1: `overdueDoseToday`

In `schedule.ts` add and export:

```ts
/** Primeira toma de hoje por registar cuja hora já passou (além da janela). */
export function overdueDoseToday(med: Medication, logs: DoseLog[], now: Date = new Date()): string | undefined {
  if (!isScheduledOn(med, now)) return undefined;
  const key = toDateKey(now);
  const byId = new Map(logs.map((l) => [l.id, l]));
  for (const time of [...new Set(med.times)].sort()) {
    const at = `${key}T${time}`;
    const log = byId.get(doseId(med.id, at));
    if (log?.status === "taken" || log?.status === "skipped") continue;
    if (parseLocalDateTime(at).getTime() + 60_000 * DUE_WINDOW_MINUTES < now.getTime()) return at;
  }
  return undefined;
}
```

**Verify**: `npm run typecheck` → exit 0.

### Step 2: Message (BOTH files)

`meds.overdueToday`: pt `(time: string) => \`Hoje às ${time}: ainda não tomou\``, zh `(time: string) => \`今天 ${time}：还没吃\``. (Update the `Messages` type in `pt.ts` by defining it there; `zh.ts` follows.)

**Verify**: `npm run typecheck` → exit 0.

### Step 3: Show it

- `medications/page.tsx`: compute `const late = overdueDoseToday(med, logs, now);` and, above the `nextDose` paragraph, `{late ? <p className="mt-1 text-lg font-bold text-amber-900">{m.meds.overdueToday(late.slice(11, 16))}</p> : null}`. Add the import.
- `view/page.tsx`: same value computed with `logs`; render it in the schedule `<dl>` as a first-row-above-next-dose `<div>` containing `<dd className="font-bold text-amber-900">…</dd>` (no `<dt>`; if the project's a11y lint complains, keep a `<dt className="sr-only">` with `m.meds.nextDose`... otherwise omit).

**Verify**: `npm run typecheck` → exit 0; `npm test` → exit 0.

### Step 4: Tests

In `tests/schedule.test.ts` add `describe("overdueDoseToday")` using the existing fixture: daily med at 08:00, now = 08:20 same day → undefined (inside the 30-minute window); now = 09:00 → `"<day>T08:00"`; with a `taken` log for that dose at 09:00 → undefined; med scheduled only on other weekdays → undefined; two times (08:00, 20:00), now 21:00, 08:00 taken → `"<day>T20:00"`.

**Verify**: `npm test` → exit 0 with the 5 new tests.

## Test plan

The 5 cases in Step 4 (pure function), plus the unchanged `nextDose` tests as regression.

## Done criteria

- [ ] `npm run typecheck` and `npm test` exit 0
- [ ] `grep -rn "overdueDoseToday" src` shows 1 definition + 2 uses
- [ ] `nextDose` code is unchanged (`git diff` shows no edit inside it)
- [ ] Only in-scope files changed
- [ ] `plans/README.md` status row updated

## STOP conditions

- The excerpts don't match (after allowing for 018/022/023 edits to `view/page.tsx`).
- The `Messages` type cannot hold a function-valued key in the `meds` block (then use a string with a `{time}` placeholder and the existing replace helper, and report).

## Maintenance notes

- Uses the same `DUE_WINDOW_MINUTES` as the Today page's "overdue" state; keep them in sync if that constant changes.
- Only today is considered; missed doses of earlier days are on the history page.
