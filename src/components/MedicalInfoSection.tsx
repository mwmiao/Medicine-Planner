"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { aiAvailable, findInstructions } from "@/lib/ai";
import { formatIsoDate, formatPharmaceuticalForm } from "@/lib/format";
import { useMessages } from "@/lib/i18n";
import { getSync, useSyncState } from "@/lib/sync";
import { MEDICAL_INFO_SECTIONS, type InfoSource, type MedicalInfo, type MedicalInfoSection as SectionKey, type Medication } from "@/lib/types";
import { BulletListEditor } from "./BulletListEditor";
import { toast } from "./Toast";
import { LeafletTranslator } from "./LeafletTranslator";
import { AiWorking, Button, ExternalLink, Notice, Select } from "./ui";

const SOURCES: InfoSource[] = ["infarmed", "leaflet", "box", "manual", "web"];

const attemptKey = (id: string) => `mp.autoInfo.${id}`;
const wasTried = (id: string) => {
  try {
    return localStorage.getItem(attemptKey(id)) !== null;
  } catch {
    return false; // sem armazenamento conta como "ainda não tentado"
  }
};
const setTried = (id: string, tried: boolean) => {
  try {
    if (tried) localStorage.setItem(attemptKey(id), "1");
    else localStorage.removeItem(attemptKey(id));
  } catch {
    // sem armazenamento: o useRef limita a uma tentativa por montagem
  }
};

function Block({ title, badge, children }: { title: string; badge?: ReactNode; children: ReactNode }) {
  return (
    <section className="rounded-2xl border-2 border-line p-4">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-xl font-bold">{title}</h3>
        {badge}
      </div>
      {children}
    </section>
  );
}

function Bullets({ items }: { items: string[] }) {
  return (
    <ul className="list-disc space-y-1 pl-6 text-lg">
      {items.map((t, i) => (
        <li key={i}>{t}</li>
      ))}
    </ul>
  );
}

function SourceBadge({ source }: { source: InfoSource }) {
  const { m } = useMessages();
  const tone = source === "manual" ? "bg-gray-200 text-ink" : "bg-primary-soft text-blue-950";
  return (
    <span className={`rounded-full px-3 py-1 text-sm font-bold ${tone}`}>
      {m.info.sourceLabel}: {m.info.sources[source]}
    </span>
  );
}

