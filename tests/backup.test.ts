import { describe, expect, it } from "vitest";
import { BackupFormatError, exportData, importData } from "@/lib/backup";
import { markTaken } from "@/lib/doses";
import { cacheRecord } from "@/lib/infarmed/search";
import { createMedication } from "@/lib/medications";
import { input, testDb } from "./helpers";

describe("exportar e importar JSON", () => {
  it("exporta e volta a importar tudo noutra base de dados", async () => {
    const source = testDb();
    const med = await createMedication(input({ color: "#2563eb" }), new Date(), source);
    await markTaken(med.id, "2026-10-25T08:00", new Date(), source);
    await cacheRecord({ id: "abc12345", name: "Ben-u-ron", origin: "user-copied" }, new Date(), source);

    const json = JSON.stringify(await exportData(new Date(), source));

    const target = testDb();
    await createMedication(input({ name: "Antigo" }), new Date(), target);
    const backup = await importData(json, target);

    expect(backup.medications).toHaveLength(1);
    expect((await target.medications.toArray()).map((m) => m.name)).toEqual(["Ben-u-ron"]);
    expect(await target.doseLogs.count()).toBe(1);
    expect((await target.infarmedCache.get("abc12345"))?.name).toBe("Ben-u-ron");
  });

  it("recusa ficheiros inválidos sem apagar os dados", async () => {
    const db = testDb();
    await createMedication(input(), new Date(), db);
    await expect(importData("não é json", db)).rejects.toBeInstanceOf(BackupFormatError);
    await expect(importData(JSON.stringify({ format: "outro" }), db)).rejects.toBeInstanceOf(BackupFormatError);
    await expect(
      importData(JSON.stringify({ format: "medicine-planner-backup", version: 1, medications: [{ id: 1 }], doseLogs: [] }), db),
    ).rejects.toBeInstanceOf(BackupFormatError);
    expect(await db.medications.count()).toBe(1);
  });
});
