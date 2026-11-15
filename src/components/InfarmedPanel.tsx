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
