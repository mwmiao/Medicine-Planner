// Lembretes por Web Push (iPhone: só para a app adicionada ao ecrã principal, iOS 16.4+).
//
// O telemóvel envia ao NAS a sua subscrição de push e a lista de lembretes
// ("trabalhos") dos próximos dias, já com o texto no idioma escolhido. A cada
// minuto o servidor procura os lembretes que chegam à hora e envia-os. Não
// depende de temporizadores no telemóvel.

import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import webpush from "web-push";

/** Lembretes atrasados mais do que isto (ex.: NAS desligado) já não são enviados. */
const LATE_LIMIT_MS = 30 * 60 * 1000;
/** Lembretes antigos são apagados depois disto. */
const KEEP_MS = 2 * 24 * 60 * 60 * 1000;
const MAX_JOBS = 5000;

/**
 * @typedef {{ endpoint: string, keys: { p256dh: string, auth: string } }} Subscription
 * @typedef {Subscription & { locale: string, timezone: string, createdAt: string, lastSuccessAt?: string }} StoredSubscription
 * @typedef {{ id: string, at: string, title: string, body: string, url: string, medicationId?: string, scheduledFor?: string, sentAt?: string, skipped?: boolean }} Job
 * @typedef {{ vapid: { publicKey: string, privateKey: string }, subscriptions: StoredSubscription[], jobs: Job[], schedule: unknown, locale: string, timezone: string, updatedAt?: string }} PushState
 */

const TEST_TEXT = {
  pt: { title: "💊 Lembrete de teste", body: "Os lembretes estão a funcionar." },
  zh: { title: "💊 测试提醒", body: "提醒功能正常。" },
};

function isSubscription(v) {
  return (
    v &&
    typeof v === "object" &&
    typeof v.endpoint === "string" &&
    /^https?:\/\//.test(v.endpoint) &&
    v.keys &&
    typeof v.keys.p256dh === "string" &&
    typeof v.keys.auth === "string"
  );
}

function isJob(v) {
  return (
    v &&
    typeof v === "object" &&
    typeof v.id === "string" &&
    typeof v.at === "string" &&
    !Number.isNaN(Date.parse(v.at)) &&
    typeof v.title === "string" &&
    typeof v.body === "string" &&
    (v.url === undefined || (typeof v.url === "string" && v.url.startsWith("/")))
  );
}

/**
 * Cifra a mensagem com web-push (RFC 8291 + VAPID) e envia-a com fetch.
 * Lança um erro com `statusCode` quando o serviço de push recusa.
 */
export async function sendWithFetch(sub, payload, options) {
  const details = webpush.generateRequestDetails(sub, payload, options);
  const headers = { ...details.headers };
  delete headers["Content-Length"];
  const res = await fetch(details.endpoint, { method: details.method, headers, body: details.body });
  if (!res.ok) throw Object.assign(new Error(`push service answered ${res.status}`), { statusCode: res.status });
  return { statusCode: res.status };
}

export class PushService {
  /**
   * @param {{ dataDir: string, subject: string, publicKey?: string, privateKey?: string,
   *           readDoseLogs: () => Promise<{ id: string, status: string }[]>,
   *           send?: (sub: Subscription, payload: string, options: object) => Promise<unknown> }} opts
   */
  constructor(opts) {
    this.file = join(opts.dataDir, "push.json");
    this.dataDir = opts.dataDir;
    this.subject = opts.subject;
    this.envKeys = opts.publicKey && opts.privateKey ? { publicKey: opts.publicKey, privateKey: opts.privateKey } : null;
    this.readDoseLogs = opts.readDoseLogs;
    this.sendFn = opts.send ?? sendWithFetch;
    /** @type {PushState | null} */
    this.state = null;
    this.queue = Promise.resolve();
    this.ticking = false;
  }

