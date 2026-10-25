import { db, type PlannerDB } from "./db";
import type { DoseLog, InfarmedRecord, Medication } from "./types";

export const BACKUP_FORMAT = "medicine-planner-backup";
export const BACKUP_VERSION = 1;

export type Backup = {
  format: typeof BACKUP_FORMAT;
  version: number;
  exportedAt: string;
  medications: Medication[];
  doseLogs: DoseLog[];
  infarmedCache: InfarmedRecord[];
};

export async function exportData(now: Date = new Date(), database: PlannerDB = db): Promise<Backup> {
  const [medications, doseLogs, infarmedCache] = await Promise.all([
    database.medications.toArray(),
    database.doseLogs.toArray(),
    database.infarmedCache.toArray(),
  ]);
  return { format: BACKUP_FORMAT, version: BACKUP_VERSION, exportedAt: now.toISOString(), medications, doseLogs, infarmedCache };
}

export function backupFileName(now: Date = new Date()): string {
  return `medicine-planner-${now.toISOString().slice(0, 10)}.json`;
}

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const isStr = (v: unknown): v is string => typeof v === "string";

export function isMedication(v: unknown): v is Medication {
  return (
    isObj(v) &&
    isStr(v.id) &&
    isStr(v.name) &&
    isStr(v.dosage) &&
    isStr(v.unit) &&
    typeof v.quantityPerDose === "number" &&
    isObj(v.frequency) &&
    isStr(v.frequency.type) &&
    Array.isArray(v.times) &&
    v.times.every(isStr) &&
    isStr(v.createdAt) &&
    isStr(v.updatedAt)
  );
}

export function isDoseLog(v: unknown): v is DoseLog {
  return isObj(v) && isStr(v.id) && isStr(v.medicationId) && isStr(v.scheduledFor) && isStr(v.status);
}

export function isInfarmedRecord(v: unknown): v is InfarmedRecord {
  return isObj(v) && isStr(v.id) && isStr(v.name) && isStr(v.retrievedAt);
}

export class BackupFormatError extends Error {}

/** Valida um objeto JSON lido de um ficheiro. Lança BackupFormatError se não for uma cópia válida. */
export function parseBackup(data: unknown): Backup {
  if (!isObj(data) || data.format !== BACKUP_FORMAT) throw new BackupFormatError("Not a Medicine Planner backup");
  if (typeof data.version !== "number" || data.version > BACKUP_VERSION) throw new BackupFormatError("Unsupported version");
  const { medications, doseLogs, infarmedCache = [] } = data;
  if (!Array.isArray(medications) || !medications.every(isMedication)) throw new BackupFormatError("Invalid medications");
  if (!Array.isArray(doseLogs) || !doseLogs.every(isDoseLog)) throw new BackupFormatError("Invalid dose logs");
  if (!Array.isArray(infarmedCache) || !infarmedCache.every(isInfarmedRecord)) throw new BackupFormatError("Invalid cache");
  return {
    format: BACKUP_FORMAT,
    version: data.version,
    exportedAt: isStr(data.exportedAt) ? data.exportedAt : "",
    medications,
    doseLogs,
    infarmedCache: infarmedCache.map((r) => ({
      ...r,
      origin: r.origin ?? "user-copied",
      nameLower: r.name.toLowerCase(),
      substanceLower: (r.activeSubstance ?? "").toLowerCase(),
    })),
  };
}

/** Substitui todos os dados atuais pelos da cópia de segurança. */
export async function importData(text: string, database: PlannerDB = db): Promise<Backup> {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new BackupFormatError("Invalid JSON");
  }
  const backup = parseBackup(json);
  await database.transaction("rw", database.medications, database.doseLogs, database.infarmedCache, async () => {
    await Promise.all([database.medications.clear(), database.doseLogs.clear(), database.infarmedCache.clear()]);
    await database.medications.bulkPut(backup.medications);
    await database.doseLogs.bulkPut(backup.doseLogs);
    await database.infarmedCache.bulkPut(backup.infarmedCache);
  });
  return backup;
}

export async function deleteAllData(database: PlannerDB = db): Promise<void> {
  await database.transaction("rw", database.medications, database.doseLogs, database.infarmedCache, async () => {
    await Promise.all([database.medications.clear(), database.doseLogs.clear(), database.infarmedCache.clear()]);
  });
}
