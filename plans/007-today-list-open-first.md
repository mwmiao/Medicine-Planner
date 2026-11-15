# Plan 007: Today shows what is left to take first, and confirms what she just recorded

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 34ffff1..HEAD -- src/app/page.tsx src/components/DoseCard.tsx src/lib/schedule.ts src/lib/i18n/pt.ts src/lib/i18n/zh.ts tests/schedule.test.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: LOW
- **Depends on**: none (order after 006 only to avoid merge conflicts in `pt.ts`/`zh.ts`)
- **Category**: direction (usability)
- **Planned at**: commit `34ffff1`, 2026-11-15

## Why this matters

The Today screen lists every dose of the day as one large card, sorted by time.
Doses already taken stay in the list at full size, so on a day with 6+ doses
the elderly user scrolls past green finished cards to find the next dose, and
when she taps "我已经吃了" the only feedback is that one card changes colour
somewhere above or below the fold. After this plan: doses still to take
(overdue first, then due now, then upcoming — which is plain time order) come
first as full cards; finished doses move to a compact "已完成 / Concluídas" list
below, with the undo action kept; and a confirming message appears when a dose
is recorded.

## Current state

`src/lib/schedule.ts` — `generateDoses(...)` returns `Dose[]` sorted by `time`
then medication name. `Dose` has `view: DoseView` where
`DoseView = "upcoming" | "due" | "overdue" | "snoozed" | "taken" | "skipped"`
(`taken`/`skipped` are the finished states). `summarize(doses)` already exists:

```ts
export function summarize(doses: Dose[]): { taken: number; total: number } {
  return { taken: doses.filter((d) => d.view === "taken").length, total: doses.length };
}
```

`src/app/page.tsx` (`TodayPage`) — relevant parts:

```tsx
const { taken, total } = summarize(doses);
...
<ul className="flex flex-col gap-4">
  {doses.map((d) => (
    <li key={d.id}>
      <DoseCard dose={d} onTake={setConfirming} onSnooze={(dose) => run(() => snoozeDose(dose.medication.id, dose.scheduledFor))} onUndo={setUndoing} />
    </li>
  ))}
</ul>
...
onConfirm={() => {
  const d = confirming;
  setConfirming(null);
  if (d) void run(() => markTaken(d.medication.id, d.scheduledFor));
}}
```

`toast(text, tone?)` is imported in `page.tsx` already (`@/components/Toast`);
default tone is success (green, auto-hides after 3.5 s). `run(fn)` wraps an async
call and toasts `m.common.errorGeneric` on failure.

`src/components/DoseCard.tsx` — one component handling every view, including a
`taken`/`skipped` rendering branch with an `onUndo` button (`Button variant="ghost"`,
`m.today.undo`). Status text logic:

```tsx
const status =
  dose.view === "taken" ? s.taken(dose.log?.takenAt ? formatClock(dose.log.takenAt) : dose.time)
  : dose.view === "snoozed" ? s.snoozed(dose.log?.snoozedUntil?.slice(11) ?? "")
  : s[dose.view];
```

with `const s = m.today.status;`. Also exports nothing else. `ColorDot` and `Button`
come from `./ui`; `formatClock`, `formatDose` from `@/lib/format`.

i18n: `pt.ts` defines messages (`export type Messages = typeof pt`); `zh.ts` is
typed `Messages`, so a key missing in `zh` fails typecheck. The `today` block has
`taken`, `snooze`, `undo`, `status`, … (pt: "Já tomei"/"Desfazer", zh: "我已经吃了"/"撤销").

Tests: `tests/schedule.test.ts` uses `med(id, overrides)` helper and `SUNDAY`
(25 Oct 2026, 07:00) — model new tests on its `generateDoses` cases.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Typecheck | `npm run typecheck` | exit 0 |
| All tests | `npm test` | exit 0 (74 passed at planning time) |
| Schedule tests | `npx vitest run tests/schedule.test.ts` | all pass |
| Dev server | `npm run dev` | http://localhost:3000 |

## Scope

**In scope**:
- `src/lib/schedule.ts` (add `splitDoses` only)
- `tests/schedule.test.ts` (add one `describe`)
- `src/components/DoseCard.tsx` (add and export `DoneDoseRow`; leave `DoseCard` untouched)
- `src/app/page.tsx`
- `src/lib/i18n/pt.ts`, `src/lib/i18n/zh.ts` (add two keys to `today`)

**Out of scope**:
- Changing dose ordering, the 30-minute `DUE_WINDOW_MINUTES`, snooze length, or the take-confirmation dialog.
- The History page.
- Deleting the now-unreachable `taken`/`skipped` branch of `DoseCard` (leave it; mention it in your report).

## Git workflow

- Branch: `advisor/007-today-open-first`
- One commit, short imperative message.
- Do NOT push or open a PR.

## Steps

### Step 1: Failing test for `splitDoses`

Append to `tests/schedule.test.ts` (add `splitDoses` to the existing import from `@/lib/schedule`):

```ts
describe("separar tomas por fazer e concluídas", () => {
  it("põe as tomas por fazer primeiro (por hora) e as concluídas à parte", async () => {
    const db = testDb();
    const meds = [med("a", { name: "A", times: ["08:00", "12:00", "20:00"] })];
    const now = new Date(2026, 9, 25, 12, 5);
    await markTaken("a", "2026-10-25T08:00", now, db);
    const doses = generateDoses(meds, await db.doseLogs.toArray(), SUNDAY, now);
    const { open, done } = splitDoses(doses);
    expect(open.map((d) => d.time)).toEqual(["12:00", "20:00"]);
    expect(done.map((d) => d.time)).toEqual(["08:00"]);
  });

  it("trata 'não tomada' como concluída e não perde nenhuma toma", () => {
    const meds = [med("a", { times: ["08:00", "20:00"] })];
    const doses = generateDoses(meds, [], SUNDAY, SUNDAY);
    const skipped = [{ ...doses[0], view: "skipped" as const }, doses[1]];
    const { open, done } = splitDoses(skipped);
    expect(done).toHaveLength(1);
    expect(open).toHaveLength(1);
  });
});
```

