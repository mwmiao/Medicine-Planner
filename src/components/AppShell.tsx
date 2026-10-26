"use client";

import { useEffect, useSyncExternalStore, type ReactNode } from "react";
import { useMessages } from "@/lib/i18n";
import { startSync } from "@/lib/sync";
import { BottomNav } from "./BottomNav";
import { LanguageSwitcher } from "./LanguageSwitcher";
import { ReminderJobsSync } from "./ReminderJobsSync";
import { ReminderWatcher } from "./ReminderWatcher";
import { ToastHost } from "./Toast";

function subscribeOnline(cb: () => void) {
  window.addEventListener("online", cb);
  window.addEventListener("offline", cb);
  return () => {
    window.removeEventListener("online", cb);
    window.removeEventListener("offline", cb);
  };
}

export function AppShell({ children }: { children: ReactNode }) {
  const { m } = useMessages();
  const online = useSyncExternalStore(subscribeOnline, () => navigator.onLine, () => true);

  useEffect(() => {
    if (process.env.NODE_ENV === "production" && "serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => undefined);
    }
    // Pede ao navegador para não apagar os dados quando falta espaço.
    void navigator.storage?.persist?.().catch(() => false);
    return startSync();
  }, []);

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-20 border-b-2 border-line bg-white/95 pt-safe backdrop-blur">
        <div className="mx-auto flex max-w-xl items-center justify-between gap-3 px-safe py-2">
          <span className="flex items-center gap-2 text-xl font-bold text-primary">
            <span aria-hidden className="text-2xl">💊</span>
            {m.common.shortName}
          </span>
          <LanguageSwitcher />
        </div>
        {!online ? <p className="bg-overdue-soft px-4 py-2 text-center text-base font-semibold text-amber-950">{m.common.offline}</p> : null}
      </header>
      <main className="mx-auto max-w-xl px-safe pt-5 pb-36">{children}</main>
      <ReminderWatcher />
      <ReminderJobsSync />
      <ToastHost />
      <BottomNav />
    </div>
  );
}
