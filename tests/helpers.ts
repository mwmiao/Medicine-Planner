import { PlannerDB } from "@/lib/db";
import { emptyMedication, type MedicationInput } from "@/lib/medications";

let n = 0;
export function testDb(): PlannerDB {
  n += 1;
  return new PlannerDB(`test-${Date.now()}-${n}`);
}

export function input(overrides: Partial<MedicationInput> = {}): MedicationInput {
  return { ...emptyMedication(), name: "Ben-u-ron", dosage: "500 mg", ...overrides };
}
