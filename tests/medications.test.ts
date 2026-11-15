import { describe, expect, it } from "vitest";
import { markTaken } from "@/lib/doses";
import { createMedication, deleteMedication, MedicationValidationError, doseUnitLooksWrong, stepQuantity, unitFromForm, updateMedication, validateMedication } from "@/lib/medications";
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

describe("unidade a partir da forma farmacêutica", () => {
  it("reconhece as formas mais comuns, em português e inglês", () => {
    expect(unitFromForm("Comprimido revestido")).toBe("tablet");
    expect(unitFromForm("tablet")).toBe("tablet");
    expect(unitFromForm("Cápsula")).toBe("capsule");
    expect(unitFromForm("Capsulas moles")).toBe("capsule");
    expect(unitFromForm("Suspensão oral")).toBe("ml");
    expect(unitFromForm("Xarope")).toBe("ml");
    expect(unitFromForm("Solução oral")).toBe("ml");
    expect(unitFromForm("Gotas orais")).toBe("drop");
  });
  it("não adivinha quando não sabe", () => {
    expect(unitFromForm(undefined)).toBeUndefined();
    expect(unitFromForm("")).toBeUndefined();
    expect(unitFromForm("Pomada")).toBeUndefined();
    expect(unitFromForm("Solução injetável")).toBeUndefined();
  });
});

describe("botões + e − da quantidade", () => {
  it("sobe e desce numa escada de valores normais", () => {
    expect(stepQuantity(1, "tablet", 1)).toBe(1.5);
    expect(stepQuantity(1, "tablet", -1)).toBe(0.5);
    expect(stepQuantity(2, "capsule", 1)).toBe(3);
    expect(stepQuantity(5, "ml", 1)).toBe(7.5);
    expect(stepQuantity(5, "ml", -1)).toBe(2.5);
    expect(stepQuantity(3, "drop", 1)).toBe(4);
  });
  it("não passa dos extremos", () => {
    expect(stepQuantity(0.5, "tablet", -1)).toBe(0.5);
    expect(stepQuantity(10, "tablet", 1)).toBe(10);
  });
  it("valores fora da escada vão para o vizinho mais próximo na direção pedida", () => {
    expect(stepQuantity(1.2, "tablet", 1)).toBe(1.5);
    expect(stepQuantity(1.2, "tablet", -1)).toBe(1);
  });
  it("um valor inválido volta a um valor normal (≥ 1)", () => {
    expect(stepQuantity(Number.NaN, "tablet", 1)).toBe(1);
    expect(stepQuantity(0, "ml", -1)).toBe(1);
  });
});

describe("doseUnitLooksWrong", () => {
  it("avisa com unidade mg e concentração na força", () => {
    expect(doseUnitLooksWrong({ unit: "mg", dosage: "750 mg/5 ml" })).toBe(true);
  });
  it("avisa com unidade mg e forma líquida", () => {
    expect(doseUnitLooksWrong({ unit: "mg", dosage: "", pharmaceuticalForm: "Suspensão oral" })).toBe(true);
  });
  it("não avisa com unidade ml", () => {
    expect(doseUnitLooksWrong({ unit: "ml", dosage: "750 mg/5 ml" })).toBe(false);
  });
  it("não avisa com comprimido em mg", () => {
    expect(doseUnitLooksWrong({ unit: "mg", dosage: "500 mg", pharmaceuticalForm: "Comprimido" })).toBe(false);
  });
  it("não avisa com unidade comprimido", () => {
    expect(doseUnitLooksWrong({ unit: "tablet", dosage: "500 mg" })).toBe(false);
  });
});
