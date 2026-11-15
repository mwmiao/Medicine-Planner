# Plan 015: Photograph the box, then only press buttons — no typing to add a medicine

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 944ed23..HEAD -- src/components/BoxScanner.tsx src/components/MedicationForm.tsx src/lib/medications.ts src/lib/i18n/pt.ts src/lib/i18n/zh.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" notes against the live code; on a mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: LOW–MED (skips a confirmation screen in one safe case)
- **Depends on**: none (plans 011 and 014 are already on `main`)
- **Category**: direction (usability)
- **Planned at**: commit `944ed23`, 2026-11-15

## Why this matters

The owner wants the least typing and tapping possible: the box photo should be
read by Claude (plan 011) and fill in everything it can, so the older user only
presses the number of pills and the schedule buttons. Today, after the photo:
(1) a "use this photo" tap, (2) a review screen with editable text boxes and a
"use this data" tap, then back on the form (3) the pill amount is a **typed
number box** (`<TextInput type="number" id="qty">`) and (4) the unit is only
inferred for capsules. After this plan: with the AI reading ready, choosing a
photo starts reading immediately; if Claude is confident about every field the
review screen is skipped and the form is already filled; the pill amount is a
big − / + stepper; the unit is inferred from the pharmaceutical form
(tablet / capsule / ml / drop). When the review screen is skipped, the form
shows a short "filled from the box photo, please check" notice. The review
screen still appears whenever Claude flags a field as uncertain or reads no name.

## Current state

`src/components/BoxScanner.tsx` (phases: `start → preview → reading → review | failed`; `"camera"`/`"starting"` for the live camera):

```tsx
// Mostra a fotografia em grande; a leitura só começa com "Usar esta fotografia".
const showPhoto = (blob: Blob, from: Source) => {
  clearPhoto(); setError(null); setSource(from);
  setPhoto({ blob, url: URL.createObjectURL(blob) });
  setPhase("preview");
};
...
const read = async (blob: Blob) => { ... 
    if (aiReady) {
      try {
        setStage("ai");
        const ai = await readBoxPhoto(await fileToJpegBase64(blob));
        if (ctrl.signal.aborted) return;
        if (ai.legible) {
          const f = ai.fields;
          const next: ParsedBox = { ...f, ean: code?.ean ?? (f.ean && validGtin(f.ean) ? f.ean : undefined), expiry: f.expiry ?? code?.expiry };
          setBarcode(code); setRaw(""); setFields(next);
          setUnsure(new Set(ai.uncertain.filter((k): k is keyof ParsedBox => k in next)));
          setPhase("review");
          return;
        }
      } catch { /* sem chave, sem rede ou limite: usa o OCR no telemóvel */ }
    }
    ... on-phone OCR path unchanged ...
const confirm = () => {
  const clean = (v?: string) => v?.trim() || undefined;
  onExtract({ rawText: raw, name: clean(fields.name), activeSubstance: clean(fields.activeSubstance), strength: clean(fields.strength),
    form: clean(fields.form), packCount: clean(fields.packCount), expiry: clean(fields.expiry), manufacturer: clean(fields.manufacturer),
    ean: clean(fields.ean), capturedAt: new Date().toISOString() });
  clearPhoto();
};
```
`aiReady` is a `useState(false)` set by an effect (AI available AND NAS connected). The `preview` phase renders the photo with a primary "使用这张照片" button that calls `read(photo.blob)`. `onExtract(ocr: OcrExtract)` is the prop; `confirm` reads the `fields`/`raw` state.

