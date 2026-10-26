"use client";

import Link from "next/link";
import { useState } from "react";
import { toDateKey } from "@/lib/dates";
import { db } from "@/lib/db";
import { BOX_COLORS, formatIsoDate } from "@/lib/format";
import { useMessages } from "@/lib/i18n";
import { validateMedication, type MedicationInput, type ValidationErrors } from "@/lib/medications";
import { bestSearchTerm } from "@/lib/ocr/parse";
import { UNITS, type Frequency, type Medication, type OcrExtract, type Unit } from "@/lib/types";
import { BoxScanner } from "./BoxScanner";
import { InfarmedPanel } from "./InfarmedPanel";
import { Button, Card, ExternalLink, Field, Notice, Select, TextArea, TextInput } from "./ui";

type Preset = "once" | "twice" | "three" | "days" | "interval";

const PRESET_TIMES: Record<"once" | "twice" | "three", string[]> = {
  once: ["08:00"],
  twice: ["08:00", "20:00"],
  three: ["08:00", "14:00", "20:00"],
};

function presetOf(input: MedicationInput): Preset | null {
  if (input.frequency.type === "specificDays") return "days";
  if (input.frequency.type === "interval") return "interval";
  return ({ 1: "once", 2: "twice", 3: "three" } as const)[input.times.length as 1 | 2 | 3] ?? null;
}

