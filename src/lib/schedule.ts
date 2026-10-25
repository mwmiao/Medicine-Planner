import { addDays, daysBetween, parseDateKey, parseLocalDateTime, toDateKey } from "./dates";
import type { DoseLog, Medication } from "./types";

/** Minutos depois da hora marcada em que a toma ainda conta como "tomar agora". */
export const DUE_WINDOW_MINUTES = 30;

export type DoseView = "upcoming" | "due" | "overdue" | "snoozed" | "taken" | "skipped";

export type Dose = {
  id: string;
  medication: Medication;
  scheduledFor: string;
  time: string;
  log?: DoseLog;
  view: DoseView;
};

export function doseId(medicationId: string, scheduledFor: string): string {
  return `${medicationId}|${scheduledFor}`;
}

export function isScheduledOn(med: Medication, date: Date): boolean {
  const created = parseDateKey(med.createdAt.slice(0, 10));
  const f = med.frequency;
  switch (f.type) {
    case "daily":
      return true;
    case "specificDays":
      return (f.days ?? []).includes(date.getDay());
    case "interval": {
      const every = Math.max(1, Math.floor(f.intervalDays ?? 1));
      const start = f.startDate ? parseDateKey(f.startDate) : created;
      const diff = daysBetween(start, date);
      return diff >= 0 && diff % every === 0;
    }
  }
}

export function doseView(scheduledFor: string, log: DoseLog | undefined, now: Date): DoseView {
  if (log?.status === "taken") return "taken";
  if (log?.status === "skipped") return "skipped";
  if (log?.status === "snoozed" && log.snoozedUntil && parseLocalDateTime(log.snoozedUntil) > now) {
    return "snoozed";
  }
  const at = parseLocalDateTime(log?.status === "snoozed" && log.snoozedUntil ? log.snoozedUntil : scheduledFor);
  const minutesLate = (now.getTime() - at.getTime()) / 60_000;
  if (minutesLate < 0) return "upcoming";
  if (minutesLate <= DUE_WINDOW_MINUTES) return "due";
  return "overdue";
}

/** Gera as tomas de um dia a partir dos medicamentos e dos registos guardados, ordenadas por hora. */
export function generateDoses(meds: Medication[], logs: DoseLog[], date: Date, now: Date = new Date()): Dose[] {
  const key = toDateKey(date);
  const byId = new Map(logs.map((l) => [l.id, l]));
  const doses: Dose[] = [];
  for (const med of meds) {
    if (!isScheduledOn(med, date)) continue;
    for (const time of [...new Set(med.times)]) {
      const scheduledFor = `${key}T${time}`;
      const id = doseId(med.id, scheduledFor);
      const log = byId.get(id);
      doses.push({ id, medication: med, scheduledFor, time, log, view: doseView(scheduledFor, log, now) });
    }
  }
  return doses.sort((a, b) => a.time.localeCompare(b.time) || a.medication.name.localeCompare(b.medication.name));
}

export function summarize(doses: Dose[]): { taken: number; total: number } {
  return { taken: doses.filter((d) => d.view === "taken").length, total: doses.length };
}

/** Próxima toma futura (não tomada) de um medicamento, procurando até 60 dias à frente. */
export function nextDose(med: Medication, logs: DoseLog[], now: Date = new Date()): string | undefined {
  const byId = new Map(logs.map((l) => [l.id, l]));
  const times = [...new Set(med.times)].sort();
  for (let i = 0; i < 60; i++) {
    const day = addDays(now, i);
    if (!isScheduledOn(med, day)) continue;
    const key = toDateKey(day);
    for (const time of times) {
      const at = `${key}T${time}`;
      const log = byId.get(doseId(med.id, at));
      if (log?.status === "taken" || log?.status === "skipped") continue;
      if (parseLocalDateTime(at).getTime() + 60_000 * DUE_WINDOW_MINUTES >= now.getTime()) return at;
    }
  }
  return undefined;
}
