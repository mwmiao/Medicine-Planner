# Plan 021: Remove the PT / 中文 switch from the top of every screen

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 43fad38..HEAD -- src/components/AppShell.tsx src/components/LanguageSwitcher.tsx src/app/settings/page.tsx`
> If any in-scope file changed since this plan was written, compare the
> "Current state" notes against the live code; on a mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: direction (usability)
- **Planned at**: commit `43fad38`, 2026-11-15

## Why this matters

A large "PT | 中文" pill sits in the sticky header of every screen. For the Chinese-speaking user it is noise, and one accidental tap on "PT" flips the whole app to Portuguese, which she cannot read or easily undo. The same choice already exists on the Settings page (first card, "语言"), so nothing is lost. After this plan the header shows only the app name; the language is changed in Settings.

## Current state

- `src/components/AppShell.tsx:36-45`:
```tsx
<header className="sticky top-0 z-20 border-b-2 border-line bg-white/95 pt-safe backdrop-blur">
  <div className="mx-auto flex max-w-xl items-center justify-between gap-3 px-safe py-2">
    <span className="flex items-center gap-2 text-xl font-bold text-primary">
      <span aria-hidden className="text-2xl">💊</span>
      {m.common.shortName}
    </span>
    <LanguageSwitcher />
  </div>
```
  Imports at line 7: `import { LanguageSwitcher } from "./LanguageSwitcher";`.
- `src/components/LanguageSwitcher.tsx` — exports `LanguageSwitcher` (PT / 中文 buttons using `setLocale`). Only `AppShell.tsx` imports it (verified by grep over `src` and `tests`).
- `src/app/settings/page.tsx` — has its own language card with Português / 中文 buttons (do not change).
- i18n key `lang.label` is used only by `LanguageSwitcher` (check with grep before touching; leave i18n files alone unless it is truly unused AND you also remove it from both files — prefer leaving it).
- Conventions: remove imports/files only when your change made them unused.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Typecheck | `npm run typecheck` | exit 0 |
| All tests | `npm test` | exit 0 |

## Scope

**In scope**: `src/components/AppShell.tsx`; `src/components/LanguageSwitcher.tsx` (delete the file).

**Out of scope**: the Settings page, `setLocale`, i18n files, the boot script.

## Git workflow

- Branch: `advisor/021-remove-header-language`
- One commit; message ends with `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.
- Do NOT push or open a PR.

## Steps

### Step 1: Confirm nothing else uses the switcher

**Verify**: `grep -rn "LanguageSwitcher" src tests` → matches only in `AppShell.tsx` (import + use) and `LanguageSwitcher.tsx` itself.

### Step 2: Remove it from the header

In `AppShell.tsx` delete the import and the `<LanguageSwitcher />` element. Because the header then has one child, drop `justify-between` from the inner div: `className="mx-auto flex max-w-xl items-center gap-3 px-safe py-2"`. Delete `src/components/LanguageSwitcher.tsx`.

**Verify**: `npm run typecheck` → exit 0; `grep -rn "LanguageSwitcher" src tests` → no output; `npm test` → exit 0.

### Step 3: Manual check (say which parts you ran)

`npm run dev`: header shows only 💊 + app name; `/settings/` still switches language.

## Test plan

No automated test (presentational; the Settings language buttons are untouched).

## Done criteria

- [ ] `npm run typecheck` and `npm test` exit 0
- [ ] `grep -rn "LanguageSwitcher" src tests` returns nothing
- [ ] Only in-scope files changed
- [ ] `plans/README.md` status row updated

## STOP conditions

- Another file or test imports `LanguageSwitcher`.
- The Settings page no longer has its own language buttons (then keep the switcher and report).

## Maintenance notes

- A family helper who needs Portuguese must now go to Settings → 语言. If that proves annoying, a small text link in the "家人设置" section could be added later.
