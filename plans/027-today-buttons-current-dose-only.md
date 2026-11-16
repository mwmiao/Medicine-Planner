# Plan 027: Today shows action buttons only on the dose that is due now (and the next one)

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 3a00dfb..HEAD -- src/lib/schedule.ts src/components/DoseCard.tsx src/app/page.tsx tests/schedule.test.ts`
> If any of these changed, compare the "Current state" excerpts against the live code; on a mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S–M
- **Risk**: LOW
- **Depends on**: none (edits `src/app/page.tsx` and `DoseCard.tsx` like plans 007/026, already DONE)
- **Category**: UX simplification (the user is an elderly Chinese-speaking person using an iPhone)
- **Planned at**: commit `3a00dfb`, 2026-11-16

## Why this matters

On the Today page every unfinished dose is a full card with three big buttons ("我已经吃了", "15 分钟后提醒", "这次不吃"). With 3 doses a day the screen shows 9 buttons, and at breakfast the 20:00 card offers "I took it" as prominently as the 08:00 one. That is visually noisy and makes it easy to record the wrong dose. After this plan only doses that need attention now (due, overdue, snoozed) plus the single next upcoming dose show full cards with buttons; any further upcoming doses are one-line rows with no buttons (time, name, amount, "待服用").

## Current state

- `src/lib/schedule.ts` — dose logic. `DoseView = "upcoming" | "due" | "overdue" | "snoozed" | "taken" | "skipped"`. Existing splitter (line ~81):
```ts
/** Tomas por fazer (mantém a ordem por hora) e tomas já concluídas (tomadas ou não tomadas). */
export function splitDoses(doses: Dose[]): { open: Dose[]; done: Dose[] } {
  const finished = (d: Dose) => d.view === "taken" || d.view === "skipped";
  return { open: doses.filter((d) => !finished(d)), done: doses.filter(finished) };
}
```
  `doseView` returns `"upcoming"` only when the scheduled (or snoozed-until) time is still in the future; `"due"` for the first `DUE_WINDOW_MINUTES` after it; then `"overdue"`. A dose with a snooze in the future is `"snoozed"`. `doses` arrive sorted by time.
- `src/components/DoseCard.tsx` — exports `DoseCard` (full card; `open = view !== "taken" && view !== "skipped"` shows the 3 buttons) and `DoneDoseRow` (compact row, exemplar to copy for the new row):
```tsx
export function DoneDoseRow({ dose, onUndo }: { dose: Dose; onUndo: (d: Dose) => void }) {
  const { m } = useMessages();
  ...
    <div className="flex items-center gap-3 rounded-2xl bg-white p-4 ring-1 ring-line">
      <ColorDot color={dose.medication.color} size="h-5 w-5" />
      <div className="min-w-0 flex-1">
        <p className="text-lg font-bold break-words">{dose.time} · {dose.medication.name}</p>
```
- `src/app/page.tsx` (Today, lines ~80-94) renders `open` as a list of `<DoseCard …/>` inside `<ul className="flex flex-col gap-4">`, then the `done` section with a `<h2 id="done-title">` and `DoneDoseRow`s.
- i18n: `src/lib/i18n/pt.ts` defines the `Messages` type; `zh.ts` must have identical keys. `today.status.upcoming` exists (zh "待服用", pt "Por tomar"). The new section title needs a key.
- Conventions: Portuguese code comments, 2-space indent, double quotes, large tap targets. Tests in `tests/schedule.test.ts` use `testDb()`, `input()` from `tests/helpers.ts`; see the existing `splitDoses` tests (lines ~105-125) as the pattern.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Typecheck | `npm run typecheck` | exit 0 |
| All tests | `npm test` | exit 0 |
| Schedule tests only | `npx vitest run tests/schedule.test.ts` | all pass |

## Scope

**In scope**: `src/lib/schedule.ts` (add one function), `src/components/DoseCard.tsx` (add one component), `src/app/page.tsx`, `src/lib/i18n/pt.ts`, `src/lib/i18n/zh.ts`, `tests/schedule.test.ts`.

**Out of scope** (do NOT touch):
- `splitDoses`, `summarize`, `doseView` behaviour and their existing tests.
- The History page, medication pages, reminders/push, sync.
- The taken / skip / undo confirm dialogs.
- Any way to record an upcoming dose early (deliberately removed from the compact rows; see Maintenance notes).

## Git workflow

- Branch: `advisor/027-today-current-dose-only`
- One commit; message ends with `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.
- Do NOT push or open a PR.

## Steps

### Step 1: `splitOpenDoses`

In `src/lib/schedule.ts`, directly after `splitDoses`, add:

```ts
/**
 * Das tomas por fazer, só as que precisam de atenção agora (hora chegada, atrasadas, adiadas)
 * e a próxima ainda futura levam botões; as restantes tomas futuras ficam numa linha simples.
 */
export function splitOpenDoses(open: Dose[]): { actionable: Dose[]; later: Dose[] } {
  const nextAt = open.find((d) => d.view === "upcoming")?.scheduledFor;
  const isNext = (d: Dose) => d.view === "upcoming" && d.scheduledFor === nextAt;
  return {
    actionable: open.filter((d) => d.view !== "upcoming" || isNext(d)),
    later: open.filter((d) => d.view === "upcoming" && !isNext(d)),
  };
}
```

Rule: every open dose that is not `upcoming` is actionable; all `upcoming` doses sharing the earliest upcoming `scheduledFor` (several medicines at the same time) are actionable; later `upcoming` doses go to `later`. Order within each list is preserved.

**Verify**: `npm run typecheck` → exit 0.

### Step 2: Messages (BOTH files, same key)

Add to the `today` block (next to `doneTitle`): `laterTitle`.
- pt: `laterTitle: "Mais tarde hoje"`
- zh: `laterTitle: "今天晚些时候"`

**Verify**: `npm run typecheck` → exit 0 (fails if one language misses the key).

### Step 3: `UpcomingDoseRow`

In `src/components/DoseCard.tsx`, after `DoneDoseRow`, export a button-less row modelled on it:

```tsx
export function UpcomingDoseRow({ dose }: { dose: Dose }) {
  const { m } = useMessages();
  return (
    <div className="flex items-center gap-3 rounded-2xl bg-white p-4 ring-1 ring-line">
      <ColorDot color={dose.medication.color} size="h-5 w-5" />
      <div className="min-w-0 flex-1">
        <p className="text-lg font-bold break-words">{dose.time} · {dose.medication.name}</p>
        <p className="text-base text-muted">{formatDose(dose.medication, m)} · {m.today.status.upcoming}</p>
      </div>
    </div>
  );
}
```

(`formatDose` is already imported in this file.) No buttons, not a link.

**Verify**: `npm run typecheck` → exit 0.

### Step 4: Today page

In `src/app/page.tsx`:
1. Import `splitOpenDoses` from `@/lib/schedule` (extend the existing import) and `UpcomingDoseRow` from `@/components/DoseCard`.
2. After `const { open, done } = splitDoses(doses);` add `const { actionable, later } = splitOpenDoses(open);`.
3. In the open list, replace `open.length > 0` / `open.map` with `actionable.length > 0` / `actionable.map` (the `DoseCard` props stay identical).
4. Directly after that list and before the `done` section add a section modelled on the `done` one:
```tsx
{later.length > 0 ? (
  <section className="mt-6" aria-labelledby="later-title">
    <h2 id="later-title" className="mb-3 text-xl font-bold text-muted">{m.today.laterTitle}</h2>
    <ul className="flex flex-col gap-3">
      {later.map((d) => (
        <li key={d.id}><UpcomingDoseRow dose={d} /></li>
      ))}
    </ul>
  </section>
) : null}
```

**Verify**: `npm run typecheck` → exit 0; `npm test` → exit 0.

### Step 5: Tests

In `tests/schedule.test.ts` (import `splitOpenDoses` with the existing schedule imports) add tests for `splitOpenDoses` using hand-built `Dose`-shaped input through `generateDoses` as the existing `splitDoses` tests do:
1. Three upcoming doses (now earlier than all three) → `actionable` is only the first; `later` is the other two in order.
2. One overdue + two upcoming → `actionable` = overdue + first upcoming; `later` = the last upcoming.
3. One `due` dose + one `snoozed` dose + nothing else upcoming → both actionable, `later` empty.
4. No open doses (`[]`) → both lists empty.
5. Two medicines both at 08:00 plus one at 20:00, all upcoming → `actionable` = both 08:00 doses; `later` = the 20:00 one.

**Verify**: `npx vitest run tests/schedule.test.ts` → pass, 5 new tests.

## Test plan

The 5 tests in Step 5. UI (not covered by automated tests) — reviewer checks on desktop and a ~375 px-wide viewport with three daily times and the clock before the first: Today shows ONE full card (first time) with three buttons, the other two times appear under "今天晚些时候" as compact rows with no buttons. Move past the first time (or take it): the next dose gets the full card. An overdue dose always keeps its card and buttons. The progress bar and "已完成" list are unchanged.

## Done criteria

- [ ] `npm run typecheck` exits 0
- [ ] `npm test` exits 0; the 5 new tests exist and pass
- [ ] `grep -rn "splitOpenDoses" src` shows 1 definition and 1 use in `src/app/page.tsx`
- [ ] `grep -n "laterTitle" src/lib/i18n/pt.ts src/lib/i18n/zh.ts` shows the key in both
- [ ] Only in-scope files are modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

- The excerpts do not match the live code.
- `Dose` has no `view` field or `doses` are not sorted by time (check `generateDoses` in `src/lib/schedule.ts` — if not sorted, report instead of sorting).
- Any step requires touching `splitDoses`, `summarize`, sync, server or reminders code.
- A step's verification fails twice.

## Maintenance notes

- A dose later today cannot be marked taken early from Today (it has no button until it is the next dose or its time arrives). This is intentional to avoid mis-taps; if she needs it, the follow-up is a "tap the row to expand" behaviour, not more buttons.
- "Next" means every upcoming dose at the earliest upcoming time, so medicines taken together all keep their buttons. A medicine whose next dose is 10 minutes after another's is a `later` row until the first is handled; reviewers should confirm that feels right.
