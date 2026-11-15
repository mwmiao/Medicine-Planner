import { isValidTime } from "./dates";
import { db, type PlannerDB } from "./db";
import { newId } from "./id";
import type { Medication, Unit } from "./types";

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

/** Unidade provável a partir da forma farmacêutica; `undefined` se não for claro. */
export function unitFromForm(form?: string): Unit | undefined {
  const f = (form ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  if (!f.trim()) return undefined;
  if (/capsul/.test(f)) return "capsule";
  if (/injet|inject|pomada|creme|gel|supositor|colirio|pó|po para/.test(f)) return undefined;
  if (/comprimid|tablet|drag/.test(f)) return "tablet";
  if (/gota|drop/.test(f)) return "drop";
  if (/xarope|solu|suspens|elixir|syrup|liquid/.test(f)) return "ml";
  return undefined;
}

const COUNT_LADDER = [0.5, 1, 1.5, 2, 3, 4, 5, 6, 8, 10];
const LADDERS: Record<Unit, number[]> = {
  tablet: COUNT_LADDER,
  capsule: COUNT_LADDER,
  other: COUNT_LADDER,
  ml: [1, 2.5, 5, 7.5, 10, 15, 20],
  drop: [1, 2, 3, 4, 5, 10, 15, 20],
  mg: [5, 10, 20, 25, 50, 100, 200, 250, 500, 1000],
};

/** Passo do botão + (dir = 1) ou − (dir = -1) numa escada de quantidades habituais. */
export function stepQuantity(value: number, unit: Unit, dir: 1 | -1): number {
  const ladder = LADDERS[unit];
  if (!Number.isFinite(value) || value <= 0) return ladder.find((x) => x >= 1) ?? ladder[0];
  const next = dir === 1 ? ladder.find((x) => x > value) : [...ladder].reverse().find((x) => x < value);
  return next ?? value;
}

export function toInput(med: Medication): MedicationInput {
  const rest: Partial<Medication> = { ...med };
  delete rest.id;
  delete rest.createdAt;
  delete rest.updatedAt;
  return rest as MedicationInput;
}
