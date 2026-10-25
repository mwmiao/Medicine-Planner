// Limpeza do resultado do Tesseract: as caixas têm logótipos, riscas e fundos
// coloridos que o OCR transforma em "palavras" sem sentido. Ficamos só com
// palavras com confiança suficiente e que pareçam texto real.

export type OcrWord = { text: string; confidence: number };
export type OcrLine = { words: OcrWord[] };

export const MIN_WORD_CONFIDENCE = 60;

/** Uma palavra "parece texto": tem letras ou números e não é só pontuação/ruído. */
export function looksLikeText(word: string): boolean {
  const w = word.trim();
  if (!w) return false;
  const alnum = w.match(/[\p{L}\p{N}]/gu)?.length ?? 0;
  if (alnum === 0) return false;
  if (/\p{Script=Han}/u.test(w)) return true;
  // Palavras de uma letra só valem se forem números ou unidades conhecidas.
  if (alnum === 1 && !/^[\d]$|^[xX%]$/.test(w.replace(/[^\p{L}\p{N}%]/gu, ""))) return false;
  return alnum / w.length >= 0.6;
}

/** O Tesseract separa os caracteres chineses com espaços ("阿 莫 西 林"); voltamos a juntá-los. */
export function joinCjk(text: string): string {
  return text.replace(/(\p{Script=Han})[ \t]+(?=\p{Script=Han})/gu, "$1");
}

export function cleanLines(lines: OcrLine[], minConfidence = MIN_WORD_CONFIDENCE): string[] {
  const out: string[] = [];
  for (const line of lines) {
    const kept = line.words.filter((w) => w.confidence >= minConfidence && looksLikeText(w.text)).map((w) => w.text.trim());
    if (!kept.length) continue;
    const text = joinCjk(kept.join(" "));
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
