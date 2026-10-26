// Heurísticas simples para encontrar campos no texto lido de uma caixa de
// medicamento (só português / alfabeto latino). São apenas sugestões: o
// utilizador revê e corrige tudo antes de guardar. Os nomes dos medicamentos
// são mantidos tal como estão escritos na caixa (nunca traduzidos).

import { eanFromText } from "../barcode/gs1";
import { comparable } from "./clean";

export type ParsedBox = {
  name?: string;
  activeSubstance?: string;
  strength?: string;
  form?: string;
  packCount?: string;
  expiry?: string;
  manufacturer?: string;
  /** EAN-13 lido nos números por baixo do código de barras. */
  ean?: string;
};

const STRENGTH_RE = /(\d+(?:[.,]\d+)?)\s?(mg\/ml|mg\/g|mg|mcg|µg|μg|g|ml|ui|%)(?![a-z])/i;

const FORMS: { re: RegExp; label: string }[] = [
  { re: /comprimidos?\s+revestidos?/i, label: "Comprimido revestido" },
  { re: /comprimidos?\s+efervescentes?/i, label: "Comprimido efervescente" },
  { re: /comprimidos?/i, label: "Comprimido" },
  { re: /c[áa]psulas?/i, label: "Cápsula" },
  { re: /xarope/i, label: "Xarope" },
  { re: /gotas/i, label: "Gotas" },
  { re: /solu[çc][ãa]o\s+oral/i, label: "Solução oral" },
  { re: /suspens[ãa]o\s+oral/i, label: "Suspensão oral" },
  { re: /pomada|creme/i, label: "Pomada/Creme" },
  { re: /saquetas?/i, label: "Saqueta" },
];

const PACK_RE = /(\d{1,3})\s*(?:x\s*)?(comprimidos?|c[áa]psulas?|saquetas?|unidades|ampolas?)/iu;

const EXPIRY_RE =
  /(?:val(?:idade)?|exp)\.?\s*:?\s*(\d{1,2}[\/.\-]\d{2,4}|\d{4}[\/.\-]\d{1,2}(?:[\/.\-]\d{1,2})?)/i;

const MANUFACTURER_RE = /(laborat[óo]rios?|pharma|farma|lda\.?|s\.a\.|gmbh|ltd|inc\.)/i;

/** Linhas que aparecem nas caixas mas não são nomes de medicamentos. */
const NOISE_RE = /^(lote|lot|val|exp|via oral|uso oral|medicamento|n\.?º|nr|reg|aim|cnpem|chnm|ler o folheto|manter fora)/i;

function cleanLine(l: string): string {
  return l.replace(/[|_~^*"“”«»]+/g, " ").replace(/\s+/g, " ").trim();
}

function letterRatio(l: string): number {
  const letters = l.match(/\p{L}/gu)?.length ?? 0;
  return l.length ? letters / l.length : 0;
}

function isFormLine(l: string): boolean {
  return FORMS.some((f) => f.re.test(l)) && l.split(" ").length <= 4;
}

/** Isola o nome da empresa numa linha que também pode ter lote/validade. */
function companyName(line: string): string {
  const company = line.match(/(\p{Lu}[\p{L}.&'-]*(?:\s+[\p{L}.&'-]+){0,4}?,?\s+(?:Lda\.?|S\.A\.?|GmbH|Ltd\.?|Inc\.?))/u);
  return (company?.[1] ?? line).trim().slice(0, 60);
}

/** Remove pontuação solta que o OCR junta às palavras (ex.: "Paracetamol!"). */
function trimNoise(s: string): string {
  return s.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}.)]+$/gu, "").trim();
}

