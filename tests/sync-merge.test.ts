import { describe, expect, it } from "vitest";
import { emptyTombstones, mergeSyncData, type SyncData } from "@/lib/sync/merge";
import type { DoseLog, Medication } from "@/lib/types";
import { input } from "./helpers";

const NOW = new Date("2026-10-25T12:00:00Z");

function med(id: string, updatedAt: string, name = id): Medication {
  return { ...input({ name }), id, createdAt: "2026-10-01T00:00:00Z", updatedAt };
}

function log(medicationId: string, status: DoseLog["status"], updatedAt: string, at = "2026-10-25T08:00"): DoseLog {
  return { id: `${medicationId}|${at}`, medicationId, scheduledFor: at, status, updatedAt, takenAt: status === "taken" ? updatedAt : undefined };
}

function data(partial: Partial<SyncData>): SyncData {
  return { schema: 1, medications: [], doseLogs: [], infarmedCache: [], tombstones: emptyTombstones(), ...partial };
}

describe("juntar cópias (telemóvel + NAS)", () => {
  it("junta medicamentos dos dois lados (Safari + app do ecrã principal)", () => {
    const merged = mergeSyncData(data({ medications: [med("a", "2026-10-20T00:00:00Z")] }), data({ medications: [med("b", "2026-10-21T00:00:00Z")] }), NOW);
    expect(merged.medications.map((m) => m.id).sort()).toEqual(["a", "b"]);
  });

  it("no mesmo medicamento ganha a alteração mais recente", () => {
    const merged = mergeSyncData(
      data({ medications: [med("a", "2026-10-20T00:00:00Z", "Antigo")] }),
      data({ medications: [med("a", "2026-10-22T00:00:00Z", "Novo")] }),
      NOW,
    );
    expect(merged.medications[0].name).toBe("Novo");
  });

  it("um medicamento apagado não volta, nem as suas tomas", () => {
    const local = data({ tombstones: { medications: { a: "2026-10-23T00:00:00Z" }, doseLogs: {} } });
    const remote = data({ medications: [med("a", "2026-10-20T00:00:00Z")], doseLogs: [log("a", "taken", "2026-10-21T08:00:00Z")] });
    const merged = mergeSyncData(local, remote, NOW);
    expect(merged.medications).toEqual([]);
    expect(merged.doseLogs).toEqual([]);
    expect(merged.tombstones.medications.a).toBe("2026-10-23T00:00:00Z");
  });

  it("um medicamento editado depois de apagado noutro lado é mantido", () => {
    const local = data({ tombstones: { medications: { a: "2026-10-20T00:00:00Z" }, doseLogs: {} } });
    const remote = data({ medications: [med("a", "2026-10-22T00:00:00Z")] });
    expect(mergeSyncData(local, remote, NOW).medications).toHaveLength(1);
  });

  it("uma toma 'tomada' nunca é substituída por 'adiada' (evita dose a dobrar)", () => {
    const m = med("a", "2026-10-20T00:00:00Z");
    const taken = log("a", "taken", "2026-10-25T08:05:00Z");
    const snoozedLater = log("a", "snoozed", "2026-10-25T08:10:00Z");
    const merged1 = mergeSyncData(data({ medications: [m], doseLogs: [taken] }), data({ medications: [m], doseLogs: [snoozedLater] }), NOW);
    const merged2 = mergeSyncData(data({ medications: [m], doseLogs: [snoozedLater] }), data({ medications: [m], doseLogs: [taken] }), NOW);
    expect(merged1.doseLogs[0].status).toBe("taken");
    expect(merged2.doseLogs[0].status).toBe("taken");
  });

  it("'Desfazer' (lápide mais recente) remove a toma; marcar de novo depois volta a contar", () => {
    const m = med("a", "2026-10-20T00:00:00Z");
    const taken = log("a", "taken", "2026-10-25T08:05:00Z");
    const undone = data({ medications: [m], tombstones: { medications: {}, doseLogs: { [taken.id]: "2026-10-25T08:06:00Z" } } });
    expect(mergeSyncData(undone, data({ medications: [m], doseLogs: [taken] }), NOW).doseLogs).toEqual([]);
    const retaken = log("a", "taken", "2026-10-25T08:30:00Z");
    expect(mergeSyncData(undone, data({ medications: [m], doseLogs: [retaken] }), NOW).doseLogs).toHaveLength(1);
  });

  it("esquece lápides muito antigas", () => {
    const old = data({ tombstones: { medications: { a: "2025-01-01T00:00:00Z" }, doseLogs: {} } });
    expect(mergeSyncData(old, data({}), NOW).tombstones.medications).toEqual({});
  });
});
