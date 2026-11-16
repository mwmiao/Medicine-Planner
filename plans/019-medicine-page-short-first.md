# Plan 019: Medicine page shows "what for" and "how to take" first; the rest is folded away

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 43fad38..HEAD -- src/components/MedicalInfoSection.tsx src/lib/i18n/pt.ts src/lib/i18n/zh.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" notes against the live code; on a mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none (but run before plan 022 — both edit `MedicalInfoSection.tsx`; one at a time)
- **Category**: direction (usability)
- **Planned at**: commit `43fad38`, 2026-11-15

## Why this matters

Opening a medicine with automatic Chinese instructions gives about 60 lines in one scroll: purpose, how to take, missed dose, side effects (up to 8 bullets), warnings (up to 8 bullets), storage, plus a "doctor's instructions" block that merely repeats the dose and times already shown in the card above. An elderly reader cannot find the two things she needs: **what it is for** and **how to take it**. After this plan those two stay open, the "emergency: call 112" line stays visible, and missed dose / side effects / warnings / storage each become a closed, large-tap fold ("tap to open"). Nothing is removed or hidden permanently.

## Current state

`src/components/MedicalInfoSection.tsx` (client component). Relevant parts:

- Lines 157–165: a `<Block title={m.info.doctorTitle}>` listing dose, frequency + times, and `med.instructions` (rendered whenever the section is open). Dose and times are already in the detail page's "Schedule" card.
- Lines 231–257: the sections loop:
```tsx
<div className="flex flex-col gap-4">
  {MEDICAL_INFO_SECTIONS.map((k) => {
    // "Se se esquecer" e "avisos" mostram sempre a orientação segura.
    if (!has(k) && k !== "missedDose" && k !== "warnings") return null;
    const items = (info?.[k] ?? []).filter((l) => l.trim());
    return (
      <div key={k}>
        <h4 className="text-lg font-bold">{m.info.sections[k]}</h4>
        {k === "missedDose" ? (<Bullets items={items.length ? [...items, m.info.noDouble] : [m.info.missedDefault]} />)
        : k === "sideEffects" ? (<><Bullets items={items} /><p className="mt-1 text-base text-muted">{m.info.sideEffectsAdvice}</p></>)
        : k === "warnings" ? (<>{items.length ? <Bullets items={items} /> : null}<p className="mt-2 rounded-xl bg-danger-soft p-3 text-lg font-semibold text-red-950">🚨 {m.info.urgent}</p></>)
        : (<Bullets items={items} />)}
      </div>
    );
  })}
</div>
```
- Line 259–267: an existing collapsible pattern to match: `<details className="mt-3 text-lg"><summary className="min-h-12 cursor-pointer font-semibold">{m.info.showOriginal}</summary>…</details>`.
- `MEDICAL_INFO_SECTIONS` order (`src/lib/types.ts:46`): `purpose, howToTake, missedDose, sideEffects, warnings, storage`.
- i18n: `pt.ts` defines `Messages`; `zh.ts` is typed `Messages`; new keys in BOTH. Block `info` holds these texts.
- Conventions: Portuguese comments, 2-space indent, double quotes, text ≥ `text-lg`, tap targets ≥ `min-h-12`.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Typecheck | `npm run typecheck` | exit 0 |
| All tests | `npm test` | exit 0 (same count as baseline; no DOM tests exist) |

## Scope

**In scope**: `src/components/MedicalInfoSection.tsx`, `src/lib/i18n/pt.ts`, `src/lib/i18n/zh.ts`.

**Out of scope**: the editing view, `LeafletTranslator`, the INFARMED/OCR/notes blocks (plan 022 handles those), server code, and the content/wording of any section.

## Git workflow

- Branch: `advisor/019-medicine-page-short`
- One commit; message ends with `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.
- Do NOT push or open a PR.

## Steps

### Step 1: Messages (BOTH files)

Add `info.tapToOpen`: pt `Toque para abrir`, zh `点一下打开`.

**Verify**: `npm run typecheck` → exit 0.

### Step 2: Fold the secondary sections

In the sections loop, keep `purpose` and `howToTake` rendered exactly as now. For `missedDose`, `sideEffects`, `warnings`, `storage`, wrap the existing content in:

```tsx
<details key={k} className="rounded-2xl border-2 border-line p-3 text-lg">
  <summary className="flex min-h-12 cursor-pointer items-center justify-between gap-2 text-lg font-bold">
    <span>{m.info.sections[k]}</span>
    <span className="text-base font-semibold text-muted">{m.info.tapToOpen}</span>
  </summary>
  <div className="mt-2">{/* o conteúdo atual desta secção, sem o <h4> */}</div>
</details>
```
Rules: (a) the `<h4>` is replaced by the `<summary>` for these four; (b) the red `🚨 {m.info.urgent}` paragraph currently inside `warnings` must be moved OUT of the fold and shown ALWAYS, once, after the whole sections loop and before the "show original" `<details>` (render it even when no warnings exist); (c) the fold for `missedDose` and `warnings` still renders when the section is empty (they show the safe default text as today); `sideEffects` and `storage` render only when `has(k)`.

**Verify**: `npm run typecheck` → exit 0; `grep -n "info.urgent" src/components/MedicalInfoSection.tsx` → exactly 1 match.

### Step 3: Drop the duplicated "doctor's instructions" block

Render the `<Block title={m.info.doctorTitle}>` only when `med.instructions` is non-empty, and make its content just `<Bullets items={[med.instructions]} />` (the dose and times are in the Schedule card above). Remove now-unused imports (`describeFrequency`, `formatDose`) only if no longer used anywhere in the file.

**Verify**: `npm run typecheck` → exit 0; `npm test` → exit 0.

### Step 4: Manual check (state which parts you ran)

With `npm run dev`, open a medicine that has medical info: purpose and how-to-take visible, four closed folds, the red 112 line visible, tapping a fold opens it. If you cannot run a browser, say so.

## Test plan

No automated test: the repo has no DOM test tooling and this is presentational. Rely on typecheck, the grep check, and the owner's phone check.

## Done criteria

- [ ] `npm run typecheck` exits 0; `npm test` exits 0
- [ ] `grep -c "<details" src/components/MedicalInfoSection.tsx` increased by the folds (≥ 5 total)
- [ ] `grep -n "info.urgent" src/components/MedicalInfoSection.tsx` → exactly 1 match
- [ ] Only in-scope files changed
- [ ] `plans/README.md` status row updated

## STOP conditions

- The excerpts don't match the live code.
- You find you must change the stored data shape or any section text to make this work.
- A step's verification fails twice.

## Maintenance notes

- Safety wording ("if the medicine is hard to swallow…", the 112 line, the disclaimer) must stay visible without opening folds; do not fold the disclaimer `Notice` or the 112 line.
- Plan 022 edits the same file (technical blocks) and 023 adds a Chinese name; run them after this one.
