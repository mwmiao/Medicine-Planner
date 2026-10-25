import { describe, expect, it } from "vitest";
import { markTaken, snoozeDose } from "@/lib/doses";
import { generateDoses, nextDose, summarize } from "@/lib/schedule";
import type { Medication } from "@/lib/types";
import { input, testDb } from "./helpers";

function med(id: string, overrides: Partial<Medication> = {}): Medication {
  return { ...input(), id, createdAt: "2026-10-01T09:00:00.000Z", updatedAt: "2026-10-01T09:00:00.000Z", ...overrides };
}

// 25 out. 2026 é um domingo.
const SUNDAY = new Date(2026, 9, 25, 7, 0);

describe("gerar as tomas de hoje", () => {
  it("gera e ordena por hora as tomas diárias", () => {
    const meds = [med("a", { name: "B", times: ["20:00", "08:00"] }), med("b", { name: "A", times: ["12:00"] })];
    const doses = generateDoses(meds, [], SUNDAY, SUNDAY);
    expect(doses.map((d) => `${d.time} ${d.medication.name}`)).toEqual(["08:00 B", "12:00 A", "20:00 B"]);
    expect(doses.every((d) => d.view === "upcoming")).toBe(true);
  });

  it("respeita dias específicos e intervalos", () => {
    const meds = [
      med("weekdays", { frequency: { type: "specificDays", days: [1, 2, 3, 4, 5] } }),
      med("sunday", { frequency: { type: "specificDays", days: [0] } }),
      med("every2", { frequency: { type: "interval", intervalDays: 2, startDate: "2026-10-23" } }),
      med("every2-off", { frequency: { type: "interval", intervalDays: 2, startDate: "2026-10-24" } }),
    ];
    const ids = generateDoses(meds, [], SUNDAY, SUNDAY).map((d) => d.medication.id);
    expect(ids.sort()).toEqual(["every2", "sunday"]);
  });

  it("marca como 'tomar agora' e depois 'em atraso'", () => {
    const meds = [med("a", { times: ["08:00"] })];
    expect(generateDoses(meds, [], SUNDAY, new Date(2026, 9, 25, 8, 10))[0].view).toBe("due");
    expect(generateDoses(meds, [], SUNDAY, new Date(2026, 9, 25, 9, 0))[0].view).toBe("overdue");
  });

  it("calcula a próxima toma", () => {
    const m = med("a", { times: ["08:00", "20:00"] });
    expect(nextDose(m, [], new Date(2026, 9, 25, 12, 0))).toBe("2026-10-25T20:00");
    expect(nextDose(m, [], new Date(2026, 9, 25, 21, 0))).toBe("2026-10-26T08:00");
  });
});

describe("marcar uma toma", () => {
  it("marca como tomada e atualiza o resumo", async () => {
    const db = testDb();
    const meds = [med("a", { times: ["08:00", "20:00"] })];
    const now = new Date(2026, 9, 25, 8, 5);
    await markTaken("a", "2026-10-25T08:00", now, db);
    const doses = generateDoses(meds, await db.doseLogs.toArray(), SUNDAY, now);
    expect(doses[0].view).toBe("taken");
    expect(doses[0].log?.takenAt).toBe(now.toISOString());
    expect(summarize(doses)).toEqual({ taken: 1, total: 2 });
    expect(nextDose(meds[0], await db.doseLogs.toArray(), now)).toBe("2026-10-25T20:00");
  });

  it("adiar 15 minutos esconde a toma e depois volta a avisar", async () => {
    const db = testDb();
    const meds = [med("a", { times: ["08:00"] })];
    const now = new Date(2026, 9, 25, 8, 10);
    const log = await snoozeDose("a", "2026-10-25T08:00", now, db);
    expect(log.snoozedUntil).toBe("2026-10-25T08:25");
    const logs = await db.doseLogs.toArray();
    expect(generateDoses(meds, logs, SUNDAY, new Date(2026, 9, 25, 8, 20))[0].view).toBe("snoozed");
    expect(generateDoses(meds, logs, SUNDAY, new Date(2026, 9, 25, 8, 26))[0].view).toBe("due");
  });
});
