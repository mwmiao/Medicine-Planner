import { isValidTime } from "./dates";
import { db, type PlannerDB } from "./db";
import { newId } from "./id";
import type { Medication } from "./types";

export type MedicationInput = Omit<Medication, "id" | "createdAt" | "updatedAt">;

export type ValidationError =
  | "nameRequired"
  | "quantityInvalid"
  | "timesRequired"
  | "timeInvalid"
  | "daysRequired"
  | "intervalInvalid";

export type ValidationErrors = Partial<Record<"name" | "quantity" | "times" | "frequency", ValidationError>>;

export function validateMedication(input: MedicationInput): ValidationErrors {
  const errors: ValidationErrors = {};
  if (!input.name.trim()) errors.name = "nameRequired";
  if (!Number.isFinite(input.quantityPerDose) || input.quantityPerDose <= 0) errors.quantity = "quantityInvalid";
  if (input.times.length === 0) errors.times = "timesRequired";
  else if (input.times.some((t) => !isValidTime(t))) errors.times = "timeInvalid";
  if (input.frequency.type === "specificDays" && !(input.frequency.days?.length)) errors.frequency = "daysRequired";
  if (input.frequency.type === "interval") {
    const n = input.frequency.intervalDays ?? 0;
    if (!Number.isInteger(n) || n < 1 || n > 365) errors.frequency = "intervalInvalid";
  }
  return errors;
}

export class MedicationValidationError extends Error {
  constructor(public readonly errors: ValidationErrors) {
    super("Invalid medication");
  }
}

function clean(input: MedicationInput): MedicationInput {
  const times = [...new Set(input.times)].sort();
  return {
    ...input,
    name: input.name.trim(),
    dosage: input.dosage.trim(),
    activeSubstance: input.activeSubstance?.trim() || undefined,
    instructions: input.instructions?.trim() || undefined,
    notes: input.notes?.trim() || undefined,
    times,
  };
}

export async function createMedication(
  input: MedicationInput,
  now: Date = new Date(),
  database: PlannerDB = db,
): Promise<Medication> {
  const errors = validateMedication(input);
  if (Object.keys(errors).length) throw new MedicationValidationError(errors);
  const stamp = now.toISOString();
  const med: Medication = { ...clean(input), id: newId(), createdAt: stamp, updatedAt: stamp };
  await database.medications.add(med);
  return med;
}

export async function updateMedication(
  id: string,
  input: MedicationInput,
  now: Date = new Date(),
  database: PlannerDB = db,
): Promise<Medication> {
  const errors = validateMedication(input);
  if (Object.keys(errors).length) throw new MedicationValidationError(errors);
  const existing = await database.medications.get(id);
  if (!existing) throw new Error("Medication not found");
  const med: Medication = { ...clean(input), id, createdAt: existing.createdAt, updatedAt: now.toISOString() };
  await database.medications.put(med);
  return med;
}

export async function deleteMedication(id: string, database: PlannerDB = db): Promise<void> {
  await database.transaction("rw", database.medications, database.doseLogs, async () => {
    await database.medications.delete(id);
    await database.doseLogs.where("medicationId").equals(id).delete();
  });
}

export function emptyMedication(): MedicationInput {
  return {
    name: "",
    dosage: "",
    unit: "tablet",
    quantityPerDose: 1,
    frequency: { type: "daily" },
    times: ["08:00"],
  };
}

export function toInput(med: Medication): MedicationInput {
  const rest: Partial<Medication> = { ...med };
  delete rest.id;
  delete rest.createdAt;
  delete rest.updatedAt;
  return rest as MedicationInput;
}
