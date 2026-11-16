# Plan 023: Show the Chinese drug name under the medicine name

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 43fad38..HEAD -- server/ai.mjs server/ai.d.mts src/lib/ai.ts src/lib/types.ts src/components/MedicalInfoSection.tsx src/app/medications/view/page.tsx tests/ai.test.ts tests/ai-client.test.ts src/lib/i18n/pt.ts src/lib/i18n/zh.ts`
> Plans 018, 019 and 022 are expected to have edited `MedicalInfoSection.tsx` and `view/page.tsx`; locate lines by content. On any other mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: LOW
- **Depends on**: 019 and 022 (same files; run one at a time, in order 019, 022, 023)
- **Category**: direction (usability)
- **Planned at**: commit `43fad38`, 2026-11-15

## Why this matters

The medicine page title and ingredient are in Portuguese ("Atovaquona Kabi", "Atovaquona"). The Chinese name (阿托伐醌) appears only buried inside the instructions text. The user's mother recognises medicines by their Chinese name. The instruction pipeline already calls Claude with the US label for the same substance, so Claude can return the Chinese generic name in the same call at no extra cost. After this plan the detail page shows "中文名：阿托伐醌" under the title when known. Brand names are never translated; only the active substance (generic) name is.

## Current state

- `server/ai.mjs:111-120` — `INSTRUCTIONS_SYSTEM` prompt; its last line defines the JSON shape: `{"legible": true, "zh": {…}, "en": {…}}`. Rule 1: "Use ONLY the label text provided … never use outside knowledge" (the generic name is in the label text, e.g. the section texts mention "ATOVAQUONE").
- `server/ai.mjs:347-356` — in `instructions(body)`: `const second = await callClaude(INSTRUCTIONS_SYSTEM, 3000, [...]); … const result = { found: true, zh: cleanSections(second.reply.zh, true), en: cleanSections(second.reply.en, true), sourceName: … }` then adds `sourceUrl`. `genericName` (English) is a variable in scope there.
- `server/ai.d.mts` — hand-written types for the server module.
- `src/lib/ai.ts:44-46`:
```ts
export type InstructionsResult =
  | { found: false }
  | { found: true; zh: Sections; en: Sections; sourceName?: string; sourceUrl?: string };
```
- `src/lib/types.ts:29-44` — `MedicalInfo` (optional fields `translatedBy`, `original`, `originalLanguage`, `sourceUrl`, `sourceName`). Adding another optional field is additive and syncs through the NAS JSON as-is (stored inside `medicalInfo`).
- `src/components/MedicalInfoSection.tsx:88-97` — `autoSearch` builds `next: MedicalInfo` from `r` and calls `onSave(next)`; the manual `save()` (lines ~130-143) copies selected optional fields when present.
- `src/app/medications/view/page.tsx:51-57` — title block: `<h1>` with `med.name`, then `med.activeSubstance` paragraph, then the form paragraph.
- Tests: `tests/ai.test.ts` (fake Claude + openFDA via `fetchFn`; `createAi({ apiKey: "k", fetchFn }).instructions(input)`; some assertions use `toEqual` on the whole body — they must be updated, not weakened); `tests/ai-client.test.ts` (client). Follow their existing fake helpers.
- Conventions: Portuguese comments, 2-space indent, double quotes; `zh.ts` is typed `Messages`, new i18n keys in BOTH `pt.ts` and `zh.ts`.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Typecheck | `npm run typecheck` | exit 0 |
| All tests | `npm test` | exit 0 (146 passed at planning time, more after 018/022) |

## Scope

**In scope**: `server/ai.mjs`, `server/ai.d.mts`, `src/lib/ai.ts`, `src/lib/types.ts`, `src/components/MedicalInfoSection.tsx`, `src/app/medications/view/page.tsx`, `src/lib/i18n/pt.ts`, `src/lib/i18n/zh.ts`, `tests/ai.test.ts`, `tests/ai-client.test.ts`.

**Out of scope**: the leaflet and box routes, the INN lookup prompt, the openFDA query/label-picking logic, how `medicine.name` is stored, translating brand names, any new Claude call.

## Git workflow

- Branch: `advisor/023-chinese-drug-name`
- One commit; message ends with `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.
- Do NOT push or open a PR.

