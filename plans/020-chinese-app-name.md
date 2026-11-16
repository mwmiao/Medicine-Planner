# Plan 020: The home-screen icon and page title are in Chinese

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 43fad38..HEAD -- src/app/layout.tsx public/manifest.webmanifest public/sw.js src/lib/i18n/zh.ts`
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

The app is now Chinese by default, but its home-screen icon label, browser tab title and notification fallback title are Portuguese ("Planeador"). On the elderly user's iPhone the icon reads "Planeador" and the iOS notification settings list "Planeador". After this plan new installs show "用药小助手". Existing installed icons keep their old name until the icon is removed and re-added (iOS reads the name at install time); this plan does NOT require that.

## Current state

- `src/app/layout.tsx:7-12`:
```ts
export const metadata: Metadata = {
  title: "Planeador de Medicação · 用药小助手",
  description: "Lembretes simples para tomar os medicamentos a horas. 按时吃药的简单提醒。",
  manifest: "/manifest.webmanifest",
  applicationName: "Planeador",
  appleWebApp: { capable: true, title: "Planeador", statusBarStyle: "default" },
```
- `public/manifest.webmanifest:2-4`: `"name": "Planeador de Medicação · 用药小助手"`, `"short_name": "Planeador"`, `"description": "Lembretes simples para tomar os medicamentos a horas."`, `"lang": "pt-PT"` (line 5).
- `public/sw.js:112`: `self.registration.showNotification(data.title || "💊 Planeador", {` (fallback title only; the server normally supplies `data.title`).
- `src/lib/i18n/zh.ts:292`: `denied: "通知被关闭了。请到 iPhone「设置」→「通知」→「Planeador」打开。",` (tells her which iOS entry to enable; must match the icon name).
- `README.md:126` mentions the blue icon "Planeador" (Portuguese install instructions) — leave Portuguese docs alone.
- Conventions: 2-space indent, double quotes; the owner earlier listed this as an open product decision and has now asked for the whole experience to be Chinese-first.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Typecheck | `npm run typecheck` | exit 0 |
| All tests | `npm test` | exit 0 |
| Build | `npm run build` | exit 0 (static export to `out/`; a `tests` file does not cover metadata) |

## Scope

**In scope**: `src/app/layout.tsx`, `public/manifest.webmanifest`, `public/sw.js`, `src/lib/i18n/zh.ts` (only the `denied` string).

**Out of scope**: `src/lib/i18n/pt.ts` and the Portuguese `README.md` (Portuguese users still see "Planeador" in their own texts), icon images, `package.json`.

## Git workflow

- Branch: `advisor/020-chinese-app-name`
- One commit; message ends with `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.
- Do NOT push or open a PR.

## Steps

### Step 1: Metadata and manifest

- `layout.tsx`: `title: "用药小助手 · Planeador de Medicação"`, `applicationName: "用药小助手"`, `appleWebApp: { capable: true, title: "用药小助手", statusBarStyle: "default" }`. Keep `description` unchanged.
- `manifest.webmanifest`: `"name": "用药小助手 · Planeador de Medicação"`, `"short_name": "用药小助手"`, `"lang": "zh-CN"`, `"description": "按时吃药的简单提醒。"`.
- `sw.js:112`: fallback `"💊 用药小助手"`.
- `zh.ts` `denied`: replace `「Planeador」` with `「用药小助手」`.

**Verify**: `npm run typecheck` → exit 0; `grep -rn "Planeador" src/app public/manifest.webmanifest public/sw.js src/lib/i18n/zh.ts` → only the `title` in `layout.tsx` (the `· Planeador de Medicação` suffix) and the same suffix in the manifest `name`.

### Step 2: Check the build

**Verify**: `npm run build` → exit 0; `grep -o "short_name[^,]*" out/manifest.webmanifest` → `short_name":"用药小助手"`.

## Test plan

No automated test (static metadata). The owner re-adds the icon on a spare phone or browser to see the new name; existing installs are unchanged.

## Done criteria

- [ ] `npm run typecheck`, `npm test` and `npm run build` exit 0
- [ ] `grep -n short_name public/manifest.webmanifest` shows `用药小助手`
- [ ] Only in-scope files changed (do not commit build output)
- [ ] `plans/README.md` status row updated

## STOP conditions

- `npm run build` fails for a reason unrelated to the strings.
- Any excerpt doesn't match the live code.

## Maintenance notes

- The Portuguese-side texts (`pt.ts` line ~308 "Planeador") describe the iOS entry of a Portuguese-named icon; if the icon is Chinese for everyone, update them too in a follow-up.
- Changing the icon name does not affect push subscriptions (they are tied to the site, not the name).
- Changing `manifest.webmanifest` content is picked up by the service worker's normal update; check `public/sw.js` caches the manifest by network-first or revalidates (if it precaches by name, bump its cache version constant).
