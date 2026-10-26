import { db, type PlannerDB } from "../db";
import type { MedicationInput } from "../medications";
import type { InfarmedRecord } from "../types";
import { defaultProvider, ProviderUnavailableError, type InfarmedMatch, type InfarmedProvider } from "./provider";

export type RemoteStatus = "ok" | "unavailable" | "offline" | "error";

export type InfarmedSearchResult = {
  query: string;
  cached: InfarmedMatch[];
  remote: InfarmedMatch[];
  remoteStatus: RemoteStatus;
};

export function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function toRecord(match: InfarmedMatch, now: Date): InfarmedRecord {
  return {
    id: match.id,
    name: match.name,
    activeSubstance: match.activeSubstance,
    pharmaceuticalForm: match.pharmaceuticalForm,
    strength: match.strength,
    authorisationStatus: match.authorisationStatus,
    holder: match.holder,
    ean: match.ean,
    recordUrl: match.recordUrl,
    leafletUrl: match.leafletUrl,
    spcUrl: match.spcUrl,
    origin: match.origin,
    rawData: match.rawData,
    retrievedAt: now.toISOString(),
    nameLower: normalize(match.name),
    substanceLower: normalize(match.activeSubstance ?? ""),
  };
}

export function fromRecord(r: InfarmedRecord): InfarmedMatch {
  return {
    id: r.id,
    name: r.name,
    activeSubstance: r.activeSubstance,
    pharmaceuticalForm: r.pharmaceuticalForm,
    strength: r.strength,
    authorisationStatus: r.authorisationStatus,
    holder: r.holder,
    ean: r.ean,
    recordUrl: r.recordUrl,
    leafletUrl: r.leafletUrl,
    spcUrl: r.spcUrl,
    origin: r.origin,
    retrievedAt: r.retrievedAt,
    rawData: r.rawData,
  };
}

export async function cacheRecord(match: InfarmedMatch, now: Date = new Date(), database: PlannerDB = db): Promise<InfarmedRecord> {
  const record = toRecord(match, now);
  await database.infarmedCache.put(record);
  return record;
}

/** Pesquisa na cache local por EAN, nome comercial ou substância ativa (funciona offline). */
export async function searchCache(query: string, database: PlannerDB = db, ean?: string): Promise<InfarmedMatch[]> {
  const all = await database.infarmedCache.toArray();
  const byEan = ean ? all.filter((r) => r.ean === ean) : [];
  const terms = normalize(query).split(" ").filter((t) => t.length >= 3);
  if (!terms.length) return byEan.map(fromRecord);
  const eanIds = new Set(byEan.map((r) => r.id));
  const byText = all
    .filter((r) => !eanIds.has(r.id))
    .map((r) => ({ r, score: terms.filter((t) => r.nameLower.includes(t) || r.substanceLower.includes(t)).length }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || a.r.name.localeCompare(b.r.name))
    .map((x) => fromRecord(x.r));
  return [...byEan.map(fromRecord), ...byText];
}

export async function searchInfarmed(
  query: string,
  options: { provider?: InfarmedProvider; database?: PlannerDB; signal?: AbortSignal; online?: boolean; ean?: string } = {},
): Promise<InfarmedSearchResult> {
  const { provider = defaultProvider, database = db, signal } = options;
  const online = options.online ?? (typeof navigator === "undefined" ? true : navigator.onLine);
  const cached = await searchCache(query, database, options.ean);
  let remote: InfarmedMatch[] = [];
  let remoteStatus: RemoteStatus = "ok";
  if (!online) {
    remoteStatus = "offline";
  } else {
    try {
      const ids = new Set(cached.map((c) => c.id));
      remote = (await provider.search(query, signal)).filter((m) => !ids.has(m.id));
    } catch (e) {
      remoteStatus = e instanceof ProviderUnavailableError ? "unavailable" : "error";
    }
  }
  return { query, cached, remote, remoteStatus };
}

/**
 * Seleciona um resultado: guarda-o na cache (com data de obtenção) e devolve os
 * campos do formulário pré-preenchidos. Tudo continua editável pelo utilizador.
 */
export async function selectMatch(
  match: InfarmedMatch,
  input: MedicationInput,
  now: Date = new Date(),
  database: PlannerDB = db,
): Promise<MedicationInput> {
  const record = await cacheRecord(match, now, database);
  return {
    ...input,
    name: match.name || input.name,
    activeSubstance: match.activeSubstance ?? input.activeSubstance,
    dosage: match.strength ?? input.dosage,
    pharmaceuticalForm: match.pharmaceuticalForm ?? input.pharmaceuticalForm,
    ean: match.ean ?? input.ean,
    infarmed: {
      matched: true,
      recordId: record.id,
      recordUrl: record.recordUrl,
      leafletUrl: record.leafletUrl,
      spcUrl: record.spcUrl,
      retrievedAt: record.retrievedAt,
      rawData: {
        origin: record.origin,
        authorisationStatus: record.authorisationStatus,
        holder: record.holder,
        pharmaceuticalForm: record.pharmaceuticalForm,
        strength: record.strength,
      },
    },
  };
}
