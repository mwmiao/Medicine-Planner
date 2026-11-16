# Plan 028: The add/edit medicine form shows only the essentials; the rest is folded

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 3a00dfb..HEAD -- src/components/MedicationForm.tsx src/lib/i18n/pt.ts src/lib/i18n/zh.ts`
> If any of these changed, compare the "Current state" excerpts against the live code; on a mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW (layout only; no field is removed, no data or validation changes)
- **Depends on**: none
- **Category**: UX simplification (the user is an elderly Chinese-speaking person using an iPhone)
- **Planned at**: commit `3a00dfb`, 2026-11-16

## Why this matters

The add/edit form currently shows, in order: name, active substance, amount + unit, strength (规格), barcode (条形码 EAN), how often, times, doctor's instructions, notes, box colour, and an INFARMED link. For her the essentials are name, how much, how often, what time. Barcode, strength and active substance are technical and mostly filled by the box scan; showing them as empty boxes looks like homework. After this plan the essentials stay in view and the optional/technical fields sit in one folded section "更多信息（可不填）" just above the Save button. No field is removed and the saved data is identical.

## Current state

- `src/components/MedicationForm.tsx` renders, in this order inside `<form className="flex flex-col gap-5">`:
  1. scan button, `BoxScanner`, `sameBox` notice, `v.ocr` notice, the `showInfarmed` card, the `v.infarmed?.matched` success notice
  2. `Field` name (`id="name"`, lines ~179-181)
  3. `Field` active substance (`id="substance"`, ~183-191)
  4. `<div className="grid grid-cols-1 gap-3">` with `Field` quantity stepper (`id="qty"`), `Field` unit select, and the `doseUnitLooksWrong` warning (~193-227)
  5. `Field` strength (`id="dosage"`, ~229-231)
  6. `Field` barcode (`id="ean"`, ~233-241)
  7. `<fieldset>` frequency (~243-295) and `<fieldset>` times (~297-324)
  8. `Field` instructions with preset chips (`id="instr"`, ~326-340)
  9. `Field` notes (`id="notes"`, ~342-344)
  10. `<fieldset>` colour (~346-369)
  11. the "🔗 link INFARMED (optional)" ghost button, shown only when `!v.infarmed?.matched && !showInfarmed` (~371-375)
  12. error `Notice` and the Save `Button type="submit"`.
- Folded sections elsewhere use native `<details>`/`<summary>` — exemplar: `src/app/settings/page.tsx` lines 114-121:
```tsx
<details id="family" open={familyOpen} onToggle={...}>
  <summary className="flex min-h-16 cursor-pointer list-none items-center justify-between gap-3 rounded-3xl bg-white p-5 shadow-sm ring-1 ring-line [&::-webkit-details-marker]:hidden">
    <span className="block text-2xl font-bold">{m.settings.familyTitle}</span>
    <span aria-hidden className="text-3xl text-muted">{familyOpen ? "−" : "+"}</span>
  </summary>
```
- i18n: `src/lib/i18n/pt.ts` defines the `Messages` type, `zh.ts` must have identical keys. The `form` block has `infarmedSection`, `notes`, `color` etc. `common.optional` is zh "可不填", pt "opcional".
- Validation (`validateMedication` in `src/lib/medications.ts`) only checks name, quantity, times, frequency fields — none of the fields being folded. Do not change it.
- Conventions: 2-space indent, double quotes, large tap targets (`min-h-16` for primary controls), Portuguese code comments.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Typecheck | `npm run typecheck` | exit 0 |
| All tests | `npm test` | exit 0 |
| Build | `npm run build` | exit 0 |

## Scope

**In scope**: `src/components/MedicationForm.tsx`, `src/lib/i18n/pt.ts`, `src/lib/i18n/zh.ts`.

**Out of scope** (do NOT touch):
- `validateMedication`, `src/lib/medications.ts`, the data model, `MedicationInput`.
- `BoxScanner`, `InfarmedPanel`, the `showInfarmed` card and the matched-INFARMED notice (they stay where they are, above the name).
- The quantity/unit/`doseUnitLooksWrong` block, frequency, times, instructions + preset chips: they stay visible and unchanged.
- Removing or renaming any field.

## Git workflow

- Branch: `advisor/028-form-fold-optional`
- One commit; message ends with `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.
- Do NOT push or open a PR.

