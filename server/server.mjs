// Servidor do Planeador de Medicação para o NAS (módulos do Node + web-push).
//
// - Serve a app estática (pasta out/) com as mesmas regras que o nginx usava.
// - API de sincronização /api/data para guardar os dados num volume do NAS.
//   Sem contas: um único "código de sincronização" (variável SYNC_CODE).
//   Sem SYNC_CODE a sincronização e os lembretes ficam desligados e a app
//   funciona só no telemóvel.
// - Lembretes Web Push /api/push/* e /api/cron/tick (ver push.mjs).

import { createHash, timingSafeEqual } from "node:crypto";
import { createServer } from "node:http";
import { mkdir, readFile, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import { extname, join, normalize, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";
import { PushService } from "./push.mjs";

const PORT = Number(process.env.PORT ?? 1380);
const ROOT = resolve(process.env.STATIC_DIR ?? "out");
const DATA_DIR = resolve(process.env.DATA_DIR ?? "data");
const SYNC_CODE = process.env.SYNC_CODE ?? "";
const HISTORY_KEEP = Number(process.env.HISTORY_KEEP ?? 50);
const MAX_BODY = 5 * 1024 * 1024;
const DATA_FILE = join(DATA_DIR, "medicine-planner.json");
const HISTORY_DIR = join(DATA_DIR, "history");
const CRON_SECRET = process.env.CRON_SECRET ?? "";
const INTERNAL_CRON = process.env.INTERNAL_CRON !== "off";

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".wasm": "application/wasm",
};
const COMPRESSIBLE = new Set([".html", ".js", ".css", ".json", ".txt", ".webmanifest", ".svg"]);

// ---------- armazenamento ----------

/** @typedef {{ revision: number, updatedAt: string | null, data: unknown }} Store */

/** @returns {Promise<Store>} */
async function readStore() {
  try {
    return JSON.parse(await readFile(DATA_FILE, "utf8"));
  } catch (e) {
    if (e && e.code === "ENOENT") return { revision: 0, updatedAt: null, data: null };
    throw e;
  }
}

/** Escrita atómica (ficheiro temporário + rename) e cópia no histórico. */
async function writeStore(store) {
  await mkdir(HISTORY_DIR, { recursive: true });
  const json = JSON.stringify(store);
  const tmp = `${DATA_FILE}.tmp`;
  await writeFile(tmp, json);
  await rename(tmp, DATA_FILE);
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  await writeFile(join(HISTORY_DIR, `${stamp}-r${store.revision}.json`), json);
  const files = (await readdir(HISTORY_DIR)).filter((f) => f.endsWith(".json")).sort();
  await Promise.all(files.slice(0, Math.max(0, files.length - HISTORY_KEEP)).map((f) => rm(join(HISTORY_DIR, f))));
}

// Pedidos de escrita em fila, para duas escritas nunca se cruzarem.
let queue = Promise.resolve();
function serialized(fn) {
  const run = queue.then(fn, fn);
  queue = run.catch(() => undefined);
  return run;
}

// ---------- autenticação ----------

const failures = new Map(); // ip -> { count, until }
const FAIL_LIMIT = 10;
const FAIL_WINDOW_MS = 15 * 60 * 1000;

function digest(s) {
  return createHash("sha256").update(s).digest();
}

function checkCode(req) {
  const header = req.headers.authorization ?? "";
  const given = header.startsWith("Bearer ") ? header.slice(7) : "";
  return given.length > 0 && timingSafeEqual(digest(given), digest(SYNC_CODE));
}

function blocked(ip) {
  const f = failures.get(ip);
  if (!f) return false;
  if (Date.now() > f.until) {
    failures.delete(ip);
    return false;
  }
  return f.count >= FAIL_LIMIT;
}

function recordFailure(ip) {
  const f = failures.get(ip) ?? { count: 0, until: Date.now() + FAIL_WINDOW_MS };
  f.count++;
  failures.set(ip, f);
}

// ---------- respostas ----------

function sendJson(res, status, body) {
  const json = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "Content-Length": Buffer.byteLength(json),
  });
  res.end(json);
}

