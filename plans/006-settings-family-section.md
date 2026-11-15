# Plan 006: Settings shows her two controls first and tucks family/technical options away

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 34ffff1..HEAD -- src/app/settings/page.tsx src/app/page.tsx src/lib/i18n/pt.ts src/lib/i18n/zh.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: LOW
- **Depends on**: none (but if plan 007 or 008 already ran, re-check the `pt.ts`/`zh.ts` drift; they only add keys elsewhere)
- **Category**: direction (usability)
- **Planned at**: commit `34ffff1`, 2026-11-15

## Why this matters

The Settings tab is the third tab of the bottom bar, so the elderly user can
reach it. It currently is one long scroll in which her only two controls
(language, text size) are separated by technical sections: NAS sync code,
Web-Push setup, iPhone-alarm workarounds, "add to home screen" steps (shown even
when already installed), JSON export/import, INFARMED, and "delete all data".
After this plan: language and text size are the first two cards; everything
meant for the family member who installs the app sits in one collapsed card
"家人设置 / Para a família", and the install steps disappear once the app is
installed. Links from the Today screen that must land on NAS setup open that
card automatically.

## Current state

`src/app/settings/page.tsx` renders, in this order (line numbers at planning time):
`Section language` (90), `<SyncSection />` (94), `Section textSize` (96),
`<RemindersSection />` (108), `Section remindersTitle` — iPhone alarms (110),
`Section installTitle` (119), `Section backup` (127), `Section infarmedTitle` (149),
`Section privacyTitle` with the "delete all" button (154), then five
`<ConfirmDialog>`s (import ×1, delete ×2) as fixed overlays at the end.

`Section` is a local helper (`<Card>` + `<h2 className="mb-3 text-2xl font-bold">`).
`ConfirmDialog` returns `null` when closed and otherwise renders a `fixed`
overlay — **it must stay outside the `<details>` element** (content of a closed
`<details>` is not displayed even if positioned fixed).

`isStandalone()` is exported from `src/lib/push.ts` (true when running from the
iOS home screen). `RemindersSection` and `SyncSection` are self-contained cards.

The Today screen links to settings in two places in `src/app/page.tsx`:

```tsx
<LinkButton href="/settings/" block>{m.sync.todayPromptAction}</LinkButton>          // sync "off" prompt
<a href="/settings/" className="underline">{m.sync.todayProblem}</a>                 // sync problem notice
```

i18n: `src/lib/i18n/pt.ts` defines the message object; `export type Messages = typeof pt;`.
`src/lib/i18n/zh.ts` is typed `const zh: Messages`, so a key missing in `zh`
fails `npm run typecheck`. The `settings: { ... }` block is near the end of each file.

Conventions: Portuguese code comments; Tailwind utility classes; big touch
targets (`min-h-14`+), text ≥ `text-lg`; follow `src/components/ui.tsx` (`Card`).

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Typecheck | `npm run typecheck` | exit 0 |
| All tests | `npm test` | exit 0 (74 passed at planning time) |
| Dev server | `npm run dev` | app on http://localhost:3000 |

## Scope

**In scope**:
- `src/app/settings/page.tsx`
- `src/app/page.tsx` (only the two `/settings/` hrefs)
- `src/lib/i18n/pt.ts`, `src/lib/i18n/zh.ts` (add two keys to `settings`)

**Out of scope**:
- `SyncSection.tsx`, `RemindersSection.tsx`, `ConfirmDialog.tsx` — unchanged.
- Rewording any existing Chinese/Portuguese text, removing any section, or changing what any button does.
- `BottomNav.tsx`.

## Git workflow

- Branch: `advisor/006-settings-family-section`
- One commit, short imperative message.
- Do NOT push or open a PR.

## Steps

### Step 1: Add the two message keys

In the `settings` block of `pt.ts` add:

```ts
familyTitle: "Para a família",
familyHint: "Ligação ao NAS, lembretes, cópia de segurança e outras opções para quem instalou a app.",
```

In `zh.ts` add (same position):

```ts
familyTitle: "家人设置",
familyHint: "连接 NAS、手机提醒、备份等，供帮忙安装应用的家人使用。",
```

**Verify**: `npm run typecheck` → exit 0.

