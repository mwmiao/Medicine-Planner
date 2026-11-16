# Plan 018: Warn when a liquid medicine's dose is set in mg (strength confused with dose)

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 43fad38..HEAD -- src/lib/medications.ts src/components/MedicationForm.tsx src/app/medications/view/page.tsx src/lib/i18n/pt.ts src/lib/i18n/zh.ts tests/medications.test.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" notes against the live code; on a mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug (safety)
- **Planned at**: commit `43fad38`, 2026-11-15

## Why this matters

On the live site the saved medicine "Atovaquona Kabi" (form "Suspensão oral", box strength "750 mg/5 ml") shows its dose as **"5 毫克" (5 mg)** on Today and in the medicines list. On a 750 mg/5 ml suspension, "5" is almost certainly millilitres, not milligrams: the user picked or kept the unit "mg" and the "mg" stepper ladder starts at 5. An elderly user who reads "5 mg" may take a wrong amount. The app must never silently present a box *strength* as a *dose*. After this plan, whenever the dose unit is "mg" but the medicine is a liquid or its strength is written as a concentration (`X mg/Y ml`), the form and the detail page show a clear warning asking to check the dose with the doctor's prescription. No dose is ever changed automatically.

## Current state

- `src/lib/medications.ts:98-107` — `unitFromForm(form)`: maps a pharmaceutical form text to a `Unit` (`"ml"` for xarope/solu/suspens/elixir/syrup/liquid; `"tablet"`, `"capsule"`, `"drop"`; otherwise `undefined`).
- `src/lib/medications.ts:109-117` — `LADDERS`; the `mg` ladder is `[5, 10, 20, 25, 50, 100, 200, 250, 500, 1000]` and `ml` is `[1, 2.5, 5, 7.5, 10, 15, 20]`.
- `src/components/MedicationForm.tsx:59-74` — `onOcr` copies `ocr.strength` into `dosage` and only switches the unit when the current unit is `"tablet"`: `unit: s.unit === "tablet" ? (unitFromForm(ocr.form) ?? s.unit) : s.unit`.
- `src/components/MedicationForm.tsx:194-224` — the quantity stepper (− / value / +) and the `unit` `<Select id="unit">` (options from `UNITS`).
- `src/app/medications/view/page.tsx:59-91` — "Schedule" `<Card>` with `<dl>`; the dose row is `<dd className="font-semibold">{formatDose(med, m)}</dd>` (line 64).
- `src/lib/format.ts:5-9` — `formatDose(med, m)`: for units `mg`/`ml` it returns only the quantity text (strength hidden).
- `src/components/ui.tsx` exports `Notice` (props: `tone?: "info" | "warn" | "error"`, children). Match the existing usage `<Notice tone="warn">…</Notice>`.
- Types: `Medication` has `unit: Unit`, `quantityPerDose: number`, `dosage: string` (strength text), `pharmaceuticalForm?: string`.
- i18n: `src/lib/i18n/pt.ts` defines the `Messages` type; `src/lib/i18n/zh.ts` is typed `Messages`, so every new key goes into BOTH files. Block `meds` holds detail/list texts; block `form` holds form texts (e.g. `form.errors`).
- Conventions: Portuguese code comments, 2-space indent, double quotes, tests in `tests/*.test.ts` (Vitest). Model new tests on `tests/medications.test.ts`.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Typecheck | `npm run typecheck` | exit 0 |
| All tests | `npm test` | exit 0 (146 passed at planning time) |

## Scope

**In scope**: `src/lib/medications.ts`, `src/components/MedicationForm.tsx`, `src/app/medications/view/page.tsx`, `src/lib/i18n/pt.ts`, `src/lib/i18n/zh.ts`, `tests/medications.test.ts`.

**Out of scope**: automatically changing the unit or the quantity; the AI/server code; `formatDose` output; stored data migration (existing records are only *warned about*).

## Git workflow

