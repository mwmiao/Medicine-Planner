"use client";

// Lembretes por Web Push (lado do telemóvel).
//
// No iPhone só funciona numa app adicionada ao ecrã principal (iOS 16.4+), e a
// permissão só pode ser pedida quando a pessoa toca num botão. A subscrição e a
// lista de lembretes são guardadas no NAS, que os envia à hora certa.

import { db } from "./db";
import type { Messages } from "./i18n/pt";
import { buildReminderJobs } from "./reminders/jobs";
import { getSync } from "./sync";
import type { Locale } from "./types";

const ENABLED_KEY = "mp.push.enabled";

function kvGet(k: string): string | null {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
}

function kvSet(k: string, v: string | null): void {
  try {
    if (v === null) localStorage.removeItem(k);
    else localStorage.setItem(k, v);
  } catch {
    // armazenamento indisponível
  }
}

/** A app está a correr a partir do ícone do ecrã principal? */
export function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  const iosStandalone = (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return iosStandalone || window.matchMedia("(display-mode: standalone)").matches;
}

export function pushSupported(): boolean {
  return typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

export function remindersEnabled(): boolean {
  return kvGet(ENABLED_KEY) === "1" && pushSupported() && Notification.permission === "granted";
}

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padded = (base64 + "=".repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(padded);
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

async function api(method: string, path: string, body?: unknown): Promise<Response> {
  const code = getSync().code;
  if (!code) throw new Error("not_connected");
  const res = await fetch(path, {
    method,
    headers: { Authorization: `Bearer ${code}`, ...(body !== undefined ? { "Content-Type": "application/json" } : {}) },
    body: body !== undefined ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res;
}

function timezone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "Europe/Lisbon";
}

async function registration(): Promise<ServiceWorkerRegistration> {
  const existing = await navigator.serviceWorker.getRegistration();
  if (existing) return navigator.serviceWorker.ready;
  await navigator.serviceWorker.register("/sw.js");
  return navigator.serviceWorker.ready;
}

export type EnableResult = "enabled" | "denied" | "unsupported" | "notInstalled" | "notConnected" | "failed";

/** Tem de ser chamado diretamente a partir de um toque num botão (regra do iOS). */
export async function enableReminders(locale: Locale, m: Messages): Promise<EnableResult> {
  if (!pushSupported()) return "unsupported";
  if (!isStandalone()) return "notInstalled";
  if (!getSync().connected) return "notConnected";
  const permission = await Notification.requestPermission();
  if (permission !== "granted") return "denied";
  try {
    const reg = await registration();
    const { publicKey } = (await (await api("GET", "/api/push/key")).json()) as { publicKey: string };
    const key = urlBase64ToUint8Array(publicKey);
    let sub = await reg.pushManager.getSubscription();
    // Se a chave do NAS mudou, a subscrição antiga já não serve.
    if (sub && sub.options.applicationServerKey && new Uint8Array(sub.options.applicationServerKey).join() !== key.join()) {
      await sub.unsubscribe();
      sub = null;
    }
    sub ??= await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
    await api("POST", "/api/push/subscription", { subscription: sub.toJSON(), locale, timezone: timezone() });
    kvSet(ENABLED_KEY, "1");
    await uploadReminderJobs(locale, m);
    return "enabled";
  } catch {
    return "failed";
  }
}

export async function disableReminders(): Promise<void> {
  kvSet(ENABLED_KEY, null);
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    const sub = await reg?.pushManager.getSubscription();
    if (sub) {
      await api("DELETE", "/api/push/subscription", { endpoint: sub.endpoint }).catch(() => undefined);
      await sub.unsubscribe();
    }
  } catch {
    // já estava desligado
  }
}

/** Envia ao NAS os lembretes dos próximos dias (com o texto no idioma atual). */
export async function uploadReminderJobs(locale: Locale, m: Messages): Promise<void> {
  if (!remindersEnabled() || !getSync().connected) return;
  const [meds, logs] = await Promise.all([db.medications.toArray(), db.doseLogs.toArray()]);
  const jobs = buildReminderJobs(meds, logs, m);
  const schedule = meds.map((med) => ({ id: med.id, name: med.name, times: med.times, frequency: med.frequency }));
  await api("PUT", "/api/push/jobs", { locale, timezone: timezone(), schedule, jobs });
}

export async function sendTestReminder(locale: Locale, m: Messages): Promise<boolean> {
  try {
    const res = await api("POST", "/api/push/test", { locale, title: m.reminders.testTitle, body: m.reminders.testBody });
    const body = (await res.json()) as { sent?: number };
    return (body.sent ?? 0) > 0;
  } catch {
    return false;
  }
}

export async function reminderStatus(): Promise<{ subscriptions: number; nextAt: string | null } | null> {
  try {
    return (await (await api("GET", "/api/push/status")).json()) as { subscriptions: number; nextAt: string | null };
  } catch {
    return null;
  }
}
