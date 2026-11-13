import { describe, expect, it } from "vitest";
import { deleteAllData } from "@/lib/backup";
import type { KeyValue } from "@/lib/kv";
import { createMedication } from "@/lib/medications";
import { SyncEngine } from "@/lib/sync/engine";
import { emptyTombstones, type SyncData } from "@/lib/sync/merge";
import { input, testDb } from "./helpers";

const CODE = "fake-code";

function memoryKv(): KeyValue {
  const m = new Map<string, string>();
  return { get: (k) => m.get(k) ?? null, set: (k, v) => void m.set(k, v), remove: (k) => void m.delete(k) };
}

/** NAS falso em memória: mesma API de /api/data (revisão + 409 em conflito). */
export function fakeNas(initial: SyncData | null = null) {
  const store = { revision: initial ? 1 : 0, updatedAt: null as string | null, data: initial as SyncData | null };
  const json = (status: number, body: unknown) => Promise.resolve(Response.json(body, { status }));
  const fetchFn = (async (url: string | URL | Request, init?: RequestInit) => {
    const headers = init?.headers as Record<string, string>;
    if (headers.Authorization !== `Bearer ${CODE}`) return Response.json({ error: "bad_code" }, { status: 401 });
    if (init?.method === "GET") return json(200, store);
    const body = JSON.parse(String(init?.body)) as { baseRevision: number; force: boolean; data: SyncData };
    if (!body.force && body.baseRevision !== store.revision) return json(409, { error: "conflict", ...store });
    store.revision++;
    store.data = body.data;
    return json(200, { revision: store.revision, updatedAt: null });
  }) as typeof fetch;
  return { store, fetchFn };
}

describe("primeira ligação ao NAS", () => {
  it("apagar tudo antes de ligar não apaga o NAS (junta em vez de substituir)", async () => {
    // O NAS já tem um medicamento (de outro telemóvel).
    const seedDb = testDb();
    const seed = await createMedication(input({ name: "Ben-u-ron" }), new Date(), seedDb);
    const nasData: SyncData = {
      schema: 1,
      medications: [seed],
      doseLogs: [],
      infarmedCache: [],
      tombstones: emptyTombstones(),
    };
    const nas = fakeNas(nasData);

    // Este telemóvel apaga tudo ANTES de se ligar ao NAS.
    const db = testDb();
    const engine = new SyncEngine(db, memoryKv(), { fetchFn: nas.fetchFn });
    engine.installHooks();
    await deleteAllData(db);
    engine.markReplaceAll();

    expect(await engine.connect(CODE)).toBe("idle");
    expect(nas.store.data?.medications.map((m) => m.name)).toEqual(["Ben-u-ron"]);
    expect((await db.medications.toArray()).map((m) => m.name)).toEqual(["Ben-u-ron"]);
  });

  it("apagar tudo já ligado continua a substituir o NAS", async () => {
    const seedDb = testDb();
    const seed = await createMedication(input({ name: "Ben-u-ron" }), new Date(), seedDb);
    const nas = fakeNas({ schema: 1, medications: [seed], doseLogs: [], infarmedCache: [], tombstones: emptyTombstones() });
    const db = testDb();
    const engine = new SyncEngine(db, memoryKv(), { fetchFn: nas.fetchFn });
    engine.installHooks();
    expect(await engine.connect(CODE)).toBe("idle");
    expect(await db.medications.count()).toBe(1);

    await deleteAllData(db);
    engine.markReplaceAll();
    await engine.syncNow();
    expect(nas.store.data?.medications).toEqual([]);
  });
});
