"use client";

import { useSyncExternalStore } from "react";

type ToastMsg = { id: number; text: string; tone: "success" | "error" | "info" };

let current: ToastMsg | null = null;
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setTimeout> | undefined;

export function toast(text: string, tone: ToastMsg["tone"] = "success"): void {
  current = { id: Date.now(), text, tone };
  listeners.forEach((l) => l());
  clearTimeout(timer);
  timer = setTimeout(() => {
    current = null;
    listeners.forEach((l) => l());
  }, 3500);
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function ToastHost() {
  const msg = useSyncExternalStore(subscribe, () => current, () => null);
  if (!msg) return null;
  const tone = { success: "bg-taken", error: "bg-danger", info: "bg-ink" }[msg.tone];
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-28 z-40 flex justify-center px-4 pb-safe">
      <p role="status" className={`rounded-2xl px-5 py-3 text-lg font-semibold text-white shadow-lg ${tone}`}>
        {msg.text}
      </p>
    </div>
  );
}
