import type { InfarmedRecord } from "../types";

/** Um resultado possível de uma pesquisa no INFARMED. */
export type InfarmedMatch = {
  id: string;
  name: string;
  activeSubstance?: string;
  pharmaceuticalForm?: string;
  strength?: string;
  authorisationStatus?: string;
  holder?: string;
  /** EAN-13 da embalagem, quando conhecido (lido na caixa e confirmado pelo utilizador). */
  ean?: string;
  recordUrl?: string;
  leafletUrl?: string;
  spcUrl?: string;
  origin: InfarmedRecord["origin"];
  /** Presente quando o resultado vem da cache local. */
  retrievedAt?: string;
  rawData?: unknown;
};

export class ProviderUnavailableError extends Error {
  constructor() {
    super("INFARMED automatic search is not available");
  }
}

/**
 * Fornecedor de pesquisa automática no INFARMED.
 *
 * Não existe hoje uma API pública e estável do INFOMED, por isso o fornecedor
 * por omissão não inventa dados nem endpoints: indica apenas que a pesquisa
 * automática não está disponível, e a app propõe abrir o INFOMED e copiar a
 * informação. Se o INFARMED vier a publicar uma API, basta implementar esta
 * interface e passá-la a `searchInfarmed`.
 */
export interface InfarmedProvider {
  readonly id: string;
  search(query: string, signal?: AbortSignal): Promise<InfarmedMatch[]>;
}

export const unavailableProvider: InfarmedProvider = {
  id: "none",
  async search() {
    throw new ProviderUnavailableError();
  },
};

export let defaultProvider: InfarmedProvider = unavailableProvider;

export function setDefaultProvider(provider: InfarmedProvider): void {
  defaultProvider = provider;
}
