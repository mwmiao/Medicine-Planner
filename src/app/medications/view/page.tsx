"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useState } from "react";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { MedicalInfoSection } from "@/components/MedicalInfoSection";
import { toast } from "@/components/Toast";
import { Button, Card, ColorDot, LinkButton, Loading, Notice } from "@/components/ui";
import { toDateKey } from "@/lib/dates";
import { db } from "@/lib/db";
import { describeFrequency, formatDateTimeShort, formatDose } from "@/lib/format";
import { useNow } from "@/lib/hooks";
import { useMessages } from "@/lib/i18n";
import { deleteMedication, toInput, updateMedication } from "@/lib/medications";
import { nextDose } from "@/lib/schedule";

function MedicationDetail() {
  const { m, locale } = useMessages();
  const router = useRouter();
  const id = useSearchParams().get("id") ?? "";
  const now = useNow(60_000);
  const today = toDateKey(now);
  const med = useLiveQuery(async () => (await db.medications.get(id)) ?? null, [id]);
  const logs = useLiveQuery(() => db.doseLogs.where("medicationId").equals(id).filter((l) => l.scheduledFor >= today).toArray(), [id, today]);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const closeDelete = useCallback(() => setConfirmDelete(false), []);

  if (med === undefined) return <Loading label={m.common.loading} />;
  if (med === null)
    return (
      <>
        <Notice tone="error">{m.meds.notFound}</Notice>
        <div className="mt-4">
          <LinkButton href="/medications/" variant="secondary" block>
            ← {m.common.back}
          </LinkButton>
        </div>
      </>
    );

  const next = logs ? nextDose(med, logs, now) : undefined;

  return (
    <div className="flex flex-col gap-5">
      <LinkButton href="/medications/" variant="ghost" className="self-start px-0">
        ← {m.meds.title}
      </LinkButton>

      <div style={med.color ? { borderLeft: `10px solid ${med.color}` } : undefined} className="rounded-3xl bg-white p-5 ring-1 ring-line">
        <h1 className="flex items-center gap-3 text-3xl font-bold break-words">
          <ColorDot color={med.color} size="h-7 w-7" />
          {med.name}
        </h1>
        {med.activeSubstance ? <p className="mt-1 text-xl text-muted">{med.activeSubstance}</p> : null}
        {med.pharmaceuticalForm ? <p className="text-lg text-muted">{med.pharmaceuticalForm}</p> : null}
      </div>

      <Card>
        <h2 className="mb-3 text-2xl font-bold">{m.meds.schedule}</h2>
        <dl className="flex flex-col gap-3 text-xl">
          <div>
            <dt className="text-base text-muted">{m.meds.dose}</dt>
            <dd className="font-semibold">{formatDose(med, m)}</dd>
          </div>
          <div>
            <dt className="text-base text-muted">{m.form.frequency}</dt>
            <dd className="font-semibold">{describeFrequency(med, m)}</dd>
          </div>
          <div>
            <dt className="text-base text-muted">{m.meds.times}</dt>
            <dd className="flex flex-wrap gap-2">
              {med.times.map((t) => (
                <span key={t} className="rounded-xl bg-primary-soft px-3 py-1 text-xl font-bold tabular-nums text-blue-950">
                  {t}
                </span>
              ))}
            </dd>
          </div>
          <div>
            <dt className="text-base text-muted">{m.meds.nextDose}</dt>
            <dd className="font-semibold text-primary">{next ? formatDateTimeShort(next, locale) : m.meds.noNextDose}</dd>
          </div>
          {med.instructions ? (
            <div>
              <dt className="text-base text-muted">{m.form.instructions}</dt>
              <dd className="font-semibold">{med.instructions}</dd>
            </div>
          ) : null}
        </dl>
      </Card>

      <MedicalInfoSection
        med={med}
        onSave={async (info) => {
          await updateMedication(med.id, { ...toInput(med), medicalInfo: info });
          toast(m.meds.saved);
        }}
      />

      {!med.infarmed?.matched ? <Notice>{m.infarmed.notLinked}</Notice> : null}

      <div className="flex flex-col gap-3">
        <LinkButton href={`/medications/edit/?id=${encodeURIComponent(med.id)}`} variant="secondary" block>
          ✏️ {m.common.edit}
        </LinkButton>
        <Button variant="danger" block onClick={() => setConfirmDelete(true)}>
          🗑 {m.common.delete}
        </Button>
      </div>

      <ConfirmDialog
        open={confirmDelete}
        title={m.meds.deleteTitle}
        confirmLabel={m.meds.deleteYes}
        cancelLabel={m.common.cancel}
        tone="danger"
        onCancel={closeDelete}
        onConfirm={async () => {
          setConfirmDelete(false);
          await deleteMedication(med.id);
          toast(m.meds.deleted);
          router.replace("/medications/");
        }}
      >
        {m.meds.deleteBody(med.name)}
      </ConfirmDialog>
    </div>
  );
}

export default function MedicationDetailPage() {
  return (
    <Suspense>
      <MedicationDetail />
    </Suspense>
  );
}