`src/components/MedicationForm.tsx`:
```tsx
const onOcr = async (ocr: OcrExtract) => {
  setScanning(false);
  ... sameBox lookup by ean ...
  setV((s) => ({ ...s, ocr, name: s.name || ocr.name || "", activeSubstance: s.activeSubstance || ocr.activeSubstance,
    dosage: s.dosage || ocr.strength || "", pharmaceuticalForm: s.pharmaceuticalForm || ocr.form, ean: ocr.ean ?? s.ean,
    unit: s.unit === "tablet" && ocr.form && /c[áa]psula/i.test(ocr.form) ? "capsule" : s.unit }));
};
...
<Field label={m.form.quantity} htmlFor="qty" error={err("quantity")}>
  <TextInput id="qty" type="number" inputMode="decimal" min={0} step="any"
    value={Number.isFinite(v.quantityPerDose) ? v.quantityPerDose : ""}
    onChange={(e) => set("quantityPerDose", e.target.value === "" ? Number.NaN : Number(e.target.value.replace(",", ".")))}
    invalid={!!errors.quantity} />
</Field>
<Field label={m.form.unit} htmlFor="unit"> <Select id="unit" ...UNITS.map(m.units.label)... </Select> </Field>   // these two sit in a grid-cols-2
```
`emptyMedication()` in `src/lib/medications.ts`: `unit: "tablet", quantityPerDose: 1, frequency: { type: "daily" }, times: ["08:00"]`. `Unit` (from `src/lib/types.ts`): `"tablet" | "capsule" | "mg" | "ml" | "drop" | "other"`; `UNITS` is the list. `validateMedication` already rejects quantity ≤ 0 / non-finite (`quantityInvalid`). `m.units.count(unit, q)` (pt/zh) formats e.g. "1 comprimido" / "1 片" (with plural handling in pt).

i18n: `pt.ts` defines `Messages`; `zh.ts` is typed `Messages` — new keys go in BOTH. Existing exemplar pure-function tests: `tests/medications.test.ts`, `tests/schedule.test.ts`.

Conventions: Portuguese code comments, 2-space indent, double quotes; touch targets ≥ `min-h-14` (use `min-h-16` for the primary controls), text ≥ `text-lg`; reuse `Button` from `./ui`.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Typecheck | `npm run typecheck` | exit 0 |
| All tests | `npm test` | exit 0 (137 passed at planning time) |

## Scope

**In scope**: `src/lib/medications.ts` (add two pure functions), `tests/medications.test.ts` (add cases), `src/components/BoxScanner.tsx`, `src/components/MedicationForm.tsx`, `src/lib/i18n/pt.ts`, `src/lib/i18n/zh.ts`.

**Out of scope**: `server/*`, `src/lib/ai.ts`, the on-phone OCR path, the review screen's own layout, frequency/time controls, the data schema (`Medication` is unchanged: `quantityPerDose` stays a number), `MedicalInfoSection.tsx`.

## Git workflow

- Branch: `advisor/015-least-typing`
- One commit (or per step); short imperative messages; end each with `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.
- Do NOT push or open a PR.

## Steps

### Step 1: Pure helpers — tests first

Append to `tests/medications.test.ts` (import the new functions from `@/lib/medications`):

```ts
describe("unidade a partir da forma farmacêutica", () => {
  it("reconhece as formas mais comuns, em português e inglês", () => {
    expect(unitFromForm("Comprimido revestido")).toBe("tablet");
    expect(unitFromForm("tablet")).toBe("tablet");
    expect(unitFromForm("Cápsula")).toBe("capsule");
    expect(unitFromForm("Capsulas moles")).toBe("capsule");
    expect(unitFromForm("Suspensão oral")).toBe("ml");
    expect(unitFromForm("Xarope")).toBe("ml");
    expect(unitFromForm("Solução oral")).toBe("ml");
    expect(unitFromForm("Gotas orais")).toBe("drop");
  });
  it("não adivinha quando não sabe", () => {
    expect(unitFromForm(undefined)).toBeUndefined();
    expect(unitFromForm("")).toBeUndefined();
    expect(unitFromForm("Pomada")).toBeUndefined();
    expect(unitFromForm("Solução injetável")).toBeUndefined();
  });
});

