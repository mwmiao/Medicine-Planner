import { createECDH, randomBytes } from "node:crypto";
import { createServer, type Server } from "node:http";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { PushService, type Subscription } from "../server/push.mjs";

const dirs: string[] = [];
afterAll(() => dirs.forEach((d) => rmSync(d, { recursive: true, force: true })));

function tempDir() {
  const d = mkdtempSync(join(tmpdir(), "mp-push-"));
  dirs.push(d);
  return d;
}

/** Chaves de um "browser" falso: o servidor precisa delas para cifrar a mensagem. */
function fakeSubscription(endpoint: string): Subscription {
  const ecdh = createECDH("prime256v1");
  ecdh.generateKeys();
  return { endpoint, keys: { p256dh: ecdh.getPublicKey().toString("base64url"), auth: randomBytes(16).toString("base64url") } };
}

type Sent = { endpoint: string; payload: { title: string; body: string; url: string } };

function service(logs: { id: string; status: string }[] = [], failWith?: number) {
  const sent: Sent[] = [];
  const svc = new PushService({
    dataDir: tempDir(),
    subject: "mailto:test@example.com",
    readDoseLogs: async () => logs,
    send: async (sub, payload) => {
      if (failWith) throw Object.assign(new Error("push error"), { statusCode: failWith });
      sent.push({ endpoint: sub.endpoint, payload: JSON.parse(payload) });
      return { statusCode: 201 };
    },
  });
  return { svc, sent };
}

const T = Date.parse("2026-10-26T07:00:00Z");
const job = (id: string, at: number, extra: Record<string, string> = {}) => ({
  id,
  at: new Date(at).toISOString(),
  title: "💊 Ben-u-ron",
  body: "1 comprimido · 500 mg — 08:00",
  url: "/?from=reminder",
  ...extra,
});

describe("lembretes Web Push no NAS", () => {
  it("gera e guarda chaves VAPID, e aceita subscrições válidas", async () => {
    const { svc } = service();
    const key = await svc.publicKey();
    expect(key).toMatch(/^[A-Za-z0-9_-]{80,}$/);
    expect(await svc.publicKey()).toBe(key);
    expect((await svc.subscribe({ subscription: { endpoint: "nope" } })).status).toBe(400);
    expect((await svc.subscribe({ subscription: fakeSubscription("https://push.example/a"), locale: "zh", timezone: "Europe/Lisbon" })).status).toBe(200);
    expect((await svc.status()).subscriptions).toBe(1);
  });

  it("envia só os lembretes que chegam à hora, uma única vez", async () => {
    const { svc, sent } = service();
    await svc.subscribe({ subscription: fakeSubscription("https://push.example/a") });
    await svc.setJobs({ locale: "pt", timezone: "Europe/Lisbon", jobs: [job("now", T + 30_000), job("later", T + 3_600_000), job("stale", T - 3_600_000)] });
    expect(await svc.tick(T)).toEqual({ sent: 1, skipped: 0, due: 1 });
    expect(sent.map((s) => s.payload.title)).toEqual(["💊 Ben-u-ron"]);
    expect(sent[0].payload.url).toBe("/?from=reminder");
    expect((await svc.tick(T + 30_000)).sent).toBe(0);
    // Reenviar a lista (a app abriu outra vez) não volta a enviar o que já foi.
    await svc.setJobs({ jobs: [job("now", T + 30_000), job("later", T + 3_600_000)] });
    expect((await svc.tick(T + 40_000)).sent).toBe(0);
    expect((await svc.tick(T + 3_600_000)).sent).toBe(1);
  });

  it("não envia lembrete de uma toma já marcada como tomada (dados sincronizados)", async () => {
    const { svc, sent } = service([{ id: "med1|2026-10-26T08:00", status: "taken" }]);
    await svc.subscribe({ subscription: fakeSubscription("https://push.example/a") });
    await svc.setJobs({ jobs: [job("j1", T, { medicationId: "med1", scheduledFor: "2026-10-26T08:00" })] });
    expect(await svc.tick(T)).toEqual({ sent: 0, skipped: 1, due: 1 });
    expect(sent).toEqual([]);
  });

  it("remove subscrições expiradas ou recusadas", async () => {
    const { svc } = service([], 410);
    await svc.subscribe({ subscription: fakeSubscription("https://push.example/gone") });
    const r = await svc.sendTest({ locale: "pt" });
    expect(r.body).toEqual({ sent: 0, removed: 1 });
    expect((await svc.status()).subscriptions).toBe(0);
    expect((await svc.sendTest({})).status).toBe(409);
  });

  it("recusa listas de lembretes inválidas", async () => {
    const { svc } = service();
    expect((await svc.setJobs({ jobs: [{ id: "x" }] })).status).toBe(400);
    expect((await svc.setJobs({ jobs: [job("x", T, { url: "https://evil.example" })] })).status).toBe(400);
  });

  it("cifra e envia mesmo a um serviço de push (web-push real, contra um servidor local)", async () => {
    const hits: { status: number; encoding?: string; auth?: string; length: number }[] = [];
    let reply = 201;
    const receiver: Server = createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on("data", (c: Buffer) => chunks.push(c));
      req.on("end", () => {
        hits.push({ status: reply, encoding: req.headers["content-encoding"], auth: req.headers.authorization, length: Buffer.concat(chunks).length });
        res.writeHead(reply).end();
      });
    });
    await new Promise<void>((r) => receiver.listen(0, "127.0.0.1", r));
    const port = (receiver.address() as { port: number }).port;
    try {
      const svc = new PushService({ dataDir: tempDir(), subject: "mailto:test@example.com", readDoseLogs: async () => [] });
      await svc.subscribe({ subscription: fakeSubscription(`http://127.0.0.1:${port}/push/abc`) });
      expect((await svc.sendTest({ locale: "zh" })).body).toEqual({ sent: 1, removed: 0 });
      expect(hits[0].encoding).toBe("aes128gcm");
      expect(hits[0].auth).toMatch(/^vapid t=.+, k=.+/);
      expect(hits[0].length).toBeGreaterThan(100);
      reply = 410;
      expect((await svc.sendTest({})).body).toEqual({ sent: 0, removed: 1 });
    } finally {
      receiver.close();
    }
  });
});