  /** Executa alterações ao estado uma de cada vez e grava no fim. */
  update(fn) {
    const run = this.queue.then(async () => {
      const state = await this.load();
      const result = await fn(state);
      await this.save(state);
      return result;
    });
    this.queue = run.catch(() => undefined);
    return run;
  }

  /** @returns {Promise<PushState>} */
  async load() {
    if (this.state) return this.state;
    let state;
    try {
      state = JSON.parse(await readFile(this.file, "utf8"));
    } catch (e) {
      if (!e || e.code !== "ENOENT") throw e;
      state = { subscriptions: [], jobs: [], schedule: null, locale: "pt", timezone: "Europe/Lisbon" };
    }
    // Chaves VAPID: das variáveis de ambiente, ou geradas uma vez e guardadas no volume.
    if (this.envKeys) state.vapid = this.envKeys;
    else if (!state.vapid) state.vapid = webpush.generateVAPIDKeys();
    this.state = state;
    await this.save(state);
    return state;
  }

  async save(state) {
    await mkdir(this.dataDir, { recursive: true });
    const tmp = `${this.file}.tmp`;
    await writeFile(tmp, JSON.stringify(state));
    await rename(tmp, this.file);
  }

  async publicKey() {
    return (await this.load()).vapid.publicKey;
  }

  async subscribe(body) {
    if (!isSubscription(body?.subscription)) return { status: 400, body: { error: "bad_subscription" } };
    const { endpoint, keys } = body.subscription;
    return this.update((state) => {
      state.subscriptions = state.subscriptions.filter((s) => s.endpoint !== endpoint);
      state.subscriptions.push({
        endpoint,
        keys: { p256dh: keys.p256dh, auth: keys.auth },
        locale: body.locale === "zh" ? "zh" : "pt",
        timezone: typeof body.timezone === "string" ? body.timezone.slice(0, 64) : "Europe/Lisbon",
        createdAt: new Date().toISOString(),
      });
      return { status: 200, body: { ok: true, subscriptions: state.subscriptions.length } };
    });
  }

  async unsubscribe(body) {
    const endpoint = typeof body?.endpoint === "string" ? body.endpoint : "";
    return this.update((state) => {
      state.subscriptions = state.subscriptions.filter((s) => s.endpoint !== endpoint);
      return { status: 200, body: { ok: true } };
    });
  }

  /** Substitui a lista de lembretes (mantendo a marca de "já enviado"). */
  async setJobs(body) {
    if (!Array.isArray(body?.jobs) || !body.jobs.every(isJob)) return { status: 400, body: { error: "bad_jobs" } };
    if (body.jobs.length > MAX_JOBS) return { status: 413, body: { error: "too_many_jobs" } };
    return this.update((state) => {
      const sent = new Map(state.jobs.filter((j) => j.sentAt).map((j) => [j.id, j]));
      const cutoff = Date.now() - KEEP_MS;
      const incoming = body.jobs.map((j) => ({
        id: j.id,
        at: new Date(j.at).toISOString(),
        title: j.title.slice(0, 200),
        body: j.body.slice(0, 500),
        url: j.url ?? "/",
        medicationId: typeof j.medicationId === "string" ? j.medicationId : undefined,
        scheduledFor: typeof j.scheduledFor === "string" ? j.scheduledFor : undefined,
        sentAt: sent.get(j.id)?.sentAt,
        skipped: sent.get(j.id)?.skipped,
      }));
      const ids = new Set(incoming.map((j) => j.id));
      // Os já enviados recentemente ficam guardados, para não voltarem a ser enviados.
      const keepSent = [...sent.values()].filter((j) => !ids.has(j.id) && Date.parse(j.at) > cutoff);
      state.jobs = [...incoming, ...keepSent];
      state.schedule = body.schedule ?? state.schedule;
      state.locale = body.locale === "zh" ? "zh" : "pt";
      if (typeof body.timezone === "string") state.timezone = body.timezone.slice(0, 64);
      state.updatedAt = new Date().toISOString();
      return { status: 200, body: { ok: true, jobs: incoming.length } };
    });
  }