describe("botões + e − da quantidade", () => {
  it("sobe e desce numa escada de valores normais", () => {
    expect(stepQuantity(1, "tablet", 1)).toBe(1.5);
    expect(stepQuantity(1, "tablet", -1)).toBe(0.5);
    expect(stepQuantity(2, "capsule", 1)).toBe(3);
    expect(stepQuantity(5, "ml", 1)).toBe(7.5);
    expect(stepQuantity(5, "ml", -1)).toBe(2.5);
    expect(stepQuantity(3, "drop", 1)).toBe(4);
  });
  it("não passa dos extremos", () => {
    expect(stepQuantity(0.5, "tablet", -1)).toBe(0.5);
    expect(stepQuantity(10, "tablet", 1)).toBe(10);
  });
  it("valores fora da escada vão para o vizinho mais próximo na direção pedida", () => {
    expect(stepQuantity(1.2, "tablet", 1)).toBe(1.5);
    expect(stepQuantity(1.2, "tablet", -1)).toBe(1);
  });
  it("um valor inválido volta a um valor normal (≥ 1)", () => {
    expect(stepQuantity(Number.NaN, "tablet", 1)).toBe(1);
    expect(stepQuantity(0, "ml", -1)).toBe(1);
  });
});
```

**Verify**: `npx vitest run tests/medications.test.ts` → the new cases fail (functions missing).

### Step 2: Implement the helpers in `src/lib/medications.ts`

```ts
/** Unidade provável a partir da forma farmacêutica; `undefined` se não for claro. */
export function unitFromForm(form?: string): Unit | undefined {
  const f = (form ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  if (!f.trim()) return undefined;
  if (/capsul/.test(f)) return "capsule";
  if (/injet|inject|pomada|creme|gel|supositor|colirio|pó|po para/.test(f)) return undefined;
  if (/comprimid|tablet|drag/.test(f)) return "tablet";
  if (/gota|drop/.test(f)) return "drop";
  if (/xarope|solu|suspens|elixir|syrup|liquid/.test(f)) return "ml";
  return undefined;
}

const COUNT_LADDER = [0.5, 1, 1.5, 2, 3, 4, 5, 6, 8, 10];
const LADDERS: Record<Unit, number[]> = {
  tablet: COUNT_LADDER,
  capsule: COUNT_LADDER,
  other: COUNT_LADDER,
  ml: [1, 2.5, 5, 7.5, 10, 15, 20],
  drop: [1, 2, 3, 4, 5, 10, 15, 20],
  mg: [5, 10, 20, 25, 50, 100, 200, 250, 500, 1000],
};

/** Passo do botão + (dir = 1) ou − (dir = -1) numa escada de quantidades habituais. */
export function stepQuantity(value: number, unit: Unit, dir: 1 | -1): number {
  const ladder = LADDERS[unit];
  if (!Number.isFinite(value) || value <= 0) return ladder.find((x) => x >= 1) ?? ladder[0];
  const next = dir === 1 ? ladder.find((x) => x > value) : [...ladder].reverse().find((x) => x < value);
  return next ?? value;
}
```
(`Unit` is already imported in this file or add the import from `./types`.)
Note the accent-stripping regex above uses the combining-marks range U+0300–U+036F: copy it exactly as in `src/lib/infarmed/search.ts` (`normalize`), do not retype it.

**Verify**: `npx vitest run tests/medications.test.ts` → all pass.

### Step 3: Quantity stepper and unit inference in `MedicationForm`

1. Messages (BOTH files, `form` block): `qtyLess` — pt `Menos`, zh `减少`; `qtyMore` — pt `Mais`, zh `增加`; and in the `scan` block `filledNote` — pt `Dados preenchidos a partir da fotografia da caixa. Confirme rapidamente.`, zh `资料已根据药盒照片自动填好，请快速核对一下。`
2. Replace the quantity `<Field>`'s `TextInput` with a stepper (keep the `Field`, its label, the `err("quantity")` message and the surrounding `grid-cols-2`; if two columns are too narrow for the stepper, make the quantity field span both columns (`col-span-2`) and keep the unit select in its own row below):

```tsx
<div id="qty" role="group" aria-label={m.form.quantity} className="flex items-center gap-3">
  <button type="button" aria-label={m.form.qtyLess} onClick={() => set("quantityPerDose", stepQuantity(v.quantityPerDose, v.unit, -1))}
    className="min-h-16 min-w-16 rounded-2xl border-2 border-primary bg-white text-4xl font-bold text-primary active:bg-primary-soft">−</button>
  <output aria-live="polite" className="min-w-0 flex-1 text-center text-2xl font-bold">{Number.isFinite(v.quantityPerDose) ? m.units.count(v.unit, v.quantityPerDose) : "—"}</output>
  <button type="button" aria-label={m.form.qtyMore} onClick={() => set("quantityPerDose", stepQuantity(v.quantityPerDose, v.unit, 1))}
    className="min-h-16 min-w-16 rounded-2xl border-2 border-primary bg-white text-4xl font-bold text-primary active:bg-primary-soft">+</button>
</div>
```
3. In `onOcr`, replace the capsule-only `unit:` line with: `unit: s.unit === "tablet" ? (unitFromForm(ocr.form) ?? s.unit) : s.unit,`. Also set `quantityPerDose` to the first ladder value ≥ 1 when the inferred unit is `ml` or `drop` and `s.quantityPerDose === 1` (i.e. `stepQuantity(Number.NaN, unit, 1)` — gives 1 for drop and 1 for ml; leave it at 1; the owner presses + to choose). (No other defaulting.)
4. Show `<Notice>{m.scan.filledNote}</Notice>` (tone default) right under the `sameBox` notice whenever `v.ocr` is present.
5. Import `stepQuantity`, `unitFromForm` from `@/lib/medications`. Remove the `Number.isFinite`-only typing branches that are no longer needed; keep `validateMedication` unchanged.

**Verify**: `npm run typecheck` → exit 0; `npm test` → exit 0.

### Step 4: Fewer taps in `BoxScanner`

1. **Read immediately**: in `showPhoto`, after setting the photo state, `if (aiReady) { void read(blob); return; }` before `setPhase("preview")` (the `preview` phase stays for the non-AI path). `read` already sets the `reading` phase.
2. **Skip the review when Claude is confident**: refactor `confirm` into `finish(f: ParsedBox, rawText: string)` that builds the `OcrExtract` from the arguments (same cleaning as today) and calls `onExtract` + `clearPhoto()`; `confirm` becomes `finish(fields, raw)`. In the AI-success branch of `read`, after computing `next` and the uncertain set: if `ai.uncertain.length === 0` (no field flagged) AND `next.name?.trim()` is non-empty, call `finish(next, "")` and return; otherwise keep today's `setFields(next)`, `setUnsure(...)`, `setPhase("review")`.
3. Nothing changes for the on-phone OCR path.

**Verify**: `npm run typecheck` → exit 0; `npm test` → exit 0 (137 + the new unit tests).

### Step 5: Manual check (state which parts you ran)

`npm run dev` can't reach the AI without a key, so check what you can: on `/medications/new/` at 375 px in 中文 the quantity row shows "1 片" with big − and + buttons; + goes 1 → 1.5 → 2 → 3; changing the unit to 毫升 and pressing − / + uses the ml steps; no keyboard opens when pressing them; the red error for quantity never appears from the buttons. The scanner flow with AI can only be verified by the owner with a real key — say so.

## Test plan

Unit tests for `unitFromForm` and `stepQuantity` (Step 1). The scanner/form wiring is manual: with the AI ready, choosing a photo goes straight to reading; a confident result lands on the form with the notice and the unit set; an uncertain result still shows the review screen; without AI nothing changes.

## Done criteria

- [ ] `npm run typecheck` exits 0; `npm test` exits 0 with the new tests passing
- [ ] `grep -n 'type="number"' src/components/MedicationForm.tsx` shows no `id="qty"` input any more
- [ ] `git diff --stat` shows only in-scope files; `package.json` unchanged
- [ ] `plans/README.md` status row updated

## STOP conditions

- `BoxScanner`/`MedicationForm` differ materially from the excerpts.
- The stepper cannot fit the layout without restructuring the whole form.
- A step's verification fails twice.

## Maintenance notes

- The review screen is skipped only when Claude reports no uncertain fields and a name; the form's "filled from the box photo" notice and the editable fields are the safety net. If the owner sees wrong auto-filled names, make skipping stricter (or remove it) in `read()`.
- The stepper ladders are deliberately short; add values to `LADDERS` rather than re-adding a text box.
- The unit guess only applies while the unit is still the default tablet; a user's own choice is never overwritten.
