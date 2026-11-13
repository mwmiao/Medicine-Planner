import { describe, expect, it } from "vitest";
import { parseSyncData } from "@/lib/sync/engine";
import { emptyTombstones, type SyncData } from "@/lib/sync/merge";
import { planSync } from "@/lib/sync/plan";
import { input } from "./helpers";

const empty: SyncData = { schema: 1, medications: [], doseLogs: [], infarmedCache: [], tombstones: emptyTombstones() };
const withMed: SyncData = {
  ...empty,
  medications: [{ ...input({ name: "A" }), id: "a", createdAt: "2026-10-01T00:00:00Z", updatedAt: "2026-10-01T00:00:00Z" }],
};
const base = { local: empty, remote: empty, force: false, pendingChanges: 0, firstTime: false };

describe("planSync", () => {
  it("força: envia a cópia do telemóvel, ignorando conflitos", () => {
    expect(planSync({ ...base, remote: withMed, force: true })).toEqual({ kind: "push", data: empty, force: true });
  });

  it("NAS vazio: envia a cópia do telemóvel", () => {
    expect(planSync({ ...base, local: withMed, remote: null })).toEqual({ kind: "push", data: withMed, force: false });
  });

  it("sem alterações locais: adota a cópia do NAS", () => {
    expect(planSync({ ...base, remote: withMed })).toEqual({ kind: "pull", data: withMed });
  });

  it("com alterações locais: junta e envia", () => {
    const plan = planSync({ ...base, local: withMed, remote: empty, pendingChanges: 1 });
    expect(plan.kind).toBe("push");
    expect(plan.kind === "push" && plan.data.medications).toHaveLength(1);
  });

  it("primeira vez com dados no telemóvel: junta em vez de substituir", () => {
    expect(planSync({ ...base, local: withMed, remote: empty, firstTime: true }).kind).toBe("push");
  });

  it("primeira vez sem dados no telemóvel: adota o NAS", () => {
    expect(planSync({ ...base, remote: withMed, firstTime: true }).kind).toBe("pull");
  });
});

describe("parseSyncData", () => {
  it("aceita uma cópia completa", () => {
    expect(parseSyncData(empty)).toEqual(empty);
  });

  it("rejeita uma cópia sem lápides (apagados poderiam voltar)", () => {
    const { tombstones: _t, ...noTombstones } = empty;
    expect(parseSyncData(noTombstones)).toBeNull();
    expect(parseSyncData({ ...empty, tombstones: { medications: {} } })).toBeNull();
  });
});
