// Constrói a lista de lembretes ("trabalhos") que o NAS deve enviar por Web Push.
// O texto já vai no idioma escolhido, para o servidor não precisar de traduções.

import { addDays, parseLocalDateTime, toDateKey } from "../dates";
import { formatDose } from "../format";
import type { Messages } from "../i18n/pt";
import { doseId, isScheduledOn } from "../schedule";
import type { DoseLog, Medication } from "../types";

export type ReminderJob = {
  id: string;
  /** Instante UTC (ISO) em que o lembrete deve chegar. */
  at: string;
  title: string;
  body: string;
  /** Abre a app no ecrã "Hoje". */
  url: string;
  medicationId: string;
  scheduledFor: string;
};

/** Quantos dias de lembretes são enviados ao NAS (a lista é renovada sempre que a app abre). */
export const REMINDER_DAYS = 30;
export const REMINDER_URL = "/?from=reminder";
/** Minutos até ao segundo lembrete, se a toma continuar por registar. */
export const FOLLOW_UP_MINUTES = 15;
/** Só os primeiros dias têm segundo lembrete (a lista tem um máximo de 5000 no NAS). */
export const FOLLOW_UP_DAYS = 7;

export function buildReminderJobs(meds: Medication[], logs: DoseLog[], m: Messages, now: Date = new Date(), days = REMINDER_DAYS): ReminderJob[] {
  const byId = new Map(logs.map((l) => [l.id, l]));
  const jobs: ReminderJob[] = [];
  for (let i = 0; i < days; i++) {
    const day = addDays(now, i);
    const key = toDateKey(day);
    for (const med of meds) {
      if (!isScheduledOn(med, day)) continue;
      for (const time of [...new Set(med.times)]) {
        const scheduledFor = `${key}T${time}`;
        const id = doseId(med.id, scheduledFor);
        const log = byId.get(id);
        if (log?.status === "taken" || log?.status === "skipped") continue;
        // Toma adiada: o lembrete passa para a nova hora.
        const when = log?.status === "snoozed" && log.snoozedUntil ? log.snoozedUntil : scheduledFor;
        const at = parseLocalDateTime(when);
        const jobId = when === scheduledFor ? id : `${id}|${when}`;
        if (at.getTime() >= now.getTime() - 60_000) {
          jobs.push({
            id: jobId,
            at: at.toISOString(),
            title: m.reminders.pushTitle(med.name),
            body: m.reminders.pushBody(formatDose(med, m), time),
            url: REMINDER_URL,
            medicationId: med.id,
            scheduledFor,
          });
        }
        if (i < FOLLOW_UP_DAYS) {
          const followAt = new Date(at.getTime() + FOLLOW_UP_MINUTES * 60_000);
          if (followAt.getTime() >= now.getTime() - 60_000) {
            jobs.push({
              id: `${jobId}|again`,
              at: followAt.toISOString(),
              title: m.reminders.pushTitle(med.name),
              body: m.reminders.pushFollowUp(formatDose(med, m), time),
              url: REMINDER_URL,
              medicationId: med.id,
              scheduledFor,
            });
          }
        }
      }
    }
  }
  return jobs.sort((a, b) => a.at.localeCompare(b.at));
}
