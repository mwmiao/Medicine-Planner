import { describe, expect, it } from "vitest";
import { markTaken, skipDose, snoozeDose } from "@/lib/doses";
import { generateDoses, nextDose, overdueDoseToday, splitDoses, summarize } from "@/lib/schedule";
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

describe("overdueDoseToday", () => {
  const m = med("a", { times: ["08:00"] });

  it("não indica nada dentro da janela de 30 minutos", () => {
    expect(overdueDoseToday(m, [], new Date(2026, 9, 25, 8, 20))).toBeUndefined();
  });

  it("indica a toma de hoje já passada da janela", () => {
    expect(overdueDoseToday(m, [], new Date(2026, 9, 25, 9, 0))).toBe("2026-10-25T08:00");
  });

  it("ignora a toma já tomada", async () => {
    const db = testDb();
    const now = new Date(2026, 9, 25, 9, 0);
    await markTaken("a", "2026-10-25T08:00", now, db);
    expect(overdueDoseToday(m, await db.doseLogs.toArray(), now)).toBeUndefined();
  });

  it("ignora medicamentos não agendados para hoje", () => {
    const other = med("b", { times: ["08:00"], frequency: { type: "specificDays", days: [1, 2] } });
    expect(overdueDoseToday(other, [], new Date(2026, 9, 25, 9, 0))).toBeUndefined();
  });

  it("indica a primeira toma por registar quando há várias", async () => {
    const db = testDb();
    const two = med("c", { times: ["08:00", "20:00"] });
    const now = new Date(2026, 9, 25, 21, 0);
    await markTaken("c", "2026-10-25T08:00", now, db);
    expect(overdueDoseToday(two, await db.doseLogs.toArray(), now)).toBe("2026-10-25T20:00");
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

describe("separar tomas por fazer e concluídas", () => {
  it("põe as tomas por fazer primeiro (por hora) e as concluídas à parte", async () => {
    const db = testDb();
    const meds = [med("a", { name: "A", times: ["08:00", "12:00", "20:00"] })];
    const now = new Date(2026, 9, 25, 12, 5);
    await markTaken("a", "2026-10-25T08:00", now, db);
    const doses = generateDoses(meds, await db.doseLogs.toArray(), SUNDAY, now);
    const { open, done } = splitDoses(doses);
    expect(open.map((d) => d.time)).toEqual(["12:00", "20:00"]);
    expect(done.map((d) => d.time)).toEqual(["08:00"]);
  });

  it("trata 'não tomada' como concluída e não perde nenhuma toma", () => {
    const meds = [med("a", { times: ["08:00", "20:00"] })];
    const doses = generateDoses(meds, [], SUNDAY, SUNDAY);
    const skipped = [{ ...doses[0], view: "skipped" as const }, doses[1]];
    const { open, done } = splitDoses(skipped);
    expect(done).toHaveLength(1);
    expect(open).toHaveLength(1);
  });
});

describe("medicamento acabado de adicionar", () => {
  const now = new Date(2026, 9, 25, 14, 5);
  const m = med("n", { times: ["08:00", "20:00"], createdAt: new Date(2026, 9, 25, 14, 0).toISOString() });

  it("não gera tomas que já tinham passado quando foi adicionado", () => {
    expect(generateDoses([m], [], now, now).map((d) => d.time)).toEqual(["20:00"]);
  });

  it("não marca essas tomas como em atraso", () => {
    expect(overdueDoseToday(m, [], now)).toBeUndefined();
  });

  it("mantém a toma dentro da janela da criação", () => {
    const w = med("w", { times: ["08:00"], createdAt: new Date(2026, 9, 25, 8, 10).toISOString() });
    const n = new Date(2026, 9, 25, 8, 12);
    const doses = generateDoses([w], [], n, n);
    expect(doses).toHaveLength(1);
    expect(doses[0].view).toBe("due");
  });

  it("mostra a toma anterior se já existe registo", async () => {
    const db = testDb();
    await markTaken("n", "2026-10-25T08:00", now, db);
    const doses = generateDoses([m], await db.doseLogs.toArray(), now, now);
    expect(doses.find((d) => d.time === "08:00")?.view).toBe("taken");
  });

  it("no dia seguinte gera todas as tomas", () => {
    const next = new Date(2026, 9, 26, 7, 0);
    expect(generateDoses([m], [], next, next).map((d) => d.time)).toEqual(["08:00", "20:00"]);
  });
});

describe("não vou tomar", () => {
  it("skipDose grava o registo sem hora de toma", async () => {
    const db = testDb();
    const now = new Date(2026, 9, 25, 8, 5);
    await skipDose("a", "2026-10-25T08:00", now, db);
    const logs = await db.doseLogs.toArray();
    expect(logs).toHaveLength(1);
    expect(logs[0]).toEqual({
      id: "a|2026-10-25T08:00",
      medicationId: "a",
      scheduledFor: "2026-10-25T08:00",
      status: "skipped",
      updatedAt: now.toISOString(),
    });
    expect(logs[0].takenAt).toBeUndefined();
  });

  it("a toma fica como 'skipped' e vai para as concluídas", async () => {
    const db = testDb();
    const meds = [med("a", { times: ["08:00", "20:00"] })];
    const now = new Date(2026, 9, 25, 8, 5);
    await skipDose("a", "2026-10-25T08:00", now, db);
    const doses = generateDoses(meds, await db.doseLogs.toArray(), SUNDAY, now);
    expect(doses[0].view).toBe("skipped");
    const { open, done } = splitDoses(doses);
    expect(done.map((d) => d.time)).toEqual(["08:00"]);
    expect(open.map((d) => d.time)).toEqual(["20:00"]);
  });

  it("summarize ignora as tomas não tomadas", async () => {
    const db = testDb();
    const meds = [med("a", { times: ["08:00", "12:00", "20:00"] })];
    const now = new Date(2026, 9, 25, 12, 5);
    await markTaken("a", "2026-10-25T08:00", now, db);
    await skipDose("a", "2026-10-25T12:00", now, db);
    const doses = generateDoses(meds, await db.doseLogs.toArray(), SUNDAY, now);
    expect(summarize(doses)).toEqual({ taken: 1, total: 2 });
  });

  it("overdueDoseToday ignora uma toma passada marcada como não tomada", async () => {
    const db = testDb();
    const now = new Date(2026, 9, 25, 9, 0);
    await skipDose("a", "2026-10-25T08:00", now, db);
    expect(overdueDoseToday(med("a", { times: ["08:00"] }), await db.doseLogs.toArray(), now)).toBeUndefined();
  });
});
