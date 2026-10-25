// Heurísticas simples para encontrar campos no texto lido de uma caixa de
// medicamento. São apenas sugestões: o utilizador revê e corrige tudo antes de guardar.

export type ParsedBox = {
  name?: string;
  activeSubstance?: string;
  strength?: string;
  form?: string;
  packCount?: string;
  expiry?: string;
  manufacturer?: string;
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
  { re: /胶囊/, label: "胶囊" },
  { re: /糖浆/, label: "糖浆" },
  { re: /滴剂/, label: "滴剂" },
  { re: /片/, label: "片" },
];

const PACK_RE = /(\d{1,3})\s*(?:x\s*)?(comprimidos?|c[áa]psulas?|saquetas?|unidades|片|粒|袋)/i;

const EXPIRY_RE =
  /(?:val(?:idade)?|exp|有效期至?|失效期)\.?\s*[:：]?\s*(\d{1,2}[\/.\-]\d{2,4}|\d{4}[\/.\-]\d{1,2}(?:[\/.\-]\d{1,2})?)/i;

const MANUFACTURER_RE = /(laborat[óo]rios?|pharma|farma|lda\.?|s\.a\.|gmbh|ltd|inc\.|有限公司|制药|药业)/i;

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

function titleCase(s: string): string {
  if (s !== s.toUpperCase()) return s;
  return s.toLowerCase().replace(/(^|[\s-])(\p{L})/gu, (_m, a: string, b: string) => a + b.toUpperCase());
}

export function parseBoxText(raw: string): ParsedBox {
  const lines = raw.split(/\r?\n/).map(cleanLine).filter((l) => l.length >= 2);
  const text = lines.join("\n");
  const out: ParsedBox = {};

  const strengthIdx = lines.findIndex((l) => STRENGTH_RE.test(l));
  const s = text.match(STRENGTH_RE);
  if (s) out.strength = `${s[1].replace(",", ".")} ${s[2].toLowerCase().replace("μg", "µg")}`;

  out.form = FORMS.find((f) => f.re.test(text))?.label;

  const p = text.match(PACK_RE);
  if (p) out.packCount = p[1];

  const e = text.match(EXPIRY_RE);
  if (e) out.expiry = e[1];

  const manu = lines.find((l) => MANUFACTURER_RE.test(l) && l.length <= 60);
  if (manu) out.manufacturer = manu;

  // Na linha da dosagem, o texto antes do número é normalmente o nome
  // (ex.: "Ben-u-ron 500 mg comprimidos").
  if (strengthIdx >= 0) {
    const before = lines[strengthIdx].split(STRENGTH_RE)[0].trim().replace(/[,;:-]+$/, "").trim();
    if (before.length >= 3 && letterRatio(before) > 0.6) out.name = before;
  }

  const usable = (l: string) =>
    l.length >= 3 && l.length <= 40 && letterRatio(l) > 0.7 && !NOISE_RE.test(l) && !MANUFACTURER_RE.test(l) && !isFormLine(l);

  if (!out.name) {
    const candidates = lines.filter(usable);
    // Preferir linhas em maiúsculas (os nomes costumam estar em destaque).
    out.name = candidates.find((l) => l === l.toUpperCase() && /[A-Z]/.test(l)) ?? candidates[0];
  }

  // Substância ativa: linha junto à dosagem, diferente do nome.
  if (strengthIdx >= 0) {
    const near = [lines[strengthIdx + 1], lines[strengthIdx - 1]].find(
      (l) => l !== undefined && l !== out.name && usable(l) && !STRENGTH_RE.test(l),
    );
    if (near) out.activeSubstance = near;
  }

  if (out.name) out.name = titleCase(out.name);
  if (out.activeSubstance) out.activeSubstance = titleCase(out.activeSubstance);
  return out;
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
