"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { useEffect, useMemo, useState } from "react";
import { addDays, toDateKey } from "./dates";
import { db } from "./db";
import { generateDoses, type Dose } from "./schedule";
import type { DoseLog, Medication } from "./types";

/** Hora atual, atualizada a cada `ms` (para os estados "em atraso" mudarem sozinhos). */
export function useNow(ms = 30_000): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), ms);
    const onVisible = () => document.visibilityState === "visible" && setNow(new Date());
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [ms]);
  return now;
}

export function useMedications(): Medication[] | undefined {
  return useLiveQuery(() => db.medications.orderBy("name").toArray(), []);
}

export function useLogsForDay(dateKey: string): DoseLog[] | undefined {
  return useLiveQuery(
    () => db.doseLogs.where("scheduledFor").between(dateKey, `${dateKey}￿`).toArray(),
    [dateKey],
  );
}

export function useTodayDoses(): { doses: Dose[] | undefined; now: Date } {
  const now = useNow();
  const key = toDateKey(now);
  const meds = useMedications();
  const logs = useLogsForDay(key);
  const doses = useMemo(
    () => (meds && logs ? generateDoses(meds, logs, now, now) : undefined),
    [meds, logs, now],
  );
  return { doses, now };
}

export function useLogsSince(days: number, now: Date): DoseLog[] | undefined {
  const from = toDateKey(addDays(now, -days));
  return useLiveQuery(() => db.doseLogs.where("scheduledFor").aboveOrEqual(from).toArray(), [from]);
}