export function MedicalInfoSection({ med, onSave }: { med: Medication; onSave: (info: MedicalInfo) => Promise<void> }) {
  const { m, locale } = useMessages();
  useSyncState(); // volta a desenhar quando a ligação ao NAS muda
  const [open, setOpen] = useState(!!med.medicalInfo);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<MedicalInfo>(() => med.medicalInfo ?? { source: "manual", lastReviewedAt: "" });
  const [auto, setAuto] = useState<"idle" | "searching" | "notFound" | "failed">("idle");
  const autoStarted = useRef(false);

  const info = med.medicalInfo;
  const connected = getSync().connected;

  /** Procura as instruções numa etiqueta pública e guarda-as logo, sem passar pelo editor. */
  const autoSearch = async () => {
    setTried(med.id, true);
    setAuto("searching");
    setOpen(true);
    try {
      const r = await findInstructions({ name: med.name, activeSubstance: med.activeSubstance, strength: med.dosage, form: med.pharmaceuticalForm });
      if (!r.found) {
        setAuto("notFound");
        return;
      }
      const next: MedicalInfo = {
        source: "web",
        translatedBy: "ai",
        original: r.en,
        originalLanguage: "en",
        lastReviewedAt: new Date().toISOString(),
      };
      if (r.sourceUrl) next.sourceUrl = r.sourceUrl;
      if (r.sourceName) next.sourceName = r.sourceName;
      if (r.nameZh) next.nameZh = r.nameZh;
      for (const k of MEDICAL_INFO_SECTIONS) next[k] = r.zh[k] ?? [];
      await onSave(next);
      setAuto("idle");
    } catch {
      setAuto("failed");
    }
  };

  useEffect(() => {
    if (info || !connected || autoStarted.current || wasTried(med.id)) return;
    autoStarted.current = true;
    let alive = true;
    let launched = false;
    void aiAvailable().then((ok) => {
      if (alive && ok) {
        launched = true;
        void autoSearch();
      } else autoStarted.current = false;
    });
    return () => {
      alive = false;
      if (!launched) autoStarted.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [info, connected, med.id]);

  const has = (k: SectionKey) => (info?.[k] ?? []).some((l) => l.trim());

  const startEdit = () => {
    setDraft(med.medicalInfo ?? { source: med.infarmed?.matched ? "leaflet" : "manual", lastReviewedAt: "" });
    setEditing(true);
  };

  const save = async () => {
    const cleaned: MedicalInfo = { source: draft.source, lastReviewedAt: new Date().toISOString() };
    for (const k of MEDICAL_INFO_SECTIONS) {
      const lines = (draft[k] ?? []).map((l) => l.trim()).filter(Boolean);
      if (lines.length) cleaned[k] = lines;
    }
    if (draft.translatedBy) cleaned.translatedBy = draft.translatedBy;
    if (draft.original) cleaned.original = draft.original;
    if (draft.sourceUrl) cleaned.sourceUrl = draft.sourceUrl;
    if (draft.sourceName) cleaned.sourceName = draft.sourceName;
    if (draft.nameZh) cleaned.nameZh = draft.nameZh;
    if (draft.originalLanguage) cleaned.originalLanguage = draft.originalLanguage;
    await onSave(cleaned);
    setEditing(false);
  };

  return (
    <div className="flex flex-col gap-4">
      <Button variant={open ? "secondary" : "primary"} block className="min-h-16 text-xl" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        ℹ️ {open ? m.info.hide : m.info.view}
      </Button>

      {open ? (
        <div className="flex flex-col gap-4">
          <Notice tone="warn">
            <strong>{m.info.disclaimer}</strong>
          </Notice>

          {med.instructions ? (
            <Block title={m.info.doctorTitle}>
              <Bullets items={[med.instructions]} />
            </Block>
          ) : null}

          {editing ? (
            <Block title={m.info.edit}>
              <div className="flex flex-col gap-5">
                {draft.translatedBy === "ai" ? <Notice tone="warn">{m.info.translateReview}</Notice> : null}
                <label className="flex flex-col gap-1.5">
                  <span className="text-lg font-bold">{m.info.sourceLabel}</span>
                  <Select value={draft.source} onChange={(e) => setDraft((d) => ({ ...d, source: e.target.value as InfoSource }))}>
                    {SOURCES.map((s) => (
                      <option key={s} value={s}>
                        {m.info.sources[s]}
                      </option>
                    ))}
                  </Select>
                </label>
                {MEDICAL_INFO_SECTIONS.map((k) => (
                  <BulletListEditor
                    key={k}
                    id={k}
                    label={m.info.sections[k]}
                    value={draft[k] ?? []}
                    onChange={(v) => setDraft((d) => ({ ...d, [k]: v }))}
                  />
                ))}
                <Button block onClick={() => void save()}>
                  {m.common.save}
                </Button>
                <Button variant="secondary" block onClick={() => setEditing(false)}>
                  {m.common.cancel}
                </Button>
              </div>
            </Block>
          ) : (
            <Block title={m.info.officialTitle} badge={info ? <SourceBadge source={info.source} /> : null}>
              {!info ? <p className="mb-3 text-lg text-muted">{m.info.noInfo}</p> : null}
              {!info && auto === "searching" ? (
                <div className="mb-3">
                  <AiWorking title={m.info.autoSearching} hint={m.ai.hintInstructions} />
                </div>
              ) : null}
              {!info && (auto === "notFound" || auto === "failed") ? (
                <div className="mb-3 flex flex-col gap-3">
                  <Notice tone={auto === "failed" ? "error" : "warn"}>{auto === "failed" ? m.info.autoFailed : m.info.autoNotFound}</Notice>
                  <Button
                    variant="secondary"
                    block
                    onClick={() => {
                      setTried(med.id, false);
                      void autoSearch();
                    }}
                  >
                    {m.info.autoRetry}
                  </Button>
                </div>
              ) : null}
              {info?.source === "web" ? (
                <div className="mb-3 flex flex-col gap-3">
                  <Notice tone="warn">{m.info.webNotice}</Notice>
                  {info.sourceUrl ? <ExternalLink href={info.sourceUrl}>{m.info.sourceLink}: {info.sourceName ?? info.sourceUrl}</ExternalLink> : null}
                </div>
              ) : info?.translatedBy === "ai" ? (
                <div className="mb-3">
                  <Notice tone="warn">{m.info.translatedNotice}</Notice>
                </div>
              ) : null}
              <div className="flex flex-col gap-4">
                {MEDICAL_INFO_SECTIONS.map((k) => {
                  // "Se se esquecer" e "avisos" mostram sempre a orientação segura.
                  if (!has(k) && k !== "missedDose" && k !== "warnings") return null;
                  const items = (info?.[k] ?? []).filter((l) => l.trim());
                  if (k === "purpose" || k === "howToTake") {
                    return (
                      <div key={k}>
                        <h4 className="text-lg font-bold">{m.info.sections[k]}</h4>
                        <Bullets items={items} />
                      </div>
                    );
                  }
                  return (
                    <details key={k} className="rounded-2xl border-2 border-line p-3 text-lg">
                      <summary className="flex min-h-12 cursor-pointer items-center justify-between gap-2 text-lg font-bold">
                        <span>{m.info.sections[k]}</span>
                        <span className="text-base font-semibold text-muted">{m.info.tapToOpen}</span>
                      </summary>
                      <div className="mt-2">
                        {k === "missedDose" ? (
                          <Bullets items={items.length ? [...items, m.info.noDouble] : [m.info.missedDefault]} />
                        ) : k === "sideEffects" ? (
                          <>
                            <Bullets items={items} />
                            <p className="mt-1 text-base text-muted">{m.info.sideEffectsAdvice}</p>
                          </>
                        ) : k === "warnings" ? (
                          items.length ? <Bullets items={items} /> : null
                        ) : (
                          <Bullets items={items} />
                        )}
                      </div>
                    </details>
                  );
                })}
              </div>
              <p className="mt-4 rounded-xl bg-danger-soft p-3 text-lg font-semibold text-red-950">🚨 {m.info.urgent}</p>
              {info?.translatedBy === "ai" && MEDICAL_INFO_SECTIONS.some((k) => (info.original?.[k] ?? []).some((l) => l.trim())) ? (
                <details className="mt-3 text-lg">
                  <summary className="min-h-12 cursor-pointer font-semibold">{m.info.showOriginal}</summary>
                  {MEDICAL_INFO_SECTIONS.filter((k) => (info.original?.[k] ?? []).some((l) => l.trim())).map((k) => (
                    <div key={k} className="mt-2">
                      <h4 className="text-lg font-bold">{m.info.sections[k]}</h4>
                      <Bullets items={(info.original?.[k] ?? []).filter((l) => l.trim())} />
                    </div>
                  ))}
                </details>
              ) : null}
              {info ? (
                <p className="mt-3 text-base text-muted">
                  {info.translatedBy === "ai" ? null : info.source === "manual" ? m.info.notOfficialNote : m.info.copiedOfficialNote}
                  {info.lastReviewedAt ? ` ${m.info.lastEdited(formatIsoDate(info.lastReviewedAt, locale))}` : ""}
                </p>
              ) : null}
              <div className="mt-4 flex flex-col gap-3">
                <LeafletTranslator
                  onDone={(r) => {
                    const next: MedicalInfo = { source: "leaflet", translatedBy: "ai", original: r.pt, originalLanguage: "pt", lastReviewedAt: new Date().toISOString() };
                    for (const k of MEDICAL_INFO_SECTIONS) next[k] = r.zh[k] ?? [];
                    void onSave(next).then(() => setOpen(true)).catch(() => toast(m.common.errorGeneric, "error"));
                  }}
                />
                <Button variant="secondary" block onClick={startEdit}>
                  ✏️ {m.info.edit}
                </Button>
              </div>
            </Block>
          )}

          {med.infarmed?.matched ? (
            <Block title="INFARMED" badge={<span className="rounded-full bg-primary-soft px-3 py-1 text-sm font-bold text-blue-950">{m.infarmed.linked}</span>}>
              <div className="flex flex-col gap-3">
                {med.infarmed.retrievedAt ? (
                  <p className="text-base text-muted">
                    {m.infarmed.copiedByUser} · {m.infarmed.retrievedOn(formatIsoDate(med.infarmed.retrievedAt, locale))}
                  </p>
                ) : null}
                {med.infarmed.recordUrl ? <ExternalLink href={med.infarmed.recordUrl}>{m.infarmed.recordLink}</ExternalLink> : null}
                {med.infarmed.leafletUrl ? <ExternalLink href={med.infarmed.leafletUrl}>{m.infarmed.leafletLink}</ExternalLink> : null}
                {med.infarmed.spcUrl ? <ExternalLink href={med.infarmed.spcUrl}>{m.infarmed.spcLink}</ExternalLink> : null}
              </div>
            </Block>
          ) : null}

          {med.ocr ? (
            <details className="rounded-2xl border-2 border-line p-3 text-lg">
              <summary className="min-h-12 cursor-pointer text-lg font-bold">{m.info.ocrTitle}</summary>
              <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-lg">
                {(["name", "activeSubstance", "strength", "form", "packCount", "expiry", "manufacturer"] as const)
                  .filter((k) => med.ocr?.[k])
                  .map((k) => (
                    <div key={k} className="contents">
                      <dt className="text-muted">{m.scan.fields[k]}</dt>
                      <dd className="font-semibold">{k === "form" ? formatPharmaceuticalForm(med.ocr?.[k] ?? "", locale) : med.ocr?.[k]}</dd>
                    </div>
                  ))}
              </dl>
              <p className="mt-2 text-base text-muted">{formatIsoDate(med.ocr.capturedAt, locale)}</p>
            </details>
          ) : null}

          {med.notes ? (
            <Block title={m.info.notesTitle} badge={<SourceBadge source="manual" />}>
              <p className="whitespace-pre-line text-lg">{med.notes}</p>
            </Block>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
