// Leitura de códigos de barras na fotografia da caixa, no próprio telemóvel
// (biblioteca gratuita @zxing). Prioridade: EAN-13; também DataMatrix GS1.

import { rotateCanvas } from "../ocr/preprocess";
import { parseGs1, validGtin, type BarcodeInfo } from "./gs1";

export async function decodeBarcode(canvas: HTMLCanvasElement): Promise<BarcodeInfo | null> {
  const [{ BrowserMultiFormatReader }, { BarcodeFormat, DecodeHintType }] = await Promise.all([
    import("@zxing/browser"),
    import("@zxing/library"),
  ]);
  const formats = [BarcodeFormat.EAN_13, BarcodeFormat.DATA_MATRIX, BarcodeFormat.EAN_8, BarcodeFormat.CODE_128];
  const hints = new Map<number, unknown>([
    [DecodeHintType.POSSIBLE_FORMATS, formats],
    [DecodeHintType.TRY_HARDER, true],
  ]);
  const reader = new BrowserMultiFormatReader(hints);
  // Códigos 1D precisam das barras na horizontal: tenta também a imagem rodada.
  for (const rotation of [0, 90] as const) {
    try {
      const result = reader.decodeFromCanvas(rotateCanvas(canvas, rotation));
      const raw = result.getText();
      const f = result.getBarcodeFormat();
      if (f === BarcodeFormat.EAN_13 || f === BarcodeFormat.EAN_8) {
        return { raw, format: f === BarcodeFormat.EAN_13 ? "EAN_13" : "EAN_8", ean: f === BarcodeFormat.EAN_13 && validGtin(raw) ? raw : undefined };
      }
      if (f === BarcodeFormat.DATA_MATRIX) return { raw, format: "DATA_MATRIX", ...parseGs1(raw) };
      return { raw, format: f === BarcodeFormat.CODE_128 ? "CODE_128" : "OTHER", ...parseGs1(raw) };
    } catch {
      // não encontrado nesta orientação
    }
  }
  return null;
}
