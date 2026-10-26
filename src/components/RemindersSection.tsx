"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { formatDate } from "@/lib/dates";
import { useMessages } from "@/lib/i18n";
import {
  disableReminders,
  enableReminders,
  isStandalone,
  pushSupported,
  reminderStatus,
  remindersEnabled,
  sendTestReminder,
  type EnableResult,
} from "@/lib/push";
import { useSyncState } from "@/lib/sync";
import { toast } from "./Toast";
import { Button, Card, Notice } from "./ui";

type Env = { standalone: boolean; supported: boolean; permission: NotificationPermission | "unsupported"; enabled: boolean };

const SERVER_ENV: Env = { standalone: false, supported: false, permission: "default", enabled: false };
let cached: Env = SERVER_ENV;
const listeners = new Set<() => void>();

function readEnv(): Env {
  const next: Env = {
    standalone: isStandalone(),
    supported: pushSupported(),
    permission: typeof Notification === "undefined" ? "unsupported" : Notification.permission,
    enabled: remindersEnabled(),
  };
  // Mesmo objeto se nada mudou (exigência do useSyncExternalStore).
  if (JSON.stringify(next) !== JSON.stringify(cached)) cached = next;
  return cached;
}

function refreshEnv() {
  listeners.forEach((l) => l());
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  document.addEventListener("visibilitychange", cb);
  return () => {
    listeners.delete(cb);
    document.removeEventListener("visibilitychange", cb);
  };
}

export function RemindersSection() {
  const { m, locale } = useMessages();
  const env = useSyncExternalStore(subscribe, readEnv, () => SERVER_ENV);
  const sync = useSyncState();
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<EnableResult | null>(null);
  const [nextAt, setNextAt] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    if (!env.enabled) return;
    let alive = true;
    void reminderStatus().then((s) => alive && setNextAt(s ? s.nextAt : undefined));
    return () => {
      alive = false;
    };
  }, [env.enabled]);

  const enable = async () => {
    setBusy(true);
    setProblem(null);
    // O pedido de permissão acontece aqui, diretamente a partir do toque.
    const result = await enableReminders(locale, m);
    setBusy(false);
    refreshEnv();
    if (result === "enabled") toast(m.reminders.enabled);
    else setProblem(result);
  };

  const test = async () => {
    setBusy(true);
    const ok = await sendTestReminder(locale, m);
    setBusy(false);
    toast(ok ? m.reminders.testSent : m.reminders.testFailed, ok ? "success" : "error");
  };

  const problemText: Record<Exclude<EnableResult, "enabled">, string> = {
    denied: m.reminders.denied,
    unsupported: m.reminders.unsupported,
    notInstalled: m.reminders.needInstall,
    notConnected: m.reminders.needSync,
    failed: m.reminders.failed,
  };

  let content;
  if (!env.supported && env.standalone) {
    content = <Notice tone="warn">{m.reminders.unsupported}</Notice>;
  } else if (!env.standalone) {
    // O botão só aparece na app instalada no ecrã principal.
    content = <Notice tone="warn">{m.reminders.needInstall}</Notice>;
  } else if (sync.status === "off") {
    content = <Notice tone="warn">{m.reminders.needSync}</Notice>;
  } else if (env.permission === "denied") {
    content = <Notice tone="warn">{m.reminders.denied}</Notice>;
  } else if (env.enabled) {
    content = (
      <>
        <Notice tone="success">
          <p className="font-bold">{m.reminders.enabled}</p>
          {nextAt !== undefined ? (
            <p className="text-base">
              {nextAt
                ? m.reminders.nextReminder(
                    formatDate(new Date(nextAt), locale, { weekday: "long", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }),
                  )
                : m.reminders.noneScheduled}
            </p>
          ) : null}
        </Notice>
        <Button block onClick={() => void test()} disabled={busy}>
          🔔 {m.reminders.test}
        </Button>
        <p className="text-base text-muted">{m.reminders.keepOpening}</p>
        <Button
          variant="ghost"
          onClick={() => {
            void disableReminders().then(refreshEnv);
          }}
        >
          {m.reminders.disable}
        </Button>
      </>
    );
  } else {
    content = (
      <Button block className="min-h-16 text-xl" onClick={() => void enable()} disabled={busy}>
        🔔 {busy ? m.reminders.enabling : m.reminders.enable}
      </Button>
    );
  }

  return (
    <Card>
      <h2 className="mb-3 text-2xl font-bold">{m.reminders.notificationsTitle}</h2>
      <div className="flex flex-col gap-3">
        <p className="text-lg">{m.reminders.explain}</p>
        {content}
        {problem && problem !== "enabled" ? <Notice tone="error">{problemText[problem]}</Notice> : null}
      </div>
    </Card>
  );
}
