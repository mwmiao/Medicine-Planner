"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { useEffect } from "react";
import { db } from "@/lib/db";
import { useMessages } from "@/lib/i18n";
import { remindersEnabled, uploadReminderJobs } from "@/lib/push";

/**
 * Sempre que os medicamentos, as tomas ou o idioma mudam, renova no NAS a
 * lista de lembretes (assim uma toma marcada como tomada já não é lembrada).
 */
export function ReminderJobsSync() {
  const { m, locale } = useMessages();
  const version = useLiveQuery(async () => {
    const [meds, logs] = await Promise.all([db.medications.toArray(), db.doseLogs.toArray()]);
    return JSON.stringify([meds.map((x) => [x.id, x.updatedAt]), logs.map((l) => [l.id, l.status, l.snoozedUntil])]);
  }, []);

  useEffect(() => {
    if (version === undefined || !remindersEnabled()) return;
    const id = setTimeout(() => void uploadReminderJobs(locale, m).catch(() => undefined), 2000);
    return () => clearTimeout(id);
  }, [version, locale, m]);

  return null;
}
