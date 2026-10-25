"use client";

import Link from "next/link";
import { formatClock, formatDose } from "@/lib/format";
import { useMessages } from "@/lib/i18n";
import type { Dose, DoseView } from "@/lib/schedule";
import { Button, ColorDot } from "./ui";

const styles: Record<DoseView, { card: string; badge: string }> = {
  upcoming: { card: "ring-line", badge: "bg-gray-100 text-ink" },
  due: { card: "ring-primary ring-4", badge: "bg-primary text-white" },
  overdue: { card: "ring-overdue ring-4", badge: "bg-overdue text-white" },
  snoozed: { card: "ring-line", badge: "bg-primary-soft text-blue-950" },
  taken: { card: "ring-taken bg-taken-soft/40", badge: "bg-taken text-white" },
  skipped: { card: "ring-line", badge: "bg-gray-200 text-ink" },
};

export function DoseCard({
  dose,
  onTake,
  onSnooze,
  onUndo,
}: {
  dose: Dose;
  onTake: (d: Dose) => void;
  onSnooze: (d: Dose) => void;
  onUndo: (d: Dose) => void;
}) {
  const { m } = useMessages();
  const s = m.today.status;
  const status =
    dose.view === "taken"
      ? s.taken(dose.log?.takenAt ? formatClock(dose.log.takenAt) : dose.time)
      : dose.view === "snoozed"
        ? s.snoozed(dose.log?.snoozedUntil?.slice(11) ?? "")
        : s[dose.view];
  const med = dose.medication;
  const open = dose.view !== "taken" && dose.view !== "skipped";

  return (
    <article className={`rounded-3xl bg-white p-5 shadow-sm ring-2 ${styles[dose.view].card}`}>
      <div className="flex items-start justify-between gap-3">
        <p className="text-3xl font-bold tabular-nums">{dose.time}</p>
        <span className={`rounded-full px-3 py-1 text-base font-bold ${styles[dose.view].badge}`}>
          {dose.view === "taken" ? "✓ " : dose.view === "overdue" ? "! " : ""}
          {status}
        </span>
      </div>
      <Link href={`/medications/view/?id=${encodeURIComponent(med.id)}`} className="mt-2 flex items-center gap-3">
        <ColorDot color={med.color} size="h-7 w-7" />
        <h2 className="text-2xl font-bold break-words">{med.name}</h2>
      </Link>
      <p className="mt-1 text-xl text-ink">{formatDose(med, m)}</p>
      {med.instructions ? <p className="mt-1 text-lg text-muted">{med.instructions}</p> : null}
      {open ? (
        <div className="mt-4 flex flex-col gap-3">
          <Button variant="success" block className="min-h-16 text-xl" onClick={() => onTake(dose)}>
            ✓ {m.today.taken}
          </Button>
          <Button variant="secondary" block onClick={() => onSnooze(dose)}>
            ⏱ {m.today.snooze}
          </Button>
        </div>
      ) : (
        <div className="mt-3">
          <Button variant="ghost" onClick={() => onUndo(dose)} className="min-h-12 px-0 text-base">
            {m.today.undo}
          </Button>
        </div>
      )}
    </article>
  );
}
