import { describe, expect, it } from "vitest";
import { markTaken } from "@/lib/doses";
import { createMedication, deleteMedication, MedicationValidationError, updateMedication, validateMedication } from "@/lib/medications";
import { input, testDb } from "./helpers";

describe("criar e editar medicamentos", () => {
  it("cria um medicamento com horas ordenadas e sem duplicados", async () => {
    const db = testDb();
    const med = await createMedication(input({ name: "  Ben-u-ron  ", times: ["20:00", "08:00", "08:00"] }), new Date(2026, 9, 1), db);
    expect(med.name).toBe("Ben-u-ron");
    expect(med.times).toEqual(["08:00", "20:00"]);
    expect(await db.medications.get(med.id)).toEqual(med);
  });

  it("recusa dados inválidos com mensagens por campo", async () => {
    const db = testDb();
    const errors = validateMedication(input({ name: "", quantityPerDose: 0, times: [] }));
    expect(errors).toEqual({ name: "nameRequired", quantity: "quantityInvalid", times: "timesRequired" });
    await expect(createMedication(input({ name: "" }), new Date(), db)).rejects.toBeInstanceOf(MedicationValidationError);
    expect(validateMedication(input({ frequency: { type: "specificDays", days: [] } })).frequency).toBe("daysRequired");
    expect(validateMedication(input({ frequency: { type: "interval", intervalDays: 0 } })).frequency).toBe("intervalInvalid");
    expect(validateMedication(input({ times: ["25:00"] })).times).toBe("timeInvalid");
  });

  it("edita mantendo a data de criação", async () => {
    const db = testDb();
    const med = await createMedication(input(), new Date(2026, 9, 1), db);
    const later = new Date(2026, 9, 5);
    const updated = await updateMedication(med.id, input({ name: "Paracetamol", quantityPerDose: 2 }), later, db);
    expect(updated.createdAt).toBe(med.createdAt);
    expect(updated.updatedAt).toBe(later.toISOString());
    expect((await db.medications.get(med.id))?.quantityPerDose).toBe(2);
  });

  it("apagar remove também o histórico de tomas", async () => {
    const db = testDb();
    const med = await createMedication(input(), new Date(), db);
    await markTaken(med.id, "2026-10-01T08:00", new Date(), db);
    await deleteMedication(med.id, db);
    expect(await db.medications.count()).toBe(0);
    expect(await db.doseLogs.count()).toBe(0);
  });
});
