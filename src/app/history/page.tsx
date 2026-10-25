"use client";

import { useMemo } from "react";
import { Card, ColorDot, LinkButton, Loading, Notice, PageTitle } from "@/components/ui";
import { addDays, formatDate, toDateKey } from "@/lib/dates";
import { formatClock } from "@/lib/format";
import { useLogsSince, useMedications, useNow } from "@/lib/hooks";
import { useMessages } from "@/lib/i18n";
import { generateDoses } from "@/lib/schedule";

export default function HistoryPage() {
  const { m, locale } = useMessages();
  const now = useNow(60_000);
  const meds = useMedications();
  const logs = useLogsSince(6, now);

  const days = useMemo(() => {
    if (!meds || !logs) return undefined;
    return Array.from({ length: 7 }, (_, i) => {
      const date = addDays(now, -i);
      // Só conta medicamentos que já existiam nesse dia.
      const existing = meds.filter((med) => med.createdAt.slice(0, 10) <= toDateKey(date));
      return { date, doses: generateDoses(existing, logs, date, now) };
    });
  }, [meds, logs, now]);

  if (!days) return <Loading label={m.common.loading} />;
  const anything = days.some((d) => d.doses.length > 0);

  return (
    <>
      <PageTitle>{m.history.title}</PageTitle>
      {!anything ? <Notice>{m.history.empty}</Notice> : null}
      <div className="flex flex-col gap-4">
        {days.map(({ date, doses }, i) => {
          if (!doses.length) return null;
          const taken = doses.filter((d) => d.view === "taken").length;
          const label = i === 0 ? m.history.today : i === 1 ? m.history.yesterday : formatDate(date, locale, { weekday: "long" });
          return (
            <Card key={toDateKey(date)}>
              <div className="flex items-baseline justify-between gap-2">
                <h2 className="text-2xl font-bold">{label.charAt(0).toUpperCase() + label.slice(1)}</h2>
                <span className="text-lg text-muted">{formatDate(date, locale, { day: "numeric", month: "short" })}</span>
              </div>
              <p className={`mt-1 text-lg font-semibold ${taken === doses.length ? "text-taken" : "text-overdue"}`}>
                {m.history.count(taken, doses.length)}
              </p>
              <ul className="mt-3 divide-y divide-line">
                {doses.map((d) => {
                  const ok = d.view === "taken";
                  const pendingToday = i === 0 && (d.view === "upcoming" || d.view === "due" || d.view === "snoozed");
                  return (
                    <li key={d.id} className="flex items-center gap-3 py-3">
                      <span className="w-14 text-lg font-bold tabular-nums">{d.time}</span>
                      <ColorDot color={d.medication.color} size="h-4 w-4" />
                      <span className="flex-1 text-lg break-words">{d.medication.name}</span>
                      <span className={`text-lg font-semibold ${ok ? "text-taken" : pendingToday ? "text-muted" : "text-overdue"}`}>
                        {ok
                          ? `✓ ${d.log?.takenAt ? formatClock(d.log.takenAt) : ""}`
                          : pendingToday
                            ? m.today.status.upcoming
                            : m.history.notTaken}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </Card>
          );
        })}
      </div>
      <div className="mt-6">
        <LinkButton href="/" variant="secondary" block>
          ← {m.common.back}
        </LinkButton>
      </div>
    </>
  );
}
