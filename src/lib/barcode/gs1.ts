// Códigos de barras das caixas de medicamentos (funções puras, testáveis).
//
// - EAN-13: o código de barras "normal". Em Portugal começa normalmente por 560.
// - GS1 DataMatrix: o quadrado 2D exigido na UE (diretiva de medicamentos
//   falsificados). Contém o GTIN (01), a validade (17), o lote (10) e o número
//   de série (21).
//
// Um EAN identifica uma embalagem, mas a app nunca assume sozinha qual é o
// medicamento: o utilizador confirma sempre.

export type BarcodeInfo = {
  /** Texto lido, tal como veio do leitor. */
  raw: string;
  format: "EAN_13" | "EAN_8" | "DATA_MATRIX" | "CODE_128" | "OTHER";
  /** EAN-13 (ou GTIN-13 extraído do DataMatrix), se válido. */
  ean?: string;
  /** Validade "MM/AAAA", do DataMatrix. */
  expiry?: string;
  batch?: string;
  serial?: string;
};

/** Verifica o dígito de controlo de um EAN-8/EAN-13/GTIN-14. */
export function validGtin(code: string): boolean {
  if (!/^\d{8}$|^\d{12,14}$/.test(code)) return false;
  const digits = code.split("").map(Number);
  const check = digits.pop()!;
  const sum = digits.reverse().reduce((acc, d, i) => acc + d * (i % 2 === 0 ? 3 : 1), 0);
  return (10 - (sum % 10)) % 10 === check;
}

/** GTIN-14 com zero à esquerda → EAN-13. */
export function gtinToEan13(gtin: string): string | undefined {
  if (gtin.length === 14 && gtin.startsWith("0") && validGtin(gtin)) return gtin.slice(1);
  if (gtin.length === 13 && validGtin(gtin)) return gtin;
  return undefined;
}

const GS = "\u001d";

/** Interpreta os identificadores de aplicação GS1 mais comuns nas caixas de medicamentos. */
export function parseGs1(raw: string): Pick<BarcodeInfo, "ean" | "expiry" | "batch" | "serial"> {
  // O leitor pode devolver um prefixo de simbologia (]d2) e separadores FNC1 como GS ou "(..)".
  let s = raw.replace(/^\]d2/, "").replace(/^\]C1/, "");
  const out: Pick<BarcodeInfo, "ean" | "expiry" | "batch" | "serial"> = {};
  if (/^\(\d{2}\)/.test(s)) {
    // Forma legível: (01)05601234567899(17)271231(10)ABC
    for (const m of s.matchAll(/\((\d{2,4})\)([^(]+)/g)) apply(m[1], m[2].trim());
    return out;
  }
  while (s.length >= 2) {
    const ai = s.slice(0, 2);
    if (ai === "01") {
      apply(ai, s.slice(2, 16));
      s = s.slice(16);
    } else if (ai === "17") {
      apply(ai, s.slice(2, 8));
      s = s.slice(8);
    } else if (ai === "10" || ai === "21") {
      const rest = s.slice(2);
      const end = rest.indexOf(GS);
      apply(ai, end < 0 ? rest : rest.slice(0, end));
      s = end < 0 ? "" : rest.slice(end + 1);
    } else if (s[0] === GS) {
      s = s.slice(1);
    } else {
      break; // identificador desconhecido: pára sem inventar
    }
  }
  return out;

  function apply(ai: string, value: string) {
    if (ai === "01") out.ean = gtinToEan13(value);
    else if (ai === "17" && /^\d{6}$/.test(value)) out.expiry = `${value.slice(2, 4)}/20${value.slice(0, 2)}`;
    else if (ai === "10") out.batch = value;
    else if (ai === "21") out.serial = value;
  }
}

/** Procura um EAN-13 válido no texto lido por OCR (os números por baixo das barras). */
export function eanFromText(text: string): string | undefined {
  for (const m of text.matchAll(/(?<!\d)(\d[\d ]{11,17}\d)(?!\d)/g)) {
    const digits = m[1].replace(/ /g, "");
    if (digits.length === 13 && validGtin(digits)) return digits;
  }
  return undefined;
}
