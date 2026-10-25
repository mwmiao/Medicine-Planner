"use client";

import { useSyncExternalStore } from "react";
import type { Locale, TextSize } from "./types";

// Preferências simples guardadas em localStorage (idioma e tamanho do texto).

const KEYS = { locale: "mp.locale", textSize: "mp.textSize" } as const;
const listeners = new Set<() => void>();

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // modo privado: a preferência vale só para esta sessão
  }
  listeners.forEach((l) => l());
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  window.addEventListener("storage", cb);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", cb);
  };
}

export function getLocale(): Locale {
  return read(KEYS.locale) === "zh" ? "zh" : "pt";
}

export function getTextSize(): TextSize {
  const v = read(KEYS.textSize);
  return v === "large" || v === "xlarge" ? v : "normal";
}

export function setLocale(locale: Locale): void {
  write(KEYS.locale, locale);
  document.documentElement.lang = locale === "zh" ? "zh-CN" : "pt-PT";
}

export function setTextSize(size: TextSize): void {
  write(KEYS.textSize, size);
  document.documentElement.dataset.textSize = size;
}

export function useLocale(): Locale {
  return useSyncExternalStore(subscribe, getLocale, () => "pt");
}

export function useTextSize(): TextSize {
  return useSyncExternalStore(subscribe, getTextSize, () => "normal");
}
