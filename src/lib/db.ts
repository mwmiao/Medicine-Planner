import Dexie, { type EntityTable } from "dexie";
import type { DoseLog, InfarmedRecord, Medication } from "./types";

export class PlannerDB extends Dexie {
  medications!: EntityTable<Medication, "id">;
  doseLogs!: EntityTable<DoseLog, "id">;
  infarmedCache!: EntityTable<InfarmedRecord, "id">;

  constructor(name = "medicine-planner") {
    super(name);
    this.version(1).stores({
      medications: "id, name, createdAt",
      doseLogs: "id, medicationId, scheduledFor",
      infarmedCache: "id, nameLower, substanceLower, retrievedAt",
    });
  }
}

export const db = new PlannerDB();
