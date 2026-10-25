import { addMinutes, toLocalDateTime } from "./dates";
import { db, type PlannerDB } from "./db";
import { doseId } from "./schedule";
import type { DoseLog } from "./types";

export const SNOOZE_MINUTES = 15;

export async function markTaken(
  medicationId: string,
  scheduledFor: string,
  now: Date = new Date(),
  database: PlannerDB = db,
): Promise<DoseLog> {
  const log: DoseLog = {
    id: doseId(medicationId, scheduledFor),
    medicationId,
    scheduledFor,
    takenAt: now.toISOString(),
    status: "taken",
  };
  await database.doseLogs.put(log);
  return log;
}

export async function snoozeDose(
  medicationId: string,
  scheduledFor: string,
  now: Date = new Date(),
  database: PlannerDB = db,
): Promise<DoseLog> {
  const log: DoseLog = {
    id: doseId(medicationId, scheduledFor),
    medicationId,
    scheduledFor,
    snoozedUntil: toLocalDateTime(addMinutes(now, SNOOZE_MINUTES)),
    status: "snoozed",
  };
  await database.doseLogs.put(log);
  return log;
}

/** Desfaz um registo (ex.: marcado por engano). */
export async function undoDose(medicationId: string, scheduledFor: string, database: PlannerDB = db): Promise<void> {
  await database.doseLogs.delete(doseId(medicationId, scheduledFor));
}

export async function logsBetween(fromKey: string, toKeyExclusive: string, database: PlannerDB = db): Promise<DoseLog[]> {
  return database.doseLogs.where("scheduledFor").between(fromKey, toKeyExclusive, true, false).toArray();
}
