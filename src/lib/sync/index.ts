"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { db } from "../db";
import { SyncEngine, syncAvailable, type KeyValue, type SyncState } from "./engine";

const browserKv: KeyValue = {
  get(k) {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  set(k, v) {
    try {
      localStorage.setItem(k, v);
    } catch {
      // armazenamento indisponível
    }
  },
  remove(k) {
    try {
      localStorage.removeItem(k);
    } catch {
      // armazenamento indisponível
    }
  },
};

let engine: SyncEngine | null = null;

export function getSync(): SyncEngine {
  engine ??= new SyncEngine(db, browserKv);
  return engine;
}

const OFF: SyncState = { status: "off" };

export function useSyncState(): SyncState {
  const e = typeof window === "undefined" ? null : getSync();
  return useSyncExternalStore(e?.subscribe ?? (() => () => undefined), e?.getState ?? (() => OFF), () => OFF);
}

/** undefined enquanto verifica; depois true/false. */
export function useSyncAvailable(): boolean | undefined {
  const [available, setAvailable] = useState<boolean | undefined>(undefined);
  useEffect(() => {
    let alive = true;
    void syncAvailable().then((v) => alive && setAvailable(v));
    return () => {
      alive = false;
    };
  }, []);
  return available;
}

/** Liga os registos de alterações e sincroniza ao abrir, ao voltar à app, ao recuperar a rede e a cada minuto. */
export function startSync(): () => void {
  const e = getSync();
  e.installHooks();
  void e.syncNow();
  const onVisible = () => document.visibilityState === "visible" && void e.syncNow();
  const onOnline = () => void e.syncNow();
  document.addEventListener("visibilitychange", onVisible);
  window.addEventListener("online", onOnline);
  const id = setInterval(() => document.visibilityState === "visible" && void e.syncNow(), 60_000);
  return () => {
    document.removeEventListener("visibilitychange", onVisible);
    window.removeEventListener("online", onOnline);
    clearInterval(id);
  };
}