## Steps

### Step 1: Server returns `nameZh`

1. In `INSTRUCTIONS_SYSTEM` add rule 8 before the "Respond with ONLY…" line: `8. nameZh = the standard Simplified Chinese generic (active-ingredient) name of the label's active substance, in 1 to 20 characters, as used in mainland Chinese pharmacopoeia and pharmacy practice (not a brand name). If you are not sure of it, use an empty string.` Extend the JSON shape to `{"legible": true, "nameZh": "", "zh": {…}, "en": {…}}`.
2. In `instructions()` after building `result`, add: `const nameZh = typeof second.reply.nameZh === "string" ? second.reply.nameZh.trim() : ""; if (nameZh && nameZh.length <= 20 && !/[\n<>]/.test(nameZh)) result.nameZh = nameZh;`
3. `server/ai.d.mts`: add `nameZh?: string` to the instructions result type if that type is declared there.

**Verify**: `npm run typecheck` → exit 0.

### Step 2: Client and stored type

- `src/lib/ai.ts`: add `nameZh?: string` to the `found: true` variant of `InstructionsResult`.
- `src/lib/types.ts`: add `nameZh?: string;` to `MedicalInfo` with the comment `// nome genérico em chinês (da etiqueta pública)`.
- `MedicalInfoSection.tsx` `autoSearch`: after `if (r.sourceName) …` add `if (r.nameZh) next.nameZh = r.nameZh;`. In `save()` add `if (draft.nameZh) cleaned.nameZh = draft.nameZh;` next to the other copied optional fields (so editing the text does not drop it).

**Verify**: `npm run typecheck` → exit 0.

### Step 3: Show it

In `view/page.tsx` title block, after the `activeSubstance` paragraph add: `{med.medicalInfo?.nameZh ? <p className="text-xl font-semibold">{m.meds.chineseName}：{med.medicalInfo.nameZh}</p> : null}`. Add key `meds.chineseName`: pt `Nome em chinês`, zh `中文名` in BOTH i18n files (use `: ` instead of `：` in the pt string by rendering the colon from the key: define the key WITHOUT a colon and render `{m.meds.chineseName}: {…}`; in zh the half-width colon is acceptable).

**Verify**: `npm run typecheck` → exit 0.

### Step 4: Tests

- `tests/ai.test.ts`: in the happy-path instructions test make the fake Claude reply include `nameZh: "阿托伐醌"` and assert `r.body.nameZh === "阿托伐醌"`; add one test where the reply has `nameZh` of 25 characters or containing `<` → the result has no `nameZh`; update any whole-body `toEqual` assertion that now sees the extra key only if the fake reply includes it (leave the other tests' replies without `nameZh` and unchanged).
- `tests/ai-client.test.ts`: no change expected; run it.

**Verify**: `npm test` → exit 0.

## Test plan

Server tests above (accepts a valid name, rejects an over-long/odd one, omits it when absent). UI line is a single conditional; owner checks: re-run "重新查找" for a medicine and see the Chinese name appear. Existing medicines get a name only after their instructions are regenerated (or via 重新查找); no migration.

## Done criteria

- [ ] `npm run typecheck` and `npm test` exit 0 with the new tests
- [ ] `grep -rn "nameZh" server src tests` shows server, client, type, view and tests
- [ ] Only in-scope files changed
- [ ] `plans/README.md` status row updated

## STOP conditions

- The excerpts don't match the live code beyond the expected plan 018/019/022 edits.
- Adding the field forces any change to the Dexie schema or sync merge code (it should not; `medicalInfo` is stored as an object).
- A step's verification fails twice.

## Maintenance notes

- The Chinese name comes from Claude, not from the label text: it is a naming aid only and the page must keep the Portuguese name as the primary title. Have a pharmacist spot-check a few names.
- Existing records only get `nameZh` after "重新查找"; a later plan could backfill automatically.
