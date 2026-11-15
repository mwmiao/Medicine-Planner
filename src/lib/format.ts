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

/** Nome do formato (ex.: "Suspensão oral") em chinês; fora do chinês ou sem correspondência devolve o texto original. */
export function formatPharmaceuticalForm(form: string, locale: Locale): string {
  if (locale !== "zh") return form;
  const f = form.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  const table: [RegExp, string][] = [
    [/suspens/, "口服混悬液"],
    [/solucao oral/, "口服溶液"],
    [/xarope/, "糖浆"],
    [/gota/, "滴剂"],
    [/capsul/, "胶囊"],
    [/comprimid|tablet/, "片剂"],
    [/drag/, "糖衣片"],
    [/pomada/, "软膏"],
    [/creme/, "乳膏"],
    [/\bgel\b/, "凝胶"],
    [/supositor/, "栓剂"],
    [/colirio/, "滴眼液"],
    [/injet|inject/, "注射剂"],
    [/\bpo\b|po para/, "散剂"],
  ];
  return table.find(([re]) => re.test(f))?.[1] ?? form;
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
