// OCR no próprio navegador com Tesseract.js. O reconhecimento corre num Web
// Worker criado pela biblioteca, por isso a interface não bloqueia. A imagem
// nunca sai do telemóvel. Os ficheiros de idioma (por, chi_sim) são
// descarregados na primeira utilização e ficam em cache pelo service worker.

import type { Page, Worker } from "tesseract.js";
import { cleanLines, joinCjk, scoreLines, type OcrLine } from "./clean";
import { prepareImage, rotateCanvas } from "./preprocess";

export type OcrLanguage = "por" | "chi_sim" | "por+chi_sim";

export type OcrResult = {
  /** Texto limpo (só palavras com boa confiança), usado para encontrar os campos. */
  text: string;
  /** Tudo o que o Tesseract leu, para o utilizador poder rever. */
  rawText: string;
  /** Confiança média (0–100) das letras lidas. */
  confidence: number;
  /** Quantidade de letras/números lidos com boa confiança. */
  goodChars: number;
  rotation: Rotation;
};

type Rotation = 0 | 90 | 180 | 270;
/** Modo de segmentação do Tesseract: "3" automático, "11" texto disperso. */
type Psm = "3" | "11";
export type OcrAttempt = { rotation: Rotation; psm: Psm };

/**
 * Ordem das tentativas: primeiro a fotografia tal como está (análise automática
 * e depois "texto disperso", que lida melhor com reflexos e logótipos), e só
 * depois a caixa rodada — muitas vezes a caixa é fotografada de lado.
 */
export const DEFAULT_ATTEMPTS: OcrAttempt[] = [
  { rotation: 0, psm: "3" },
  { rotation: 0, psm: "11" },
  { rotation: 90, psm: "11" },
  { rotation: 270, psm: "11" },
  { rotation: 180, psm: "11" },
];

export type OcrOptions = { attempts?: OcrAttempt[] };

/** Uma leitura é "boa o suficiente" para não tentar outras rotações. */
const GOOD_ENOUGH = { goodChars: 25, meanConfidence: 72 };

function linesOf(page: Page): OcrLine[] {
  return (page.blocks ?? []).flatMap((b) =>
    b.paragraphs.flatMap((p) => p.lines.map((l) => ({ words: l.words.map((w) => ({ text: w.text, confidence: w.confidence })) }))),
  );
}

async function recognizeOnce(worker: Worker, canvas: HTMLCanvasElement) {
  const { data } = await worker.recognize(canvas, { rotateAuto: true }, { text: true, blocks: true });
  const lines = linesOf(data);
  return { lines, raw: data.text, ...scoreLines(lines) };
}

export async function recognizeImage(
  image: Blob,
  language: OcrLanguage,
  onProgress?: (fraction: number) => void,
  options: OcrOptions = {},
): Promise<OcrResult> {
  const { attempts = DEFAULT_ATTEMPTS } = options;
  const canvas = await prepareImage(image);
  const { createWorker, PSM } = await import("tesseract.js");

  let step = 0;
  const report = (p: number) => onProgress?.(Math.min(0.99, (step + p) / attempts.length));
  const worker = await createWorker(language.split("+"), 1, {
    logger: (m) => {
      if (m.status === "recognizing text") report(m.progress);
    },
  });
  try {
    let best: (Awaited<ReturnType<typeof recognizeOnce>> & { rotation: Rotation }) | null = null;
    for (const { rotation, psm } of attempts) {
      await worker.setParameters({
        tessedit_pageseg_mode: psm === "3" ? PSM.AUTO : PSM.SPARSE_TEXT,
        user_defined_dpi: "300",
        preserve_interword_spaces: "1",
      });
      const res = await recognizeOnce(worker, rotateCanvas(canvas, rotation));
      if (!best || res.score > best.score) best = { ...res, rotation };
      step++;
      if (best.goodChars >= GOOD_ENOUGH.goodChars && best.meanConfidence >= GOOD_ENOUGH.meanConfidence) break;
    }
    onProgress?.(1);
    const result = best!;
    return {
      text: cleanLines(result.lines).join("\n"),
      rawText: joinCjk(result.raw).trim(),
      confidence: result.meanConfidence,
      goodChars: result.goodChars,
      rotation: result.rotation,
    };
  } finally {
    await worker.terminate();
  }
}