export function parseBoxText(raw: string): ParsedBox {
  const lines = raw.split(/\r?\n/).map(cleanLine).filter((l) => l.length >= 2);
  const text = lines.join("\n");
  const out: ParsedBox = {};

  const strengthIdx = lines.findIndex((l) => STRENGTH_RE.test(l));
  const s = text.match(STRENGTH_RE);
  if (s) out.strength = `${s[1].replace(",", ".")} ${s[2].toLowerCase().replace("μg", "µg")}`;

  out.form = FORMS.find((f) => f.re.test(text))?.label;

  // Quantidade na caixa: ignora o número da dosagem ("500 comprimidos" quando o
  // OCR perdeu o "mg") e prefere valores realistas para uma embalagem.
  const strengthNum = s?.[1];
  const packs = [...text.matchAll(new RegExp(PACK_RE, "giu"))].map((x) => x[1]).filter((n) => n !== strengthNum);
  out.packCount = packs.find((n) => Number(n) > 0 && Number(n) <= 200) ?? packs[0];

  const e = text.match(EXPIRY_RE);
  if (e) out.expiry = e[1];

  out.ean = eanFromText(text);

  const manu = lines.find((l) => MANUFACTURER_RE.test(l));
  if (manu) out.manufacturer = companyName(manu);

  // Na linha da dosagem, o texto antes do número é normalmente o nome
  // (ex.: "Ben-u-ron 500 mg comprimidos").
  if (strengthIdx >= 0) {
    const before = lines[strengthIdx].split(STRENGTH_RE)[0].trim().replace(/[,;:-]+$/, "").trim();
    if (before.length >= 3 && letterRatio(before) > 0.6) out.name = before;
  }

  const usable = (l: string) =>
    l.length >= 3 && l.length <= 40 && letterRatio(l) > 0.7 && !NOISE_RE.test(l) && !MANUFACTURER_RE.test(l) && !isFormLine(l);

  // Marca em destaque (maiúsculas) por cima da linha "Substância 400 mg": a marca
  // é o nome e o texto antes da dosagem é a substância ativa (ex.: BRUFEN / Ibuprofeno 400 mg).
  if (strengthIdx > 0) {
    const brand = lines.slice(0, strengthIdx).find((l) => usable(l) && l === comparable(l) && /\p{Lu}/u.test(l));
    if (brand && out.name && comparable(brand) !== comparable(out.name)) {
      out.activeSubstance = out.name;
      out.name = brand;
    }
  }

  if (!out.name) {
    const candidates = lines.filter(usable);
    // Preferir linhas em maiúsculas (os nomes costumam estar em destaque).
    out.name = candidates.find((l) => l === comparable(l) && /\p{Lu}/u.test(l)) ?? candidates[0];
  }

  // Substância ativa: linha junto à dosagem, diferente do nome. Sem dosagem,
  // uma linha curta só com letras logo a seguir ao nome (ex.: "Paracetamol").
  if (strengthIdx >= 0) {
    const near = [lines[strengthIdx + 1], lines[strengthIdx - 1]].find(
      (l) => l !== undefined && l !== out.name && usable(l) && !STRENGTH_RE.test(l),
    );
    if (near && !out.activeSubstance) out.activeSubstance = near;
  } else if (out.name) {
    const after = lines.slice(lines.indexOf(out.name) + 1, lines.indexOf(out.name) + 4);
    out.activeSubstance = after.find((l) => usable(l) && /^[\p{L}-]+(?: [\p{L}-]+){0,2}$/u.test(l) && !PACK_RE.test(l));
  }

  // Mantém maiúsculas/minúsculas e acentos como estão na caixa.
  if (out.name) out.name = trimNoise(out.name) || undefined;
  if (out.activeSubstance) out.activeSubstance = trimNoise(out.activeSubstance) || undefined;
  return out;
}

/**
 * Combina a leitura limpa com a leitura completa: os campos com padrão fixo
 * (dosagem, validade, quantidade) também podem ser encontrados no texto
 * completo, mesmo que a palavra tenha sido descartada por baixa confiança.
 */
export function parseOcr(cleanText: string, rawText: string): ParsedBox {
  const fromClean = parseBoxText(cleanText);
  const fromRaw = parseBoxText(rawText);
  return {
    ...fromClean,
    strength: fromClean.strength ?? fromRaw.strength,
    expiry: fromClean.expiry ?? fromRaw.expiry,
    ean: fromClean.ean ?? fromRaw.ean,
    packCount: fromClean.strength || !fromRaw.strength ? fromClean.packCount : fromRaw.packCount,
  };
}

/** Melhor termo para pesquisar no INFARMED. */
export function bestSearchTerm(p: ParsedBox): string | undefined {
  return p.name ?? p.activeSubstance;
}

/** O OCR é considerado pouco claro quando há pouco texto útil ou a confiança é baixa. */
export function isUnclear(raw: string, confidence: number): boolean {
  const useful = raw.replace(/[^\p{L}\p{N}]/gu, "");
  return useful.length < 6 || confidence < 45;
}
