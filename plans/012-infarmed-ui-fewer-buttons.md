# Plan 012: The medicine form drops the INFARMED search that can never work, leaving one optional "link official record" step

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat e851e1b..HEAD -- src/components/MedicationForm.tsx src/components/InfarmedPanel.tsx src/lib/i18n/pt.ts src/lib/i18n/zh.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: LOW
- **Depends on**: none
- **Category**: direction (usability)
- **Planned at**: commit `e851e1b`, 2026-11-15

## Why this matters

The owner finds the INFARMED part of "add medicine" too button-heavy. The cause:
the app's INFARMED search provider is a stub that always answers "unavailable"
(`src/lib/infarmed/provider.ts`: `export let defaultProvider = unavailableProvider`,
never replaced anywhere), because INFARMED's INFOMED site has no public API and
its `robots.txt` disallows automated access. So "Pesquisar no INFARMED",
"Pesquisar", "Copiar nome e abrir INFARMED" and the result cards can never
produce anything, and the only working path is a 9-field manual form. After this
plan: no search buttons; the only INFARMED step left is an optional ghost button
near the bottom of the form, "连接官方记录 / Ligar ao registo oficial", that
opens a small panel with one link to INFOMED and one required field (the
INFOMED page URL) plus two optional document URLs. Name, substance, form and
strength are taken from the form itself instead of being typed again.

## Current state

`src/components/MedicationForm.tsx` (relevant parts):

```tsx
import { bestSearchTerm } from "@/lib/ocr/parse";                      // used only by onOcr
const [showInfarmed, setShowInfarmed] = useState(false);
const [infarmedQuery, setInfarmedQuery] = useState({ q: "", auto: false, key: 0 });
...
// inside onOcr(ocr):
const term = bestSearchTerm(ocr) ?? ocr.ean;
if (term) {
  setInfarmedQuery((q) => ({ q: term, auto: true, key: q.key + 1 }));
  setShowInfarmed(true);
}
...
const openInfarmed = () => {
  setInfarmedQuery((q) => ({ q: v.name || v.activeSubstance || "", auto: !!(v.name || v.activeSubstance), key: q.key + 1 }));
  setShowInfarmed(true);
};
...
<div className="grid grid-cols-1 gap-3">
  <Button className="min-h-16 text-xl" block onClick={() => setScanning(true)} disabled={scanning}>📷 {m.scan.button}</Button>
  <Button variant="secondary" block onClick={openInfarmed}>🔎 {m.infarmed.search}</Button>
</div>
...
{showInfarmed ? (
  <Card className="ring-2 ring-primary">
    <div className="mb-3 flex items-center justify-between">
      <h2 className="text-2xl font-bold">🔎 {m.infarmed.title}</h2>
      <button type="button" onClick={() => setShowInfarmed(false)} aria-label={m.common.close} ...>×</button>
    </div>
    <InfarmedPanel key={infarmedQuery.key} input={v} initialQuery={infarmedQuery.q} autoSearch={infarmedQuery.auto}
      onApply={(next) => { setV(next); setShowInfarmed(false); setNotice(null); setErrors({}); setTimeout(() => window.scrollTo({ top: 0, behavior: "smooth" }), 0); }} />
  </Card>
) : null}
```

`src/components/InfarmedPanel.tsx` (243 lines) contains: `MatchCard`, a search form
(`searchInfarmed`), result lists and notices, "copy name and open INFARMED"
(`copyAndOpen`), an `ExternalLink` to INFOMED, and a toggle revealing a link form
with 9 fields (`LinkForm`: url, name, activeSubstance, pharmaceuticalForm,
strength, authorisationStatus, holder, leafletUrl, spcUrl). Its `saveLink` does:

```ts
const parsed = parseInfomedUrl(link.url);
if (!parsed) return setLinkErr(m.infarmed.invalidUrl);
if ((link.leafletUrl && !isOfficialInfarmedUrl(link.leafletUrl)) || (link.spcUrl && !isOfficialInfarmedUrl(link.spcUrl))) return setLinkErr(m.infarmed.invalidDocUrl);
if (!link.name.trim()) return setLinkErr(m.form.errors.nameRequired);
...
await choose({ id: parsed.medGuid, name: link.name.trim(), ..., recordUrl: parsed.url, leafletUrl: opt(link.leafletUrl), spcUrl: opt(link.spcUrl), origin: "user-copied" });
```
and `choose(match)` is `onApply(await selectMatch(match, input))` (from `@/lib/infarmed/search`).