**Verify**: `npx vitest run tests/schedule.test.ts` → fails (`splitDoses` not exported).

### Step 2: Implement `splitDoses`

In `src/lib/schedule.ts`, next to `summarize`:

```ts
/** Tomas por fazer (mantém a ordem por hora) e tomas já concluídas (tomadas ou não tomadas). */
export function splitDoses(doses: Dose[]): { open: Dose[]; done: Dose[] } {
  const finished = (d: Dose) => d.view === "taken" || d.view === "skipped";
  return { open: doses.filter((d) => !finished(d)), done: doses.filter(finished) };
}
```

**Verify**: `npx vitest run tests/schedule.test.ts` → all pass.

### Step 3: Messages

`pt.ts` `today` block add:
```ts
recorded: "Registado ✓",
doneTitle: "Concluídas",
```
`zh.ts` `today` block add:
```ts
recorded: "已记录 ✓",
doneTitle: "已完成",
```

**Verify**: `npm run typecheck` → exit 0.

### Step 4: Compact finished-dose row

In `src/components/DoseCard.tsx` add and export:

```tsx
export function DoneDoseRow({ dose, onUndo }: { dose: Dose; onUndo: (d: Dose) => void }) {
  const { m } = useMessages();
  const s = m.today.status;
  const status = dose.view === "taken" ? s.taken(dose.log?.takenAt ? formatClock(dose.log.takenAt) : dose.time) : s.skipped;
  return (
    <div className="flex items-center gap-3 rounded-2xl bg-white p-4 ring-1 ring-line">
      <ColorDot color={dose.medication.color} size="h-5 w-5" />
      <div className="min-w-0 flex-1">
        <p className="text-lg font-bold break-words">{dose.time} · {dose.medication.name}</p>
        <p className={`text-base font-semibold ${dose.view === "taken" ? "text-taken" : "text-muted"}`}>
          {dose.view === "taken" ? "✓ " : ""}{status}
        </p>
      </div>
      <Button variant="ghost" onClick={() => onUndo(dose)} className="min-h-12 px-2 text-base">
        {m.today.undo}
      </Button>
    </div>
  );
}
```

**Verify**: `npm run typecheck` → exit 0.

### Step 5: Use it on the Today page

In `src/app/page.tsx`:
- import `splitDoses` (from `@/lib/schedule`, alongside `summarize`) and `DoneDoseRow` (from `@/components/DoseCard`).
- after `const { taken, total } = summarize(doses);` add `const { open, done } = splitDoses(doses);`.
- render the existing `<ul>` over `open` (not `doses`) and only when `open.length > 0`.
- after it, when `done.length > 0`, render:

```tsx
<section className="mt-6" aria-labelledby="done-title">
  <h2 id="done-title" className="mb-3 text-xl font-bold text-muted">{m.today.doneTitle} ({done.length})</h2>
  <ul className="flex flex-col gap-3">
    {done.map((d) => (
      <li key={d.id}><DoneDoseRow dose={d} onUndo={setUndoing} /></li>
    ))}
  </ul>
</section>
```

- change the take confirmation to record then confirm:

```tsx
if (d) void run(async () => {
  await markTaken(d.medication.id, d.scheduledFor);
  toast(m.today.recorded);
});
```

Keep the summary card, history button and both dialogs exactly as they are.

**Verify**: `npm run typecheck` → exit 0; `npm test` → exit 0 (74 + 2 new).

### Step 6: Manual check

State which you ran. `npm run dev`, add 3 medicines with times spread across
the day (edit your system clock is not needed — use times in the past/future):
- Past, untaken doses appear first as amber "已过时间" cards; future ones after.
- Tap 我已经吃了 → 是的，已经吃了 → a green "已记录 ✓" message appears, the card leaves the top list and shows in "已完成 (1)".
- Tap 撤销 on the compact row → confirm dialog → the dose returns to the top list.
- When every dose is taken the top list disappears and the existing "很好！今天的药都吃完了。" line shows.
- Check at 375 px width and with 特大 text size that rows do not overflow.

## Test plan

Unit tests for `splitDoses` in Step 1 (ordering preserved, finished states,
no dose lost). UI is verified manually (no component test tooling in repo).

## Done criteria

- [ ] `npm run typecheck` exits 0; `npm test` exits 0 with the 2 new `splitDoses` tests passing
- [ ] `grep -n "splitDoses" src/app/page.tsx src/lib/schedule.ts` shows definition and use
- [ ] `grep -n "doses.map" src/app/page.tsx` returns no match
- [ ] `git status` shows only in-scope files changed
- [ ] `plans/README.md` status row updated

## STOP conditions

- `TodayPage` or `DoseCard` differ materially from the excerpts.
- `markTaken` does not return a promise you can `await` inside `run`.
- Making this work seems to require changing `generateDoses` ordering or any other caller (History page also uses `generateDoses`).

## Maintenance notes

- `DoseCard`'s `taken`/`skipped` branch is now unreachable from Today; it can be removed in a later cleanup once nobody else renders finished doses through it.
- A new `DoseView` value must be classified as open or finished in `splitDoses`.
- The `recorded` message is shown only after the write succeeds; failures still use the existing error toast.