export function MedicationForm({
  initial,
  autoScan,
  submitLabel,
  onSubmit,
}: {
  initial: MedicationInput;
  autoScan?: boolean;
  submitLabel: string;
  onSubmit: (input: MedicationInput) => Promise<void>;
}) {
  const { m, locale } = useMessages();
  const [v, setV] = useState<MedicationInput>(initial);
  const [errors, setErrors] = useState<ValidationErrors>({});
  const [scanning, setScanning] = useState(!!autoScan);
  const [showInfarmed, setShowInfarmed] = useState(false);
  const [infarmedQuery, setInfarmedQuery] = useState({ q: "", auto: false, key: 0 });
  const [notice, setNotice] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [sameBox, setSameBox] = useState<Medication | null>(null);

  const set = <K extends keyof MedicationInput>(k: K, value: MedicationInput[K]) => setV((s) => ({ ...s, [k]: value }));
  const setFreq = (f: Frequency) => set("frequency", f);
  const err = (k: keyof ValidationErrors) => (errors[k] ? m.form.errors[errors[k]!] : undefined);

  const choosePreset = (p: Preset) => {
    if (p === "days") setFreq({ type: "specificDays", days: v.frequency.days ?? [1, 2, 3, 4, 5] });
    else if (p === "interval") setFreq({ type: "interval", intervalDays: v.frequency.intervalDays ?? 2, startDate: v.frequency.startDate ?? toDateKey(new Date()) });
    else setV((s) => ({ ...s, frequency: { type: "daily" }, times: PRESET_TIMES[p] }));
  };

  const onOcr = async (ocr: OcrExtract) => {
    setScanning(false);
    // Procura primeiro nos medicamentos já guardados com o mesmo código de barras.
    const existing = ocr.ean ? await db.medications.filter((med) => med.ean === ocr.ean).first() : undefined;
    setSameBox(existing && existing.name !== v.name ? existing : null);
    setV((s) => ({
      ...s,
      ocr,
      name: s.name || ocr.name || "",
      activeSubstance: s.activeSubstance || ocr.activeSubstance,
      dosage: s.dosage || ocr.strength || "",
      pharmaceuticalForm: s.pharmaceuticalForm || ocr.form,
      ean: ocr.ean ?? s.ean,
      unit: s.unit === "tablet" && ocr.form && /c[áa]psula/i.test(ocr.form) ? "capsule" : s.unit,
    }));
    const term = bestSearchTerm(ocr) ?? ocr.ean;
    if (term) {
      setInfarmedQuery((q) => ({ q: term, auto: true, key: q.key + 1 }));
      setShowInfarmed(true);
    }
  };

  const openInfarmed = () => {
    setInfarmedQuery((q) => ({ q: v.name || v.activeSubstance || "", auto: !!(v.name || v.activeSubstance), key: q.key + 1 }));
    setShowInfarmed(true);
  };

  const submit = async () => {
    const e = validateMedication(v);
    setErrors(e);
    if (Object.keys(e).length) {
      setNotice(m.form.fixErrors);
      return;
    }
    setNotice(null);
    setSaving(true);
    try {
      await onSubmit(v);
    } catch {
      setNotice(m.common.errorGeneric);
    } finally {
      setSaving(false);
    }
  };

  const preset = presetOf(v);
  const presetBtn = (p: Preset, label: string) => (
    <button
      key={p}
      type="button"
      aria-pressed={preset === p}
      onClick={() => choosePreset(p)}
      className={`min-h-14 rounded-xl border-2 px-3 text-lg font-semibold ${preset === p ? "border-primary bg-primary text-white" : "border-line bg-white"}`}
    >
      {label}
    </button>
  );

  return (
    <form
      className="flex flex-col gap-5"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <div className="grid grid-cols-1 gap-3">
        <Button className="min-h-16 text-xl" block onClick={() => setScanning(true)} disabled={scanning}>
          📷 {m.scan.button}
        </Button>
        <Button variant="secondary" block onClick={openInfarmed}>
          🔎 {m.infarmed.search}
        </Button>
      </div>

      {scanning ? <BoxScanner onExtract={(ocr) => void onOcr(ocr)} onClose={() => setScanning(false)} /> : null}

      {sameBox ? (
        <Notice tone="warn">
          <p className="font-bold">{m.form.sameBox(sameBox.name)}</p>
          <Link href={`/medications/view/?id=${encodeURIComponent(sameBox.id)}`} className="mt-1 inline-block text-lg font-semibold underline">
            {m.form.openExisting}
          </Link>
        </Notice>
      ) : null}

      {showInfarmed ? (
        <Card className="ring-2 ring-primary">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-2xl font-bold">🔎 {m.infarmed.title}</h2>
            <button type="button" onClick={() => setShowInfarmed(false)} aria-label={m.common.close} className="min-h-12 min-w-12 text-3xl font-bold text-muted">
              ×
            </button>
          </div>
          <InfarmedPanel
            key={infarmedQuery.key}
            input={v}
            initialQuery={infarmedQuery.q}
            autoSearch={infarmedQuery.auto}
            onApply={(next) => {
              setV(next);
              setShowInfarmed(false);
              setNotice(null);
              setErrors({});
              setTimeout(() => window.scrollTo({ top: 0, behavior: "smooth" }), 0);
            }}
          />
        </Card>
      ) : null}

      {v.infarmed?.matched ? (
        <Notice tone="success">
          <p className="font-bold">✓ {m.infarmed.linked}</p>
          <p className="text-base">{m.infarmed.selectedNote}</p>
          {v.infarmed.retrievedAt ? <p className="text-base">{m.infarmed.retrievedOn(formatIsoDate(v.infarmed.retrievedAt, locale))}</p> : null}
          <div className="mt-2 flex flex-col gap-2">
            {v.infarmed.recordUrl ? <ExternalLink href={v.infarmed.recordUrl}>{m.infarmed.recordLink}</ExternalLink> : null}
            <Button variant="ghost" onClick={() => set("infarmed", undefined)}>
              {m.infarmed.unlink}
            </Button>
          </div>
        </Notice>
      ) : null}

      <Field label={m.form.name} htmlFor="name" error={err("name")}>
        <TextInput id="name" value={v.name} onChange={(e) => set("name", e.target.value)} placeholder={m.form.namePlaceholder} invalid={!!errors.name} autoComplete="off" />
      </Field>

      <Field label={m.form.activeSubstance} hint={m.common.optional} htmlFor="substance">
        <TextInput
          id="substance"
          value={v.activeSubstance ?? ""}
          onChange={(e) => set("activeSubstance", e.target.value)}
          placeholder={m.form.activeSubstancePlaceholder}
          autoComplete="off"
        />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label={m.form.quantity} htmlFor="qty" error={err("quantity")}>
          <TextInput
            id="qty"
            type="number"
            inputMode="decimal"
            min={0}
            step="any"
            value={Number.isFinite(v.quantityPerDose) ? v.quantityPerDose : ""}
            onChange={(e) => set("quantityPerDose", e.target.value === "" ? Number.NaN : Number(e.target.value.replace(",", ".")))}
            invalid={!!errors.quantity}
          />
        </Field>
        <Field label={m.form.unit} htmlFor="unit">
          <Select id="unit" value={v.unit} onChange={(e) => set("unit", e.target.value as Unit)}>
            {UNITS.map((u) => (
              <option key={u} value={u}>
                {m.units.label(u)}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <Field label={m.form.dosage} hint={m.common.optional} htmlFor="dosage">
        <TextInput id="dosage" value={v.dosage} onChange={(e) => set("dosage", e.target.value)} placeholder={m.form.dosagePlaceholder} autoComplete="off" />
      </Field>

      <Field label={m.scan.fields.ean} hint={m.common.optional} htmlFor="ean">
        <TextInput
          id="ean"
          inputMode="numeric"
          value={v.ean ?? ""}
          onChange={(e) => set("ean", e.target.value.replace(/\D/g, "") || undefined)}
          autoComplete="off"
        />
      </Field>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1.5 text-lg font-semibold">{m.form.frequency}</legend>
        <div className="grid grid-cols-1 gap-2">
          {presetBtn("once", m.form.freqOnce)}
          {presetBtn("twice", m.form.freqTwice)}
          {presetBtn("three", m.form.freqThree)}
          {presetBtn("days", m.form.freqDays)}
          {presetBtn("interval", m.form.freqInterval)}
        </div>
        {v.frequency.type === "specificDays" ? (
          <div className="mt-2 grid grid-cols-4 gap-2">
            {[1, 2, 3, 4, 5, 6, 0].map((d) => {
              const on = v.frequency.days?.includes(d) ?? false;
              return (
                <button
                  key={d}
                  type="button"
                  aria-pressed={on}
                  aria-label={m.weekdays.long[d]}
                  onClick={() => {
                    const days = new Set(v.frequency.days ?? []);
                    if (on) days.delete(d);
                    else days.add(d);
                    setFreq({ ...v.frequency, days: [...days].sort() });
                  }}
                  className={`min-h-14 rounded-xl border-2 text-lg font-semibold ${on ? "border-primary bg-primary text-white" : "border-line bg-white"}`}
                >
                  {m.weekdays.short[d]}
                </button>
              );
            })}
          </div>
        ) : null}
        {v.frequency.type === "interval" ? (
          <div className="mt-2 grid grid-cols-2 gap-3">
            <Field label={m.form.intervalDays} htmlFor="interval">
              <TextInput
                id="interval"
                type="number"
                inputMode="numeric"
                min={1}
                max={365}
                value={v.frequency.intervalDays ?? ""}
                onChange={(e) => setFreq({ ...v.frequency, intervalDays: e.target.value === "" ? undefined : Number(e.target.value) })}
              />
            </Field>
            <Field label={m.form.startDate} htmlFor="start">
              <TextInput id="start" type="date" value={v.frequency.startDate ?? ""} onChange={(e) => setFreq({ ...v.frequency, startDate: e.target.value || undefined })} />
            </Field>
          </div>
        ) : null}
        {err("frequency") ? <p role="alert" className="text-base font-semibold text-danger">{err("frequency")}</p> : null}
      </fieldset>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1.5 text-lg font-semibold">{m.form.times}</legend>
        {v.times.map((t, i) => (
          <div key={i} className="flex gap-2">
            <TextInput
              type="time"
              aria-label={`${m.form.times} ${i + 1}`}
              value={t}
              onChange={(e) => set("times", v.times.map((x, j) => (j === i ? e.target.value : x)))}
              invalid={!!errors.times}
            />
            {v.times.length > 1 ? (
              <button
                type="button"
                aria-label={m.form.removeTime}
                onClick={() => set("times", v.times.filter((_, j) => j !== i))}
                className="min-h-14 min-w-14 rounded-xl border-2 border-line text-2xl text-danger"
              >
                ×
              </button>
            ) : null}
          </div>
        ))}
        <Button variant="secondary" onClick={() => set("times", [...v.times, "12:00"])}>
          + {m.form.addTime}
        </Button>
        {err("times") ? <p role="alert" className="text-base font-semibold text-danger">{err("times")}</p> : null}
      </fieldset>

      <Field label={m.form.instructions} hint={m.common.optional} htmlFor="instr">
        <TextArea id="instr" value={v.instructions ?? ""} onChange={(e) => set("instructions", e.target.value)} placeholder={m.form.instructionsPlaceholder} />
        <div className="flex flex-wrap gap-2">
          {Object.values(m.form.presets).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => set("instructions", v.instructions?.trim() ? `${v.instructions.trim()}. ${p}` : p)}
              className="min-h-12 rounded-full border-2 border-primary bg-white px-4 text-base font-semibold text-primary"
            >
              + {p}
            </button>
          ))}
        </div>
      </Field>

      <Field label={m.form.notes} hint={m.common.optional} htmlFor="notes">
        <TextArea id="notes" value={v.notes ?? ""} onChange={(e) => set("notes", e.target.value)} />
      </Field>

      <fieldset>
        <legend className="mb-2 text-lg font-semibold">{m.form.color}</legend>
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            aria-pressed={!v.color}
            onClick={() => set("color", undefined)}
            className={`min-h-14 rounded-full border-2 px-4 text-base font-semibold ${!v.color ? "border-primary bg-primary-soft" : "border-line bg-white"}`}
          >
            {m.form.noColor}
          </button>
          {BOX_COLORS.map((c) => (
            <button
              key={c.value}
              type="button"
              aria-pressed={v.color === c.value}
              aria-label={c[locale]}
              onClick={() => set("color", c.value)}
              className={`h-14 w-14 rounded-full ${v.color === c.value ? "ring-4 ring-ink ring-offset-2" : ""}`}
              style={{ background: c.value }}
            />
          ))}
        </div>
      </fieldset>

      {notice ? <Notice tone="error">{notice}</Notice> : null}
      <Button type="submit" variant="success" block className="min-h-16 text-xl" disabled={saving}>
        ✓ {submitLabel}
      </Button>
    </form>
  );
}