async function readBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY) throw Object.assign(new Error("Too large"), { status: 413 });
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

// ---------- lembretes ----------

export const push = SYNC_CODE
  ? new PushService({
      dataDir: DATA_DIR,
      // O Apple exige um contacto (mailto: ou https:) nas chaves VAPID.
      subject: process.env.VAPID_SUBJECT || "https://github.com/mwmiao/Medicine-Planner",
      publicKey: process.env.VAPID_PUBLIC_KEY,
      privateKey: process.env.VAPID_PRIVATE_KEY,
      readDoseLogs: async () => {
        const store = await readStore();
        const logs = store.data && typeof store.data === "object" ? store.data.doseLogs : null;
        return Array.isArray(logs) ? logs.filter((l) => l && typeof l.id === "string") : [];
      },
    })
  : null;

async function handlePush(req, res, url) {
  if (!push) return sendJson(res, 503, { error: "sync_disabled" });
  if (url.pathname === "/api/push/key" && req.method === "GET") return sendJson(res, 200, { publicKey: await push.publicKey() });
  if (url.pathname === "/api/push/status" && req.method === "GET") return sendJson(res, 200, await push.status());
  const routes = {
    "POST /api/push/subscription": (b) => push.subscribe(b),
    "DELETE /api/push/subscription": (b) => push.unsubscribe(b),
    "PUT /api/push/jobs": (b) => push.setJobs(b),
    "POST /api/push/test": (b) => push.sendTest(b),
  };
  const handler = routes[`${req.method} ${url.pathname}`];
  if (!handler) return sendJson(res, 404, { error: "not_found" });
  let body;
  try {
    body = await readBody(req);
  } catch (e) {
    return sendJson(res, e.status ?? 400, { error: e.status === 413 ? "too_large" : "bad_json" });
  }
  const result = await handler(body);
  return sendJson(res, result.status, result.body);
}

// ---------- API ----------

/** Autenticação comum: código de sincronização, com bloqueio após muitas tentativas erradas. */
function authorize(req, res) {
  const ip = req.socket.remoteAddress ?? "?";
  if (blocked(ip)) {
    sendJson(res, 429, { error: "too_many_attempts" });
    return false;
  }
  if (!checkCode(req)) {
    recordFailure(ip);
    sendJson(res, 401, { error: "bad_code" });
    return false;
  }
  failures.delete(ip);
  return true;
}

async function handleApi(req, res, url) {
  if (url.pathname === "/api/health") {
    return sendJson(res, 200, { ok: true, sync: Boolean(SYNC_CODE), push: Boolean(push) });
  }
  if (url.pathname === "/api/cron/tick") {
    // Para um cron externo (opcional): o servidor já faz isto sozinho a cada minuto.
    if (!push) return sendJson(res, 503, { error: "sync_disabled" });
    const header = req.headers.authorization ?? "";
    const okSecret = CRON_SECRET && header === `Bearer ${CRON_SECRET}`;
    if (!okSecret && !authorize(req, res)) return;
    if (req.method !== "POST") return sendJson(res, 405, { error: "method_not_allowed" });
    return sendJson(res, 200, await push.tick());
  }
  if (url.pathname.startsWith("/api/push/")) {
    if (!SYNC_CODE) return sendJson(res, 503, { error: "sync_disabled" });
    if (url.pathname !== "/api/push/key" && !authorize(req, res)) return;
    return handlePush(req, res, url);
  }
  if (url.pathname !== "/api/data") return sendJson(res, 404, { error: "not_found" });
  if (!SYNC_CODE) return sendJson(res, 503, { error: "sync_disabled" });
  if (!authorize(req, res)) return;

  if (req.method === "GET") return sendJson(res, 200, await readStore());

  if (req.method === "PUT") {
    let body;
    try {
      body = await readBody(req);
    } catch (e) {
      return sendJson(res, e.status ?? 400, { error: e.status === 413 ? "too_large" : "bad_json" });
    }
    if (typeof body !== "object" || body === null || typeof body.data !== "object" || body.data === null) {
      return sendJson(res, 400, { error: "bad_payload" });
    }
    return serialized(async () => {
      const current = await readStore();
      // Controlo de concorrência: só grava se o cliente partiu da revisão atual.
      if (!body.force && body.baseRevision !== current.revision) {
        return sendJson(res, 409, { error: "conflict", ...current });
      }
      const next = { revision: current.revision + 1, updatedAt: new Date().toISOString(), data: body.data };
      await writeStore(next);
      return sendJson(res, 200, { revision: next.revision, updatedAt: next.updatedAt });
    });
  }

  res.setHeader("Allow", "GET, PUT");
  return sendJson(res, 405, { error: "method_not_allowed" });
}