Library code stays: `src/lib/infarmed/{provider,search,urls}.ts` and `tests/infarmed.test.ts` are NOT touched.

i18n: `pt.ts`/`zh.ts` have an `infarmed: { ... }` block (pt lines ~145-187). `zh.ts` is typed `Messages`
(= `typeof pt`), so a key must be removed from both files together.

Conventions: Portuguese code comments, 2-space indent, double quotes; UI uses `Button`, `Field`, `TextInput`, `Notice`, `ExternalLink` from `./ui`.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Typecheck | `npm run typecheck` | exit 0 |
| All tests | `npm test` | exit 0 (95 passed at planning time) |

## Scope

**In scope**: `src/components/MedicationForm.tsx`, `src/components/InfarmedPanel.tsx`, `src/lib/i18n/pt.ts`, `src/lib/i18n/zh.ts`.

**Out of scope**: `src/lib/infarmed/*`, `tests/*`, `BoxScanner.tsx`, `MedicalInfoSection.tsx`, any behaviour of `selectMatch`/the saved `infarmed` data shape, the Settings INFARMED section.

## Git workflow

- Branch: `advisor/012-infarmed-ui`
- One commit, short imperative message; end it with `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.
- Do NOT push or open a PR.

## Steps

### Step 1: Rewrite `InfarmedPanel` as the small link panel

Replace the whole content of `src/components/InfarmedPanel.tsx` with a component of this shape (keep the file's name and export name):

```tsx
"use client";

import { useState } from "react";
import { useMessages } from "@/lib/i18n";
import { selectMatch } from "@/lib/infarmed/search";
import { INFOMED_SEARCH_URL, isOfficialInfarmedUrl, parseInfomedUrl } from "@/lib/infarmed/urls";
import type { MedicationInput } from "@/lib/medications";
import { Button, ExternalLink, Field, Notice, TextInput } from "./ui";

