// Todas as datas de tomas são guardadas como texto local ("YYYY-MM-DD" e
// "YYYY-MM-DDTHH:mm"), para não haver surpresas com fusos horários ou mudança de hora.

const pad = (n: number) => String(n).padStart(2, "0");

export function toDateKey(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function toLocalDateTime(d: Date): string {
  return `${toDateKey(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function parseDateKey(key: string): Date {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function parseLocalDateTime(value: string): Date {
  const [date, time = "00:00"] = value.split("T");
  const [h, min] = time.split(":").map(Number);
  const d = parseDateKey(date);
  d.setHours(h, min, 0, 0);
  return d;
}

export function addDays(d: Date, days: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + days);
  return r;
}

export function addMinutes(d: Date, minutes: number): Date {
  return new Date(d.getTime() + minutes * 60_000);
}

/** Número de dias de calendário entre duas datas (ignora horas e mudança de hora). */
export function daysBetween(a: Date, b: Date): number {
  const ua = Date.UTC(a.getFullYear(), a.getMonth(), a.getDate());
  const ub = Date.UTC(b.getFullYear(), b.getMonth(), b.getDate());
  return Math.round((ub - ua) / 86_400_000);
}

export function isValidTime(t: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(t);
}

export function formatDate(d: Date, locale: "pt" | "zh", opts: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat(locale === "zh" ? "zh-CN" : "pt-PT", opts).format(d);
}
