# Plan 029: "Skipped" and "missed" doses get clearly different words

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 3a00dfb..HEAD -- src/lib/i18n/pt.ts src/lib/i18n/zh.ts`
> If either changed, compare the "Current state" excerpts against the live code; on a mismatch, treat it as a STOP condition.

## Status

- **Priority**: P3
- **Effort**: S
- **Risk**: LOW (text only)
- **Depends on**: none
- **Category**: UX wording
- **Planned at**: commit `3a00dfb`, 2026-11-16

## Why this matters

Two different things read as almost the same sentence in the app. A dose she deliberately skipped ("这次不吃" button) shows "未服用" (not taken); a dose whose time passed with nothing recorded shows "没有记录" (no record). To an elderly reader both say "didn't take it", so she cannot tell "I decided not to" from "I forgot". After this plan a skipped dose says "已跳过" and a missed dose says "忘了吃" (pt: "Saltada" / "Esquecida").

## Current state

- `src/lib/i18n/zh.ts`: `today.status.skipped: "未服用"` (line ~67) and `history.notTaken: "没有记录"` (line ~83).
- `src/lib/i18n/pt.ts`: `today.status.skipped: "Não tomado"` (line ~73) and `history.notTaken: "Não registado"` (line ~89).
- Used by: `src/components/DoseCard.tsx` (`DoneDoseRow`, skipped dose), `src/app/history/page.tsx` (skipped row uses `m.today.status.skipped`, missed row uses `m.history.notTaken`). No test or other source file contains these literal strings (checked with grep over `src` and `tests`).
- Do NOT confuse with `reminders.pushFollowUp` in zh.ts ("这次药还没有记录…"): that is a push text asserted by `tests/reminder-jobs.test.ts` (`"还没有记录"`); leave it alone.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Typecheck | `npm run typecheck` | exit 0 |
| All tests | `npm test` | exit 0 |

## Scope

**In scope**: `src/lib/i18n/pt.ts`, `src/lib/i18n/zh.ts` (exactly four string values).

**Out of scope** (do NOT touch): any other string, `reminders.pushFollowUp`, components, tests, key names.

## Git workflow

- Branch: `advisor/029-clearer-labels`
- One commit; message ends with `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.
- Do NOT push or open a PR.

## Steps

### Step 1: Change the four values (values only, keys unchanged)

- `zh.ts`: `today.status.skipped` → `"已跳过"`; `history.notTaken` → `"忘了吃"`.
- `pt.ts`: `today.status.skipped` → `"Saltada"`; `history.notTaken` → `"Esquecida"`.

**Verify**: `grep -n 'skipped:\|notTaken:' src/lib/i18n/pt.ts src/lib/i18n/zh.ts` → shows exactly the four new values.

### Step 2: Check nothing depended on the old words

**Verify**: `grep -rn "未服用\|Não tomado\|Não registado" src tests` → no matches; `grep -rn "没有记录" src tests` → only the `pushFollowUp`-related lines (`还没有记录`), none for `history.notTaken`. Then `npm run typecheck` → exit 0 and `npm test` → exit 0.

## Test plan

No new tests (copy-only change). Reviewer: in History, a skipped dose reads "已跳过" in grey and a missed one reads "忘了吃" in red; on Today, a skipped dose in the finished list reads "已跳过".

## Done criteria

- [ ] `npm run typecheck` exits 0
- [ ] `npm test` exits 0
- [ ] `grep -rn "未服用\|Não tomado\|Não registado" src tests` returns nothing
- [ ] Only `pt.ts` and `zh.ts` modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

- The old values are not found where listed.
- A test fails because it asserts one of the old strings (report which; do not edit the test without approval).

## Maintenance notes

- "忘了吃" states a reason the app does not know (she may have chosen not to without pressing the button). If that bothers the owner, "没吃" is the neutral alternative.