/** Liga o medicamento ao registo oficial: só o endereço da página do INFOMED é obrigatório. */
export function InfarmedPanel({ input, onApply }: { input: MedicationInput; onApply: (next: MedicationInput) => void }) {
  const { m } = useMessages();
  const [url, setUrl] = useState("");
  const [leafletUrl, setLeafletUrl] = useState("");
  const [spcUrl, setSpcUrl] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    const parsed = parseInfomedUrl(url);
    if (!parsed) return setErr(m.infarmed.invalidUrl);
    if ((leafletUrl.trim() && !isOfficialInfarmedUrl(leafletUrl)) || (spcUrl.trim() && !isOfficialInfarmedUrl(spcUrl))) {
      return setErr(m.infarmed.invalidDocUrl);
    }
    if (!input.name.trim()) return setErr(m.form.errors.nameRequired);
    setErr(null);
    setBusy(true);
    const opt = (s: string) => s.trim() || undefined;
    try {
      onApply(
        await selectMatch(
          {
            id: parsed.medGuid,
            name: input.name.trim(),
            activeSubstance: opt(input.activeSubstance ?? ""),
            pharmaceuticalForm: opt(input.pharmaceuticalForm ?? ""),
            strength: opt(input.dosage),
            ean: input.ean,
            recordUrl: parsed.url,
            leafletUrl: opt(leafletUrl),
            spcUrl: opt(spcUrl),
            origin: "user-copied",
          },
          input,
        ),
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <p className="text-lg text-muted">{m.infarmed.linkIntro}</p>
      <ExternalLink href={INFOMED_SEARCH_URL}>{m.infarmed.openInfomed}</ExternalLink>
      <Field label={m.infarmed.pageUrl} htmlFor="l-url">
        <TextInput id="l-url" type="url" inputMode="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder={m.infarmed.pageUrlPlaceholder} />
      </Field>
      <Field label={m.infarmed.leafletUrl} htmlFor="l-fi">
        <TextInput id="l-fi" type="url" inputMode="url" value={leafletUrl} onChange={(e) => setLeafletUrl(e.target.value)} />
      </Field>
      <Field label={m.infarmed.spcUrl} htmlFor="l-rcm">
        <TextInput id="l-rcm" type="url" inputMode="url" value={spcUrl} onChange={(e) => setSpcUrl(e.target.value)} />
      </Field>
      {err ? <Notice tone="error">{err}</Notice> : null}
      <Button block onClick={() => void save()} disabled={busy || !url.trim()}>
        {m.infarmed.saveRecord}
      </Button>
    </div>
  );
}
```

If `MedicationInput`'s `activeSubstance`/`pharmaceuticalForm` types differ from what is used above, adapt only the casts so typecheck passes; do not change the saved shape.

**Verify**: `npm run typecheck` → errors only in `MedicationForm.tsx` (it still passes the old props). That is expected until Step 2.

### Step 2: Simplify `MedicationForm`

In `src/components/MedicationForm.tsx`:
1. Delete `import { bestSearchTerm } from "@/lib/ocr/parse";` (only if `bestSearchTerm` is not used elsewhere in the file), the `infarmedQuery` state, `openInfarmed`, and the `const term = ...; if (term) { ... }` block at the end of `onOcr` (keep everything else in `onOcr`).
2. Remove the second button (`🔎 {m.infarmed.search}`) from the top `grid`; leave the `📷` button.
3. In the `showInfarmed` card: change the heading to `🔗 {m.infarmed.linkTitle}` and render `<InfarmedPanel input={v} onApply={...same onApply body as today...} />` (no `key`, no `initialQuery`, no `autoSearch`).
4. Immediately above the final `{notice ? ...}` / submit button area add a ghost button, shown only when not linked and the panel is closed:

```tsx
{!v.infarmed?.matched && !showInfarmed ? (
  <Button variant="ghost" onClick={() => setShowInfarmed(true)} className="self-start px-0">
    🔗 {m.infarmed.linkTitle} ({m.common.optional})
  </Button>
) : null}
```

**Verify**: `npm run typecheck` → exit 0; `grep -n "infarmedQuery\|openInfarmed\|bestSearchTerm\|m.infarmed.search" src/components/MedicationForm.tsx` → no matches.

### Step 3: Remove the i18n keys that no longer have a user

For each key of the `infarmed` block in `pt.ts`, run `grep -rn "m\.infarmed\.<key>\|infarmed\.<key>" src --include=*.tsx --include=*.ts` excluding `src/lib/i18n/`. Delete from BOTH `pt.ts` and `zh.ts` exactly the keys with **zero** usages. Expected set (verify, don't assume): `search`, `title`, `query`, `searchNow`, `searching`, `cached`, `results`, `noMatch`, `unavailable`, `offline`, `error`, `copyAndOpen`, `copied`, `select`, `commercialName`, `substance`, `form`, `strength`, `status`, `holder`, `fromProvider`. Keep every key that still has a usage (for example `linkTitle`, `linkIntro`, `pageUrl`, `pageUrlPlaceholder`, `invalidUrl`, `invalidDocUrl`, `leafletUrl`, `spcUrl`, `saveRecord`, `openInfomed`, `recordLink`, `leafletLink`, `spcLink`, `copiedByUser`, `linked`, `notLinked`, `unlink`, `selectedNote`, `retrievedOn`).

**Verify**: `npm run typecheck` → exit 0; `npm test` → exit 0 (95 passed, unchanged).

### Step 4: Manual check (state whether you ran it)

`npm run dev`, open `/medications/new/` at 375 px in 中文: only the 📷 button at the top; a small "连接官方记录（可不填）" link-style button near the bottom; tapping it shows one link + one required field + two optional; pasting a valid INFOMED detail URL (`https://extranet.infarmed.pt/INFOMED-fo/detalhes-medicamento.xhtml?med_guid=0123456789abcdef`) with a name filled in saves and shows the green "已连接 INFARMED" notice; an invalid URL shows the error.

## Test plan

No new automated tests: only UI wiring changed, and the library behaviour (`selectMatch`, `parseInfomedUrl`, `searchInfarmed`) is already covered by `tests/infarmed.test.ts`, which must still pass untouched.

## Done criteria

- [ ] `npm run typecheck` exits 0; `npm test` exits 0 with the same test count as before
- [ ] `grep -rn "searchInfarmed\|MatchCard\|copyAndOpen" src/components` returns no matches
- [ ] `git diff --stat` shows only the four in-scope files
- [ ] `plans/README.md` status row updated

## STOP conditions

- `MedicationForm` or `InfarmedPanel` differ materially from the excerpts.
- Removing an i18n key breaks typecheck because something outside `src/` uses it.
- `selectMatch`'s signature differs from `(match, input)`.

## Maintenance notes

- `searchInfarmed`, `provider.ts` and the cache are now only exercised by tests; leaving them is intentional (they become useful if INFARMED ever publishes an API). Do not wire a scraper to INFOMED: its `robots.txt` disallows automated access.
- Instructions for the medicine come from plan 010 (leaflet → 简体中文), not from INFARMED.
