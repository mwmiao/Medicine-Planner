"use client";

import Link from "next/link";
import { useLiveQuery } from "dexie-react-hooks";
import { Card, ColorDot, LinkButton, Loading, PageTitle } from "@/components/ui";
import { toDateKey } from "@/lib/dates";
import { db } from "@/lib/db";
import { describeFrequency, formatDateTimeShort, formatDose } from "@/lib/format";
import { useMedications, useNow } from "@/lib/hooks";
import { useMessages } from "@/lib/i18n";
import { nextDose } from "@/lib/schedule";

export default function MedicationsPage() {
  const { m, locale } = useMessages();
  const meds = useMedications();
  const now = useNow(60_000);
  const today = toDateKey(now);
  const logs = useLiveQuery(() => db.doseLogs.where("scheduledFor").aboveOrEqual(today).toArray(), [today]);

  return (
    <>
      <PageTitle>{m.meds.title}</PageTitle>
      <div className="mb-5 grid grid-cols-1 gap-3">
        <LinkButton href="/medications/new/" block>
          + {m.meds.add}
        </LinkButton>
        <LinkButton href="/medications/new/?scan=1" variant="secondary" block>
          📷 {m.scan.button}
        </LinkButton>
      </div>
      {!meds || !logs ? (
        <Loading label={m.common.loading} />
      ) : meds.length === 0 ? (
        <Card className="text-center text-xl">{m.meds.empty}</Card>
      ) : (
        <ul className="flex flex-col gap-3">
          {meds.map((med) => {
            const next = nextDose(med, logs, now);
            return (
              <li key={med.id}>
                <Link
                  href={`/medications/view/?id=${encodeURIComponent(med.id)}`}
                  className="flex items-center gap-4 rounded-3xl bg-white p-5 shadow-sm ring-1 ring-line active:bg-primary-soft"
                  style={med.color ? { borderLeft: `10px solid ${med.color}` } : undefined}
                >
                  <div className="min-w-0 flex-1">
                    <h2 className="flex items-center gap-2 text-2xl font-bold break-words">
                      <ColorDot color={med.color} size="h-5 w-5" />
                      {med.name}
                    </h2>
                    <p className="text-lg">{formatDose(med, m)}</p>
                    <p className="text-base text-muted">
                      {describeFrequency(med, m)} · {med.times.join(", ")}
                    </p>
                    <p className="mt-1 text-lg font-semibold text-primary">
                      {m.meds.nextDose}: {next ? formatDateTimeShort(next, locale) : m.meds.noNextDose}
                    </p>
                  </div>
                  <span aria-hidden className="text-3xl text-muted">
                    ›
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