- Branch: `advisor/018-liquid-dose-unit`
- One commit, short imperative message, ending with `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.
- Do NOT push or open a PR.

## Steps

### Step 1: Pure check function

In `src/lib/medications.ts` add and export:

```ts
/** Dose em mg num líquido ou com concentração "X mg/Y ml": a "dose" provavelmente é a força da caixa, não a quantidade a tomar. */
export function doseUnitLooksWrong(med: Pick<MedicationInput, "unit" | "dosage" | "pharmaceuticalForm">): boolean {
  if (med.unit !== "mg") return false;
  const concentration = /\d\s*(mg|g|mcg|µg)\s*\/\s*\d*[.,]?\d*\s*(ml|mL)/i.test(med.dosage ?? "");
  return concentration || unitFromForm(med.pharmaceuticalForm) === "ml";
}
```
(Use the real input type already imported in the file; `MedicationInput` is exported from this file. If the field is typed differently, adapt types only.)

**Verify**: `npm run typecheck` → exit 0.

### Step 2: Messages (BOTH files)

Add key `meds.checkDose` (a string) and `form.checkDose` (same meaning):

| key | pt | zh |
|---|---|---|
| `meds.checkDose` | `Atenção: a dose está em mg, mas este medicamento é líquido (a caixa indica uma concentração). Confirme com a receita do médico quantos ml deve tomar.` | `请注意：每次用量写的是“毫克”，但这是液体药（药盒上的数字是浓度）。请对照医生的处方，确认每次要喝多少毫升。` |
| `form.checkDose` | same as `meds.checkDose` | same as `meds.checkDose` |

**Verify**: `npm run typecheck` → exit 0.

### Step 3: Show the warning

1. `MedicationForm.tsx`: directly under the unit `<Field>` (after the `</Field>` that closes `htmlFor="unit"`), render `{doseUnitLooksWrong(v) ? <Notice tone="warn">{m.form.checkDose}</Notice> : null}`. Add `doseUnitLooksWrong` to the existing `@/lib/medications` import.
2. `view/page.tsx`: inside the "Schedule" card, directly after the `</dl>`, render `{doseUnitLooksWrong(med) ? <div className="mt-3"><Notice tone="warn">{m.meds.checkDose}</Notice></div> : null}`. Add the import.

**Verify**: `npm run typecheck` → exit 0; `grep -n "doseUnitLooksWrong" src -r` → 1 definition + 2 uses.

### Step 4: Tests

In `tests/medications.test.ts` add a `describe("doseUnitLooksWrong")` with: unit mg + `"750 mg/5 ml"` → true; unit mg + form `"Suspensão oral"` + dosage `""` → true; unit ml + `"750 mg/5 ml"` → false; unit mg + `"500 mg"` + form `"Comprimido"` → false; unit tablet + `"500 mg"` → false.

**Verify**: `npm test` → exit 0, 5 more tests than baseline.

## Test plan

Covered in Step 4 (pure function). The two UI hooks are a one-line conditional each; the owner checks on the phone: open the Atovaquona Kabi medicine → yellow warning under the dose.

## Done criteria

- [ ] `npm run typecheck` exits 0; `npm test` exits 0 with the 5 new tests
- [ ] `grep -rn "doseUnitLooksWrong" src` shows 1 definition and 2 uses
- [ ] Only in-scope files changed
- [ ] `plans/README.md` status row updated

## STOP conditions

- The excerpts above don't match the live code.
- `MedicationInput` has no `pharmaceuticalForm` or `dosage` field (then stop and report the real field names).
- Making the warning appear requires changing stored data or auto-changing the unit.

## Maintenance notes

- This only warns; it deliberately does not convert mg to ml, because the doctor's prescription decides the amount.
- If a new `Unit` is added, review `doseUnitLooksWrong`.
- Reviewer: check the regex does not warn on plain tablet strengths such as "500 mg".
