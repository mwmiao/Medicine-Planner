"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { MedicationForm } from "@/components/MedicationForm";
import { toast } from "@/components/Toast";
import { PageTitle } from "@/components/ui";
import { useMessages } from "@/lib/i18n";
import { createMedication, emptyMedication } from "@/lib/medications";

function NewMedication() {
  const { m } = useMessages();
  const router = useRouter();
  const scan = useSearchParams().get("scan") === "1";
  return (
    <>
      <PageTitle>{m.form.titleNew}</PageTitle>
      <MedicationForm
        initial={emptyMedication()}
        autoScan={scan}
        submitLabel={m.common.save}
        onSubmit={async (input) => {
          const med = await createMedication(input);
          toast(m.meds.saved);
          router.replace(`/medications/view/?id=${encodeURIComponent(med.id)}`);
        }}
      />
    </>
  );
}

export default function NewMedicationPage() {
  return (
    <Suspense>
      <NewMedication />
    </Suspense>
  );
}