  async status() {
    const state = await this.load();
    const now = Date.now();
    const next = state.jobs
      .filter((j) => !j.sentAt && Date.parse(j.at) >= now)
      .sort((a, b) => Date.parse(a.at) - Date.parse(b.at))[0];
    return { subscriptions: state.subscriptions.length, pendingJobs: state.jobs.filter((j) => !j.sentAt).length, nextAt: next?.at ?? null };
  }

  /** Envia a todas as subscrições; remove as que expiraram ou foram recusadas. */
  async deliver(state, payload) {
    const vapidDetails = { subject: this.subject, publicKey: state.vapid.publicKey, privateKey: state.vapid.privateKey };
    let sent = 0;
    const dead = new Set();
    for (const sub of state.subscriptions) {
      try {
        await this.sendFn({ endpoint: sub.endpoint, keys: sub.keys }, JSON.stringify(payload), {
          TTL: 60 * 60,
          urgency: "high",
          vapidDetails,
          topic: payload.tag ? String(payload.tag).replace(/[^A-Za-z0-9_-]/g, "").slice(0, 32) : undefined,
        });
        sub.lastSuccessAt = new Date().toISOString();
        sent++;
      } catch (e) {
        const code = e && typeof e === "object" && "statusCode" in e ? e.statusCode : 0;
        // 404/410: subscrição expirada ou cancelada. 400/403 com o endpoint: inválida.
        if (code === 404 || code === 410 || code === 400 || code === 403) dead.add(sub.endpoint);
        else console.error("push failed", code, e instanceof Error ? e.message : e);
      }
    }
    state.subscriptions = state.subscriptions.filter((s) => !dead.has(s.endpoint));
    return { sent, removed: dead.size };
  }

  async sendTest(body) {
    return this.update(async (state) => {
      if (!state.subscriptions.length) return { status: 409, body: { error: "no_subscription" } };
      const locale = body?.locale === "zh" ? "zh" : "pt";
      const title = typeof body?.title === "string" ? body.title.slice(0, 200) : TEST_TEXT[locale].title;
      const text = typeof body?.body === "string" ? body.body.slice(0, 500) : TEST_TEXT[locale].body;
      const result = await this.deliver(state, { title, body: text, url: "/", tag: "test" });
      return { status: 200, body: result };
    });
  }

  /** Corre a cada minuto: envia os lembretes que chegam à hora (até 1 minuto à frente). */
  async tick(now = Date.now()) {
    if (this.ticking) return { sent: 0, skipped: 0, due: 0 };
    this.ticking = true;
    try {
      const taken = new Set(
        (await this.readDoseLogs().catch(() => []))
          .filter((l) => l.status === "taken" || l.status === "skipped")
          .map((l) => l.id),
      );
      return await this.update(async (state) => {
        const due = state.jobs.filter((j) => !j.sentAt && Date.parse(j.at) <= now + 60_000 && Date.parse(j.at) >= now - LATE_LIMIT_MS);
        let sent = 0;
        let skipped = 0;
        for (const job of due) {
          job.sentAt = new Date(now).toISOString();
          // Já marcado como tomado (sincronizado): não incomoda.
          if (job.medicationId && job.scheduledFor && taken.has(`${job.medicationId}|${job.scheduledFor}`)) {
            job.skipped = true;
            skipped++;
            continue;
          }
          if (!state.subscriptions.length) continue;
          const r = await this.deliver(state, { title: job.title, body: job.body, url: job.url, tag: job.id });
          sent += r.sent;
          // Falha temporária (rede, serviço de push): tenta outra vez no próximo minuto.
          if (r.sent === 0 && state.subscriptions.length) job.sentAt = undefined;
        }
        state.jobs = state.jobs.filter((j) => Date.parse(j.at) > now - KEEP_MS);
        return { sent, skipped, due: due.length };
      });
    } finally {
      this.ticking = false;
    }
  }
}