// ---------- ficheiros estáticos ----------

const gzCache = new Map();

async function fileInfo(path) {
  try {
    return await stat(path);
  } catch {
    return null;
  }
}

async function sendFile(req, res, path, status = 200) {
  const ext = extname(path);
  let body = await readFile(path);
  const headers = { "Content-Type": MIME[ext] ?? "application/octet-stream" };
  const rel = path.slice(ROOT.length).split(sep).join("/");
  headers["Cache-Control"] = rel.startsWith("/_next/static/") ? "public, max-age=31536000, immutable" : "no-cache";
  if (COMPRESSIBLE.has(ext) && /\bgzip\b/.test(req.headers["accept-encoding"] ?? "") && body.length > 1024) {
    const key = `${path}:${body.length}`;
    if (!gzCache.has(key)) gzCache.set(key, gzipSync(body));
    body = gzCache.get(key);
    headers["Content-Encoding"] = "gzip";
    headers.Vary = "Accept-Encoding";
  }
  headers["Content-Length"] = body.length;
  res.writeHead(status, headers);
  res.end(req.method === "HEAD" ? undefined : body);
}

async function handleStatic(req, res, url) {
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.writeHead(405, { Allow: "GET, HEAD" });
    return res.end();
  }
  let pathname;
  try {
    pathname = decodeURIComponent(url.pathname);
  } catch {
    pathname = "/";
  }
  const target = normalize(join(ROOT, pathname));
  if (target !== ROOT && !target.startsWith(ROOT + sep)) {
    res.writeHead(400);
    return res.end();
  }
  const info = await fileInfo(target);
  if (info?.isFile()) return sendFile(req, res, target);
  if (info?.isDirectory()) {
    if (!pathname.endsWith("/")) {
      // Redirecionamento relativo: funciona atrás de um proxy reverso HTTPS.
      res.writeHead(301, { Location: `${url.pathname}/${url.search}` });
      return res.end();
    }
    const index = join(target, "index.html");
    if ((await fileInfo(index))?.isFile()) return sendFile(req, res, index);
  }
  const html = `${target}.html`;
  if ((await fileInfo(html))?.isFile()) return sendFile(req, res, html);
  const notFound = join(ROOT, "404.html");
  if ((await fileInfo(notFound))?.isFile()) return sendFile(req, res, notFound, 404);
  res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
  return res.end("Not found");
}

// ---------- arranque ----------

export function createApp() {
  return createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    try {
      if (url.pathname.startsWith("/api/")) await handleApi(req, res, url);
      else await handleStatic(req, res, url);
    } catch (e) {
      console.error(e);
      if (!res.headersSent) sendJson(res, 500, { error: "server_error" });
      else res.end();
    }
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await mkdir(DATA_DIR, { recursive: true });
  createApp().listen(PORT, () => {
    console.log(`Medicine Planner on :${PORT} — static: ${ROOT} — data: ${DATA_DIR} — sync ${SYNC_CODE ? "ON" : "OFF (set SYNC_CODE)"}`);
  });
  if (push && INTERNAL_CRON) {
    // "Cron" interno: corre no início de cada minuto.
    const run = () => push.tick().catch((e) => console.error("tick failed", e));
    setTimeout(() => {
      void run();
      setInterval(run, 60_000);
    }, 60_000 - (Date.now() % 60_000));
  }
}
