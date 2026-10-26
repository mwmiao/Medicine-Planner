// Limpeza do resultado do Tesseract: as caixas têm logótipos, riscas e fundos
// coloridos que o OCR transforma em "palavras" sem sentido. Ficamos só com
// palavras em alfabeto latino (português), com confiança suficiente.

export type OcrWord = { text: string; confidence: number };
export type OcrLine = { words: OcrWord[] };

export const MIN_WORD_CONFIDENCE = 60;

/** Uma palavra "parece texto": letras latinas (com acentos) ou números, não só pontuação/ruído. */
export function looksLikeText(word: string): boolean {
  const w = word.trim();
  if (!w) return false;
  // Letras de outros alfabetos são sempre ruído: a leitura é só em português.
  if (/[^\p{Script=Latin}\p{N}\p{P}\p{S}\s]/u.test(w)) return false;
  const alnum = w.match(/[\p{Script=Latin}\p{N}]/gu)?.length ?? 0;
  if (alnum === 0) return false;
  // Palavras de uma letra só valem se forem números ou "x"/"%".
  if (alnum === 1 && !/^[\d]$|^[xX%]$/.test(w.replace(/[^\p{L}\p{N}%]/gu, ""))) return false;
  return alnum / w.length >= 0.6;
}

export function cleanLines(lines: OcrLine[], minConfidence = MIN_WORD_CONFIDENCE): string[] {
  const out: string[] = [];
  for (const line of lines) {
    const kept = line.words.filter((w) => w.confidence >= minConfidence && looksLikeText(w.text)).map((w) => w.text.trim());
    if (!kept.length) continue;
    const text = kept.join(" ");
    if ((text.match(/[\p{L}\p{N}]/gu)?.length ?? 0) >= 2) out.push(text);
  }
  return out;
}

/** Pontuação de uma leitura: quantidade de texto com boa confiança (para escolher a melhor rotação). */
export function scoreLines(lines: OcrLine[]): { score: number; goodChars: number; meanConfidence: number } {
  let score = 0;
  let goodChars = 0;
  let confSum = 0;
  let count = 0;
  for (const line of lines) {
    for (const w of line.words) {
      if (!looksLikeText(w.text)) continue;
      const chars = w.text.match(/[\p{L}\p{N}]/gu)?.length ?? 0;
      confSum += w.confidence * chars;
      count += chars;
      if (w.confidence >= MIN_WORD_CONFIDENCE) {
        goodChars += chars;
        score += chars * (w.confidence / 100) ** 2;
      }
    }
  }
  return { score, goodChars, meanConfidence: count ? confSum / count : 0 };
}

/**
 * Forma de comparação: maiúsculas e sem espaços repetidos, mas com os acentos
 * portugueses (ã, ç, é…). Só para comparar — nunca para mostrar ou guardar.
 */
export function comparable(text: string): string {
  return text.toLocaleUpperCase("pt-PT").replace(/\s+/g, " ").trim();
}
