# Plan 022: Hide technical leftovers on the medicine page and show the medicine form in Chinese

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 43fad38..HEAD -- src/app/medications/view/page.tsx src/components/MedicalInfoSection.tsx src/lib/format.ts src/lib/i18n/pt.ts src/lib/i18n/zh.ts tests/format.test.ts`
> If any in-scope file changed since this plan was written (plans 018 and 019 are expected to change `view/page.tsx` and `MedicalInfoSection.tsx` — that is fine, locate the same lines by content), compare the "Current state" notes against the live code; on a real mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: 019 (same file `MedicalInfoSection.tsx`; run one at a time, 019 first)
- **Category**: direction (usability)
- **Planned at**: commit `43fad38`, 2026-11-15

## Why this matters

On a medicine's page the Chinese-speaking user sees things meant for the family or the developer: "还没有连接 INFARMED。" (a notice about a Portuguese registry she has never heard of), a "从药盒识别（照片）" box listing raw scan fields, and the dosage form in Portuguese ("Suspensão oral"). These add clutter and confusion. After this plan: the INFARMED notice disappears; the scan-data block is folded in a closed `<details>` titled with the same text; and the pharmaceutical form is shown in Chinese (口服混悬液) when the app language is Chinese. Stored data is unchanged; this is display only.

## Current state

- `src/app/medications/view/page.tsx:56`: `{med.pharmaceuticalForm ? <p className="text-lg text-muted">{med.pharmaceuticalForm}</p> : null}`
- `src/app/medications/view/page.tsx:101`: `{!med.infarmed?.matched ? <Notice>{m.infarmed.notLinked}</Notice> : null}` — `zh` text "还没有连接 INFARMED。".
- `src/components/MedicalInfoSection.tsx:305-319` — the scan block:
```tsx
{med.ocr ? (
  <Block title={m.info.ocrTitle} badge={<SourceBadge source="box" />}>
    <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-lg">
      {(["name", "activeSubstance", "strength", "form", "packCount", "expiry", "manufacturer"] as const)
        .filter((k) => med.ocr?.[k])
        .map((k) => (
          <div key={k} className="contents">
            <dt className="text-muted">{m.scan.fields[k]}</dt>
            <dd className="font-semibold">{med.ocr?.[k]}</dd>
          </div>
        ))}
    </dl>
    <p className="mt-2 text-base text-muted">{formatIsoDate(med.ocr.capturedAt, locale)}</p>
  </Block>
) : null}
```
- `src/lib/format.ts` — formatting helpers (`formatDose`, `describeFrequency`, `formatDateTimeShort`, `formatIsoDate`); `Locale` type is `"pt" | "zh"` (`src/lib/types.ts`). Tests for format helpers: `tests/` — check `ls tests` for a format test; if none exists create `tests/format.test.ts` modelled on `tests/medications.test.ts` (Vitest, `import { describe, it, expect } from "vitest"`).
- Conventions: Portuguese comments, 2-space indent, double quotes.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Typecheck | `npm run typecheck` | exit 0 |
| All tests | `npm test` | exit 0 |

## Scope

**In scope**: `src/app/medications/view/page.tsx`, `src/components/MedicalInfoSection.tsx`, `src/lib/format.ts`, `tests/format.test.ts` (create if no format test exists), `src/lib/i18n/pt.ts`/`zh.ts` only if a new key is needed (none expected).

**Out of scope**: the add/edit form, stored `pharmaceuticalForm` values, the INFARMED link block (shown only when matched), the INFARMED link button in the form, server code.

## Git workflow

- Branch: `advisor/022-hide-technical`
- One commit; message ends with `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.
- Do NOT push or open a PR.

## Steps

### Step 1: A display-only form translator

In `src/lib/format.ts` add and export:

```ts
/** Nome do formato (ex.: "Suspensão oral") em chinês; fora do chinês ou sem correspondência devolve o texto original. */
export function formatPharmaceuticalForm(form: string, locale: Locale): string {
  if (locale !== "zh") return form;
  const f = form.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  const table: [RegExp, string][] = [
    [/suspens/, "口服混悬液"],
    [/solu[cç]ao oral|solucao oral/, "口服溶液"],
    [/xarope/, "糖浆"],
    [/gota/, "滴剂"],
    [/capsul/, "胶囊"],
    [/comprimid|tablet/, "片剂"],
    [/drag/, "糖衣片"],
    [/pomada/, "软膏"],
    [/creme/, "乳膏"],
    [/\bgel\b/, "凝胶"],
    [/supositor/, "栓剂"],
    [/colirio/, "滴眼液"],
    [/injet|inject/, "注射剂"],
    [/\bpo\b|po para/, "散剂"],
  ];
  return table.find(([re]) => re.test(f))?.[1] ?? form;
}
```
(Put "suspens" before the plain "solucao oral" rule so "Suspensão oral" maps to 口服混悬液. Normalised text has no accents, so one `solucao` spelling is enough: simplify that regex to `/solucao oral/`.)

**Verify**: `npm run typecheck` → exit 0.

### Step 2: Use it, hide the INFARMED notice, fold the scan data

1. `view/page.tsx:56`: show `formatPharmaceuticalForm(med.pharmaceuticalForm, locale)` (import it; `locale` is already destructured from `useMessages()`).
2. `view/page.tsx:101`: delete the `notLinked` Notice line. Remove the `Notice` import only if it is now unused in this file (it is still used for the not-found error, so it stays).
3. `MedicalInfoSection.tsx` scan block: wrap the block in `<details className="rounded-2xl border-2 border-line p-3 text-lg">` with `<summary className="min-h-12 cursor-pointer text-lg font-bold">{m.info.ocrTitle}</summary>` and put the existing `<dl>` and date `<p>` inside it, replacing the `<Block …>` wrapper (the `SourceBadge` is dropped for this block). In the `<dd>` for key `"form"`, display `formatPharmaceuticalForm(med.ocr.form, locale)`; other keys unchanged.
4. Leave `m.infarmed.notLinked` in the i18n files (still typed in `Messages`; removing keys is out of scope).

**Verify**: `npm run typecheck` → exit 0; `grep -n "notLinked" src -r` → only the two i18n files.

### Step 3: Tests

Create or extend the format test: `formatPharmaceuticalForm("Suspensão oral","zh")` → `"口服混悬液"`; `("Comprimido revestido","zh")` → `"片剂"`; `("Cápsula","zh")` → `"胶囊"`; `("Suspensão oral","pt")` → `"Suspensão oral"`; `("Forma desconhecida","zh")` → `"Forma desconhecida"`.

**Verify**: `npm test` → exit 0, new tests included.

## Test plan

Pure-function tests in Step 3; the folding is presentational (owner checks on the phone: no INFARMED line; the scan box is a closed fold).

## Done criteria

- [ ] `npm run typecheck` and `npm test` exit 0
- [ ] `grep -rn "m.infarmed.notLinked" src` returns nothing
- [ ] `grep -rn "formatPharmaceuticalForm" src` shows 1 definition and ≥ 2 uses
- [ ] Only in-scope files changed
- [ ] `plans/README.md` status row updated

## STOP conditions

- The excerpts don't match (after allowing for plans 018/019 edits).
- Translating the form requires changing stored data.

## Maintenance notes

- The table covers the common Portuguese dosage forms only; unknown forms fall back to the original text on purpose (never guess).
- If the app ever shows the form in the edit form's field, keep that as the stored Portuguese text.
