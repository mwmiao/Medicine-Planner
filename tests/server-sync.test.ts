import { spawn, type ChildProcess } from "node:child_process";
import { mkdtempSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { markTaken, undoDose } from "@/lib/doses";
import { createMedication, deleteMedication } from "@/lib/medications";
import { SyncEngine, syncAvailable, type KeyValue } from "@/lib/sync/engine";
import { input, testDb } from "./helpers";

const CODE = "test-sync-code-1234";
let proc: ChildProcess;
let base = "";
let dataDir = "";
let staticDir = "";

function memoryKv(): KeyValue {
  const m = new Map<string, string>();
  return { get: (k) => m.get(k) ?? null, set: (k, v) => void m.set(k, v), remove: (k) => void m.delete(k) };
}

async function startServer(env: Record<string, string>): Promise<{ proc: ChildProcess; base: string }> {
  const port = 20000 + Math.floor(Math.random() * 20000);
  const p = spawn(process.execPath, ["server/server.mjs"], {
    env: { ...process.env, PORT: String(port), DATA_DIR: dataDir, STATIC_DIR: staticDir, ...env },
    stdio: ["ignore", "pipe", "pipe"],
  });
  await new Promise<void>((resolve, reject) => {
    p.stdout?.on("data", (d: Buffer) => d.toString().includes("Medicine Planner on") && resolve());
    p.on("exit", (c) => reject(new Error(`server exited ${c}`)));
  });
  return { proc: p, base: `http://127.0.0.1:${port}` };
}

beforeAll(async () => {
  dataDir = mkdtempSync(join(tmpdir(), "mp-data-"));
  staticDir = mkdtempSync(join(tmpdir(), "mp-static-"));
  writeFileSync(join(staticDir, "index.html"), "<html>home</html>");
  writeFileSync(join(staticDir, "404.html"), "<html>not found</html>");
  mkdirSync(join(staticDir, "medications"));
  writeFileSync(join(staticDir, "medications", "index.html"), "<html>meds</html>");
  mkdirSync(join(staticDir, "_next", "static"), { recursive: true });
  writeFileSync(join(staticDir, "_next", "static", "app.js"), "console.log(1)");
  writeFileSync(join(staticDir, "manifest.webmanifest"), "{}");
  ({ proc, base } = await startServer({ SYNC_CODE: CODE }));
});

afterAll(() => {
  proc?.kill();
  rmSync(dataDir, { recursive: true, force: true });
  rmSync(staticDir, { recursive: true, force: true });
});

const auth = { Authorization: `Bearer ${CODE}` };

describe("servidor do NAS: ficheiros da app", () => {
  it("serve páginas, redireciona sem barra final, e dá 404 a sério", async () => {
    expect((await fetch(`${base}/`)).status).toBe(200);
    expect(await (await fetch(`${base}/medications/?id=x`)).text()).toContain("meds");
    const r = await fetch(`${base}/medications?id=1`, { redirect: "manual" });
    expect(r.status).toBe(301);
    expect(r.headers.get("location")).toBe("/medications/?id=1");
    const nf = await fetch(`${base}/nope/`);
    expect(nf.status).toBe(404);
    expect(await nf.text()).toContain("not found");
    expect((await fetch(`${base}/..%2f..%2fetc/passwd`)).status).not.toBe(200);
  });

  it("cabeçalhos de cache e tipo do manifesto", async () => {
    expect((await fetch(`${base}/_next/static/app.js`)).headers.get("cache-control")).toContain("immutable");
    const man = await fetch(`${base}/manifest.webmanifest`);
    expect(man.headers.get("content-type")).toContain("application/manifest+json");
    expect(man.headers.get("cache-control")).toBe("no-cache");
  });
});

describe("servidor do NAS: API de sincronização", () => {
  it("exige o código e controla conflitos", async () => {
    expect(await (await fetch(`${base}/api/health`)).json()).toEqual({ ok: true, sync: true });
    expect((await fetch(`${base}/api/data`)).status).toBe(401);
    expect((await fetch(`${base}/api/data`, { headers: { Authorization: "Bearer errado" } })).status).toBe(401);

    const first = await (await fetch(`${base}/api/data`, { headers: auth })).json();
    const put = (body: unknown) => fetch(`${base}/api/data`, { method: "PUT", headers: { ...auth, "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const ok = await put({ baseRevision: first.revision, data: { medications: [], doseLogs: [] } });
    expect(ok.status).toBe(200);
    const stale = await put({ baseRevision: first.revision, data: { medications: [], doseLogs: [] } });
    expect(stale.status).toBe(409);
    expect((await put({ baseRevision: 0 })).status).toBe(400);
    expect(readdirSync(join(dataDir, "history")).length).toBeGreaterThan(0);
  });

  it("sem SYNC_CODE a sincronização fica desligada", async () => {
    const off = await startServer({ SYNC_CODE: "" });
    try {
      expect(await (await fetch(`${off.base}/api/health`)).json()).toEqual({ ok: true, sync: false });
      expect((await fetch(`${off.base}/api/data`, { headers: auth })).status).toBe(503);
      expect(await syncAvailable(off.base)).toBe(false);
    } finally {
      off.proc.kill();
    }
  });
});

describe("sincronização entre Safari e a app do ecrã principal", () => {
  it("junta os dados, propaga tomas, desfazer e apagar", async () => {
    // Começa com o servidor vazio.
    await fetch(`${base}/api/data`, { method: "PUT", headers: { ...auth, "Content-Type": "application/json" }, body: JSON.stringify({ force: true, data: { medications: [], doseLogs: [] } }) });
    expect(await syncAvailable(base)).toBe(true);

    const safariDb = testDb();
    const appDb = testDb();
    const safari = new SyncEngine(safariDb, memoryKv(), base);
    const app = new SyncEngine(appDb, memoryKv(), base);
    safari.installHooks();
    app.installHooks();

    // A mãe adicionou comprimidos no Safari antes de criar o atalho; o atalho tem outro.
    const a = await createMedication(input({ name: "Ben-u-ron" }), new Date(), safariDb);
    const b = await createMedication(input({ name: "Aspirina" }), new Date(), appDb);

    expect(await app.connect("errado")).toBe("unauthorized");
    expect(app.connected).toBe(false);
    expect(await safari.connect(CODE)).toBe("idle");
    expect(await app.connect(CODE)).toBe("idle");
    await safari.syncNow();
    const names = async (d: typeof appDb) => (await d.medications.toArray()).map((m) => m.name).sort();
    expect(await names(appDb)).toEqual(["Aspirina", "Ben-u-ron"]);
    expect(await names(safariDb)).toEqual(["Aspirina", "Ben-u-ron"]);

    // Toma registada na app aparece no Safari.
    await markTaken(a.id, "2026-10-25T08:00", new Date(), appDb);
    await app.syncNow();
    await safari.syncNow();
    expect((await safariDb.doseLogs.toArray()).map((l) => l.status)).toEqual(["taken"]);

    // Desfazer no Safari também desfaz na app.
    await undoDose(a.id, "2026-10-25T08:00", safariDb);
    await safari.syncNow();
    await app.syncNow();
    expect(await appDb.doseLogs.count()).toBe(0);

    // Apagar um medicamento na app não volta a aparecer.
    await deleteMedication(b.id, appDb);
    await app.syncNow();
    await safari.syncNow();
    expect(await names(safariDb)).toEqual(["Ben-u-ron"]);
    await app.syncNow();
    expect(await names(appDb)).toEqual(["Ben-u-ron"]);

    // Os dados sobrevivem a um reinício do servidor (ficam no volume).
    proc.kill();
    ({ proc, base } = await startServer({ SYNC_CODE: CODE }));
    const fresh = testDb();
    const phone = new SyncEngine(fresh, memoryKv(), base);
    expect(await phone.connect(CODE)).toBe("idle");
    expect(await names(fresh)).toEqual(["Ben-u-ron"]);
  }, 20_000);
});
