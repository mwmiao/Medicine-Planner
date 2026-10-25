"use client";

import { useState, type ReactNode } from "react";
import { describeFrequency, formatDose, formatIsoDate } from "@/lib/format";
import { useMessages } from "@/lib/i18n";
import { MEDICAL_INFO_SECTIONS, type InfoSource, type MedicalInfo, type MedicalInfoSection as SectionKey, type Medication } from "@/lib/types";
import { BulletListEditor } from "./BulletListEditor";
import { Button, ExternalLink, Notice, Select } from "./ui";

const SOURCES: InfoSource[] = ["infarmed", "leaflet", "box", "manual"];

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
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<MedicalInfo>(() => med.medicalInfo ?? { source: "manual", lastReviewedAt: "" });

  const info = med.medicalInfo;
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

          <Block title={m.info.doctorTitle}>
            <Bullets
              items={[
                `${m.meds.dose}: ${formatDose(med, m)}`,
                `${describeFrequency(med, m)} — ${med.times.join(", ")}`,
                ...(med.instructions ? [med.instructions] : []),
              ]}
            />
          </Block>

          {editing ? (
            <Block title={m.info.edit}>
              <div className="flex flex-col gap-5">
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
              <div className="flex flex-col gap-4">
                {MEDICAL_INFO_SECTIONS.map((k) => {
                  // "Se se esquecer" e "avisos" mostram sempre a orientação segura.
                  if (!has(k) && k !== "missedDose" && k !== "warnings") return null;
                  const items = (info?.[k] ?? []).filter((l) => l.trim());
                  return (
                    <div key={k}>
                      <h4 className="text-lg font-bold">{m.info.sections[k]}</h4>
                      {k === "missedDose" ? (
                        <Bullets items={items.length ? [...items, m.info.noDouble] : [m.info.missedDefault]} />
                      ) : k === "sideEffects" ? (
                        <>
                          <Bullets items={items} />
                          <p className="mt-1 text-base text-muted">{m.info.sideEffectsAdvice}</p>
                        </>
                      ) : k === "warnings" ? (
                        <>
                          {items.length ? <Bullets items={items} /> : null}
                          <p className="mt-2 rounded-xl bg-danger-soft p-3 text-lg font-semibold text-red-950">🚨 {m.info.urgent}</p>
                        </>
                      ) : (
                        <Bullets items={items} />
                      )}
                    </div>
                  );
                })}
              </div>
              {info ? (
                <p className="mt-3 text-base text-muted">
                  {info.source === "manual" ? m.info.notOfficialNote : m.info.copiedOfficialNote}
                  {info.lastReviewedAt ? ` ${m.info.lastEdited(formatIsoDate(info.lastReviewedAt, locale))}` : ""}
                </p>
              ) : null}
              <div className="mt-4">
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
