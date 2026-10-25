import { formatDate, parseLocalDateTime } from "./dates";
import type { Messages } from "./i18n/pt";
import type { Locale, Medication } from "./types";

export function formatDose(med: Pick<Medication, "unit" | "quantityPerDose" | "dosage">, m: Messages): string {
  const qty = m.units.count(med.unit, med.quantityPerDose);
  const strength = med.dosage.trim();
  return strength && !["mg", "ml"].includes(med.unit) ? `${qty} · ${strength}` : qty;
}

export function describeFrequency(med: Pick<Medication, "frequency" | "times">, m: Messages): string {
  const f = med.frequency;
  if (f.type === "specificDays") {
    const days = (f.days ?? []).slice().sort().map((d) => m.weekdays.short[d]).join(", ");
    return m.frequency.onDays(days);
  }
  if (f.type === "interval") return m.frequency.everyNDays(f.intervalDays ?? 1);
  return m.frequency.everyDay(med.times.length);
}

export function formatDateTimeShort(localDateTime: string, locale: Locale): string {
  return formatDate(parseLocalDateTime(localDateTime), locale, {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatIsoDate(iso: string, locale: Locale): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return formatDate(d, locale, { day: "numeric", month: "long", year: "numeric" });
}

export function formatClock(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/** Cores para identificar a caixa — com nome para leitores de ecrã. */
export const BOX_COLORS = [
  { value: "#2563eb", pt: "Azul", zh: "蓝色" },
  { value: "#16a34a", pt: "Verde", zh: "绿色" },
  { value: "#dc2626", pt: "Vermelho", zh: "红色" },
  { value: "#d97706", pt: "Laranja", zh: "橙色" },
  { value: "#9333ea", pt: "Roxo", zh: "紫色" },
  { value: "#db2777", pt: "Rosa", zh: "粉色" },
  { value: "#ca8a04", pt: "Amarelo", zh: "黄色" },
  { value: "#57534e", pt: "Castanho", zh: "棕色" },
] as const;
