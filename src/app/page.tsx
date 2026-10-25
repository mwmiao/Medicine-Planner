"use client";

import { useCallback, useState } from "react";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { DoseCard } from "@/components/DoseCard";
import { toast } from "@/components/Toast";
import { Card, LinkButton, Loading, Notice, PageTitle } from "@/components/ui";
import { formatDate } from "@/lib/dates";
import { markTaken, snoozeDose, undoDose } from "@/lib/doses";
import { formatDose } from "@/lib/format";
import { useMedications, useTodayDoses } from "@/lib/hooks";
import { useMessages } from "@/lib/i18n";
import { useSyncAvailable, useSyncState } from "@/lib/sync";
import { summarize, type Dose } from "@/lib/schedule";

export default function TodayPage() {
  const { m, locale } = useMessages();
  const { doses, now } = useTodayDoses();
  const meds = useMedications();
  const syncAvailable = useSyncAvailable();
  const sync = useSyncState();
  const [confirming, setConfirming] = useState<Dose | null>(null);
  const [undoing, setUndoing] = useState<Dose | null>(null);

  const closeConfirm = useCallback(() => setConfirming(null), []);
  const closeUndo = useCallback(() => setUndoing(null), []);

  const run = async (fn: () => Promise<unknown>) => {
    try {
      await fn();
    } catch {
      toast(m.common.errorGeneric, "error");
    }
  };

  const dateLabel = formatDate(now, locale, { weekday: "long", day: "numeric", month: "long" });

  if (!doses || !meds) return <Loading label={m.common.loading} />;

  const { taken, total } = summarize(doses);

  return (
    <>
      <PageTitle sub={dateLabel.charAt(0).toUpperCase() + dateLabel.slice(1)}>{m.today.title}</PageTitle>

      {syncAvailable && sync.status === "off" ? (
        <div className="mb-4">
          <Notice tone="warn">
            <p className="font-bold">☁️ {m.sync.todayPrompt}</p>
            <div className="mt-2">
              <LinkButton href="/settings/" block>
                {m.sync.todayPromptAction}
              </LinkButton>
            </div>
          </Notice>
        </div>
      ) : sync.status === "unauthorized" || sync.status === "unavailable" || sync.status === "error" ? (
        <div className="mb-4">
          <Notice tone="error">
            <a href="/settings/" className="underline">
              {m.sync.todayProblem}
            </a>
          </Notice>
        </div>
      ) : null}

      {meds.length === 0 ? (
        <Card className="text-center">
          <p className="text-xl">{m.today.noMeds}</p>
          <div className="mt-4">
            <LinkButton href="/medications/new/" block>
              + {m.today.addFirst}
            </LinkButton>
          </div>
        </Card>
      ) : total === 0 ? (
        <Notice>{m.today.noDoses}</Notice>
      ) : (
        <>
          <div className="mb-4 rounded-3xl bg-white p-5 ring-1 ring-line">
            <p className="text-2xl font-bold">{m.today.summary(taken, total)}</p>
            <div className="mt-3 h-4 overflow-hidden rounded-full bg-gray-200" aria-hidden>
              <div className="h-full rounded-full bg-taken transition-all" style={{ width: `${(taken / total) * 100}%` }} />
            </div>
            {taken === total ? <p className="mt-3 text-lg font-semibold text-taken">{m.today.allTaken}</p> : null}
          </div>
          <ul className="flex flex-col gap-4">
            {doses.map((d) => (
              <li key={d.id}>
                <DoseCard
                  dose={d}
                  onTake={setConfirming}
                  onSnooze={(dose) => run(() => snoozeDose(dose.medication.id, dose.scheduledFor))}
                  onUndo={setUndoing}
                />
              </li>
            ))}
          </ul>
        </>
      )}

      <div className="mt-6">
        <LinkButton href="/history/" variant="secondary" block>
          📅 {m.today.history}
        </LinkButton>
      </div>

      <ConfirmDialog
        open={!!confirming}
        title={m.today.confirmTitle}
        confirmLabel={`✓ ${m.today.confirmYes}`}
        cancelLabel={m.today.confirmNo}
        tone="success"
        onCancel={closeConfirm}
        onConfirm={() => {
          const d = confirming;
          setConfirming(null);
          if (d) void run(() => markTaken(d.medication.id, d.scheduledFor));
        }}
      >
        {confirming ? (
          <p className="text-xl text-ink">{m.today.confirmBody(confirming.medication.name, formatDose(confirming.medication, m), confirming.time)}</p>
        ) : null}
      </ConfirmDialog>

      <ConfirmDialog
        open={!!undoing}
        title={m.today.undoTitle}
        confirmLabel={m.today.undo}
        cancelLabel={m.common.cancel}
        onCancel={closeUndo}
        onConfirm={() => {
          const d = undoing;
          setUndoing(null);
          if (d) void run(() => undoDose(d.medication.id, d.scheduledFor));
        }}
      >
        {m.today.undoBody}
      </ConfirmDialog>
    </>
  );
}