### Step 2: Restructure the page

In `src/app/settings/page.tsx`:

1. Import `useEffect` (add to the React import) and `isStandalone` from `@/lib/push`.
2. Add state inside `SettingsPage`:

```tsx
const [familyOpen, setFamilyOpen] = useState(false);
const [standalone, setStandalone] = useState(false);
useEffect(() => {
  setStandalone(isStandalone());
  // Ligações vindas do ecrã "Hoje" (/settings/#family) abrem a secção da família.
  if (window.location.hash === "#family") setFamilyOpen(true);
}, []);
```

3. New order of the returned JSX:
   - `<PageTitle>`
   - `Section language` (unchanged)
   - `Section textSize` (unchanged; moved up)
   - one `<details id="family" open={familyOpen} onToggle={(e) => setFamilyOpen(e.currentTarget.open)}>` containing, in this order and otherwise unchanged: `<SyncSection />`, `<RemindersSection />`, the iPhone-alarms `Section`, the install `Section` **rendered only when `!standalone`**, the backup `Section`, the INFARMED `Section`, the privacy/delete `Section`. Wrap the children in `<div className="mt-5 flex flex-col gap-5">`.
   - the `<ConfirmDialog>`s, **after** (outside) the `</details>`.
4. The `<summary>`:

```tsx
<summary className="flex min-h-16 cursor-pointer list-none items-center justify-between gap-3 rounded-3xl bg-white p-5 shadow-sm ring-1 ring-line">
  <span>
    <span className="block text-2xl font-bold">{m.settings.familyTitle}</span>
    <span className="block text-base text-muted">{m.settings.familyHint}</span>
  </span>
  <span aria-hidden className="text-3xl text-muted">{familyOpen ? "−" : "+"}</span>
</summary>
```

(`list-none` plus, if the default marker still shows in Safari, add a
`[&::-webkit-details-marker]:hidden` class.)

**Verify**: `npm run typecheck` → exit 0.

### Step 3: Point the Today links at the family card

In `src/app/page.tsx` change only the two hrefs `"/settings/"` → `"/settings/#family"`.

**Verify**: `grep -n "settings/" src/app/page.tsx` → both lines show `#family`.

### Step 4: Full verification

`npm run typecheck` → exit 0; `npm test` → exit 0 (no test should change).

Manual (state whether you ran it; the UI has no component tests): `npm run dev`,
open `/settings/` at 375 px width, in 中文:
- Cards visible in order: 语言, 字体大小, then the collapsed 家人设置 bar.
- Tapping the bar expands it; the Sync card, reminders, backup, delete-all are inside.
- Open `/settings/#family` directly → it is already expanded.
- With Today showing the "连接 NAS" prompt (needs `SYNC_CODE` server) tapping it lands expanded.
- Tap 删除所有资料 → the confirm dialog still appears (it lives outside the details).
- Standalone install steps hidden only when launched from the home screen (cannot be tested on desktop; say so).

## Test plan

No automated test: the repo's Vitest setup is `environment: "node"` with no
component testing library, and adding one is out of scope. Rely on typecheck +
the manual checklist above, and say explicitly which items you could not run.

## Done criteria

- [ ] `npm run typecheck` exits 0; `npm test` exits 0
- [ ] `grep -n "<ConfirmDialog" src/app/settings/page.tsx` — every match is on a line after the `</details>` line
- [ ] `grep -n "familyTitle" src/lib/i18n/pt.ts src/lib/i18n/zh.ts` returns one match in each file
- [ ] `git status` shows only the four in-scope files changed
- [ ] `plans/README.md` status row updated

## STOP conditions

- The settings page section order differs materially from "Current state".
- You cannot keep the `ConfirmDialog`s outside `<details>` without restructuring state.
- A `Section` you moved needs a prop or behaviour change to work inside `<details>`.

## Maintenance notes

- Any new technical or caregiver-only setting belongs inside the `#family` details; only things the elderly user herself changes belong above it.
- Anything that links to settings for NAS/reminder setup must use `/settings/#family`.
- The `+`/`−` indicator follows `familyOpen`; if a reviewer sees them out of sync after back-navigation, `onToggle` is the place to look.