## Steps

### Step 1: Message (BOTH files, same key)

Add to the `form` block: `moreInfo`.
- pt: `moreInfo: "Mais informações (opcional)"`
- zh: `moreInfo: "更多信息（可不填）"`

**Verify**: `npm run typecheck` → exit 0.

### Step 2: Restructure the form

In `src/components/MedicationForm.tsx`, move these existing JSX blocks, byte-for-byte unchanged, into ONE `<details>` placed after the instructions `Field` (item 8) and before the error `Notice` / Save button:
- active substance `Field` (`id="substance"`)
- strength `Field` (`id="dosage"`)
- barcode `Field` (`id="ean"`)
- notes `Field` (`id="notes"`)
- colour `<fieldset>`
- the INFARMED link ghost button block (`{!v.infarmed?.matched && !showInfarmed ? … : null}`)

Wrapper (same classes as the Settings exemplar, but no open-state handling):

```tsx
<details className="rounded-3xl bg-white shadow-sm ring-1 ring-line">
  <summary className="flex min-h-16 cursor-pointer list-none items-center justify-between gap-3 p-5 text-xl font-bold [&::-webkit-details-marker]:hidden">
    {m.form.moreInfo}
    <span aria-hidden className="text-3xl text-muted">+</span>
  </summary>
  <div className="flex flex-col gap-5 px-5 pb-5">
    {/* moved blocks, in this order: substance, strength, barcode, notes, colour, INFARMED link */}
  </div>
</details>
```

The resulting visible order is: scan button and notices → name → quantity/unit → frequency → times → instructions → folded "更多信息" → error notice → Save. The name `Field` stays first; the quantity block moves up to directly follow it (it is currently after substance). Keep the "+" static (no state): a static "+" is acceptable, do not add open/close state.

Keep `id`s (`substance`, `dosage`, `ean`, `notes`) unchanged. The `onClose` handler of `BoxScanner` still focuses `#name`, which remains visible.

**Verify**: `npm run typecheck` → exit 0; `npm test` → exit 0.

### Step 3: Build

**Verify**: `npm run build` → exit 0.

## Test plan

No automated UI tests exist for this form and none are added (layout only). Reviewer checks on desktop and a ~375 px-wide viewport:
1. `/medications/new/`: visible fields are name, amount stepper + unit, frequency buttons, times, doctor's instructions, then a collapsed "更多信息（可不填）" row, then Save. Tapping the row reveals substance, strength, barcode, notes, colour, INFARMED link.
2. Fill name only and Save → saves with defaults (validation unchanged).
3. Scan a box (or type into the folded fields) → values appear when the fold is opened and are saved.
4. Edit an existing medicine that has notes/colour: values are present inside the fold and survive Save.
5. A liquid medicine with unit mg still shows the dose warning in the visible quantity area.

## Done criteria

- [ ] `npm run typecheck` exits 0
- [ ] `npm test` exits 0
- [ ] `npm run build` exits 0
- [ ] `grep -n "moreInfo" src/lib/i18n/pt.ts src/lib/i18n/zh.ts src/components/MedicationForm.tsx` shows the key in all three
- [ ] `grep -c 'id="substance"\|id="dosage"\|id="ean"\|id="notes"' src/components/MedicationForm.tsx` returns 4 (nothing deleted)
- [ ] Only in-scope files are modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

- The excerpts do not match the live code.
- Moving a block requires changing its internals or the validation.
- `npm run build` fails twice for a reason that is not caused by this change.

## Maintenance notes

- A field added to the form later should go in the fold unless she needs it to schedule a dose.
- The fold is closed even when it contains scanned values; the "资料已根据药盒照片自动填好，请快速核对一下。" notice above still tells her to check. If review decides scanned values must be visible, open the `<details>` when `v.ocr` is set — deliberately not done to keep this small.
- Deferred: hiding the barcode field entirely (it is filled by the scan and rarely typed).
