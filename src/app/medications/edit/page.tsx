"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { MedicationForm } from "@/components/MedicationForm";
import { toast } from "@/components/Toast";
import { LinkButton, Loading, Notice, PageTitle } from "@/components/ui";
import { db } from "@/lib/db";
import { useMessages } from "@/lib/i18n";
import { toInput, updateMedication } from "@/lib/medications";

function EditMedication() {
  const { m } = useMessages();
  const router = useRouter();
  const id = useSearchParams().get("id") ?? "";
  const med = useLiveQuery(async () => (await db.medications.get(id)) ?? null, [id]);

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

  return (
    <>
      <PageTitle>{m.form.titleEdit}</PageTitle>
      <MedicationForm
        key={med.id}
        initial={toInput(med)}
        submitLabel={m.common.save}
        onSubmit={async (input) => {
          // Mantém a informação já guardada que o formulário não edita.
          await updateMedication(med.id, { ...input, medicalInfo: input.medicalInfo ?? med.medicalInfo });
          toast(m.meds.saved);
          router.replace(`/medications/view/?id=${encodeURIComponent(med.id)}`);
        }}
      />
    </>
  );
}

export default function EditMedicationPage() {
  return (
    <Suspense>
      <EditMedication />
    </Suspense>
  );
}
