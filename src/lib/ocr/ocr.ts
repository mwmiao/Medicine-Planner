// OCR no próprio navegador com Tesseract.js. O reconhecimento corre num Web
// Worker criado pela biblioteca, por isso a interface não bloqueia. A imagem
// nunca sai do telemóvel. Os ficheiros de idioma (por, chi_sim) são
// descarregados na primeira utilização e ficam em cache pelo service worker.

export type OcrLanguage = "por" | "chi_sim" | "por+chi_sim";

export type OcrResult = { text: string; confidence: number };

export async function recognizeImage(
  image: Blob,
  language: OcrLanguage,
  onProgress?: (fraction: number) => void,
): Promise<OcrResult> {
  const { createWorker } = await import("tesseract.js");
  const worker = await createWorker(language.split("+"), 1, {
    logger: (m) => {
      if (m.status === "recognizing text" && onProgress) onProgress(m.progress);
    },
  });
  try {
    const { data } = await worker.recognize(image);
    return { text: data.text, confidence: data.confidence };
  } finally {
    await worker.terminate();
  }
}
