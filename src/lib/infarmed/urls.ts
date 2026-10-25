// URLs públicos do INFOMED (base de dados nacional de medicamentos do INFARMED).
//
// Investigação (out. 2026): o INFOMED é uma aplicação JSF (páginas .xhtml,
// formulários POST com ViewState e jsessionid). NÃO existe uma API JSON pública e
// documentada, e a pesquisa não aceita parâmetros no URL. Os únicos URLs estáveis
// são a página inicial, a pesquisa avançada e a página de detalhe de cada
// medicamento, identificada pelo parâmetro `med_guid`.

export const INFOMED_BASE = "https://extranet.infarmed.pt/INFOMED-fo/";
export const INFOMED_SEARCH_URL = `${INFOMED_BASE}index.xhtml`;
export const INFOMED_ADVANCED_SEARCH_URL = `${INFOMED_BASE}pesquisa-avancada.xhtml`;
export const INFARMED_SITE_URL = "https://www.infarmed.pt/";

export function infomedDetailUrl(medGuid: string): string {
  return `${INFOMED_BASE}detalhes-medicamento.xhtml?med_guid=${encodeURIComponent(medGuid)}`;
}

/** Extrai o med_guid de um URL de detalhe do INFOMED colado pelo utilizador. */
export function parseInfomedUrl(input: string): { medGuid: string; url: string } | null {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || !url.hostname.endsWith("infarmed.pt")) return null;
  const medGuid = url.searchParams.get("med_guid");
  if (!medGuid || !/^[A-Za-z0-9-]{8,64}$/.test(medGuid)) return null;
  return { medGuid, url: infomedDetailUrl(medGuid) };
}

/** Aceita apenas ligações https para domínios do INFARMED (folheto, RCM). */
export function isOfficialInfarmedUrl(input: string): boolean {
  try {
    const url = new URL(input.trim());
    return url.protocol === "https:" && (url.hostname === "infarmed.pt" || url.hostname.endsWith(".infarmed.pt"));
  } catch {
    return false;
  }
}
