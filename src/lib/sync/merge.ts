// Junção de duas cópias dos dados (telemóvel e NAS).
//
// Regras, pensadas para nunca perder uma toma registada:
// - cada registo é identificado pelo id; se existir nos dois lados, ganha o
//   alterado mais recentemente;
// - apagar deixa uma "lápide" com a data; um registo só volta se for alterado
//   depois de ter sido apagado;
// - registos de tomas de um medicamento apagado desaparecem com ele.

import type { DoseLog, InfarmedRecord, Medication } from "../types";

export type Tombstones = { medications: Record<string, string>; doseLogs: Record<string, string> };

export type SyncData = {
  schema: 1;
  medications: Medication[];
  doseLogs: DoseLog[];
  infarmedCache: InfarmedRecord[];
  tombstones: Tombstones;
};

/** Lápides mais antigas do que isto são esquecidas (os dois lados já as aplicaram). */
export const TOMBSTONE_TTL_DAYS = 180;

export function emptyTombstones(): Tombstones {
  return { medications: {}, doseLogs: {} };
}

function laterOf(a: string | undefined, b: string | undefined): string | undefined {
  if (!a) return b;
  if (!b) return a;
  return a >= b ? a : b;
}

function mergeTombstones(a: Tombstones, b: Tombstones, now: Date): Tombstones {
  const cutoff = new Date(now.getTime() - TOMBSTONE_TTL_DAYS * 86_400_000).toISOString();
  const out = emptyTombstones();
  for (const key of ["medications", "doseLogs"] as const) {
    for (const id of new Set([...Object.keys(a[key]), ...Object.keys(b[key])])) {
      const t = laterOf(a[key][id], b[key][id]);
      if (t && t >= cutoff) out[key][id] = t;
    }
  }
  return out;
}

const STATUS_RANK: Record<DoseLog["status"], number> = { pending: 0, snoozed: 1, skipped: 2, taken: 3 };

export function doseLogTime(l: DoseLog): string {
  return l.updatedAt ?? l.takenAt ?? "";
}

function pickDoseLog(a: DoseLog, b: DoseLog): DoseLog {
  // Segurança: um "tomado" nunca é substituído por "adiado"/"pendente" vindo de
  // outra cópia — senão poderia aparecer outra vez por tomar (dose a dobrar).
  // Só "Desfazer" (lápide) o remove.
  if (STATUS_RANK[a.status] !== STATUS_RANK[b.status] && (a.status === "taken" || b.status === "taken")) {
    return a.status === "taken" ? a : b;
  }
  const ta = doseLogTime(a);
  const tb = doseLogTime(b);
  if (ta !== tb) return ta > tb ? a : b;
  return STATUS_RANK[a.status] >= STATUS_RANK[b.status] ? a : b;
}

function unionBy<T>(a: T[], b: T[], id: (x: T) => string, pick: (x: T, y: T) => T): T[] {
  const map = new Map<string, T>();
  for (const x of a) map.set(id(x), x);
  for (const y of b) {
    const x = map.get(id(y));
    map.set(id(y), x ? pick(x, y) : y);
  }
  return [...map.values()];
}

export function mergeSyncData(local: SyncData, remote: SyncData, now: Date = new Date()): SyncData {
  const tombstones = mergeTombstones(local.tombstones, remote.tombstones, now);

  const medications = unionBy(local.medications, remote.medications, (m) => m.id, (x, y) => (x.updatedAt >= y.updatedAt ? x : y)).filter(
    (m) => !(tombstones.medications[m.id] && tombstones.medications[m.id] >= m.updatedAt),
  );
  const medIds = new Set(medications.map((m) => m.id));

  const doseLogs = unionBy(local.doseLogs, remote.doseLogs, (l) => l.id, pickDoseLog).filter(
    (l) => medIds.has(l.medicationId) && !(tombstones.doseLogs[l.id] && tombstones.doseLogs[l.id] >= doseLogTime(l)),
  );

  const infarmedCache = unionBy(local.infarmedCache, remote.infarmedCache, (r) => r.id, (x, y) => (x.retrievedAt >= y.retrievedAt ? x : y));

  return { schema: 1, medications, doseLogs, infarmedCache, tombstones };
}
