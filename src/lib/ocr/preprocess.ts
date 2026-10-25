// Preparação da fotografia antes do OCR (só no navegador):
// - aplica a orientação EXIF (o <img> já a respeita);
// - redimensiona para um tamanho em que o Tesseract lê bem (fotos de 12 MP são
//   lentas e não melhoram a leitura; fotos pequenas ficam ampliadas);
// - converte para tons de cinzento e estica o contraste, para texto claro em
//   faixas coloridas não desaparecer.

const MAX_SIDE = 2400;
const MIN_SIDE = 1400;

// onload em vez de img.decode(): decode() pode ficar pendente para sempre em
// alguns navegadores (incluindo versões do Safari).
function loadImage(blob: Blob): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(blob);
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not load image"));
    };
    img.src = url;
  });
}

/** Escala para que o lado maior fique entre MIN_SIDE e MAX_SIDE. */
export function targetScale(width: number, height: number): number {
  const longest = Math.max(width, height);
  if (longest > MAX_SIDE) return MAX_SIDE / longest;
  if (longest < MIN_SIDE) return Math.min(2, MIN_SIDE / longest);
  return 1;
}

/** Tons de cinzento com estiramento de contraste (percentis 1–99). Altera `data` no lugar. */
export function grayscaleStretch(data: Uint8ClampedArray): void {
  const hist = new Uint32Array(256);
  const n = data.length / 4;
  for (let i = 0; i < data.length; i += 4) {
    const y = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
    data[i] = y;
    hist[y]++;
  }
  let lo = 0;
  let hi = 255;
  for (let acc = 0; lo < 255 && (acc += hist[lo]) < n * 0.01; lo++);
  for (let acc = 0; hi > 0 && (acc += hist[hi]) < n * 0.01; hi--);
  const range = Math.max(1, hi - lo);
  for (let i = 0; i < data.length; i += 4) {
    const v = Math.max(0, Math.min(255, ((data[i] - lo) * 255) / range));
    data[i] = data[i + 1] = data[i + 2] = v;
    data[i + 3] = 255;
  }
}

export async function prepareImage(blob: Blob): Promise<HTMLCanvasElement> {
  const img = await loadImage(blob);
  const scale = targetScale(img.naturalWidth, img.naturalHeight);
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(img.naturalWidth * scale);
  canvas.height = Math.round(img.naturalHeight * scale);
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Canvas not available");
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
  grayscaleStretch(pixels.data);
  ctx.putImageData(pixels, 0, 0);
  return canvas;
}

export function rotateCanvas(src: HTMLCanvasElement, degrees: 0 | 90 | 180 | 270): HTMLCanvasElement {
  if (degrees === 0) return src;
  const out = document.createElement("canvas");
  const swap = degrees !== 180;
  out.width = swap ? src.height : src.width;
  out.height = swap ? src.width : src.height;
  const ctx = out.getContext("2d");
  if (!ctx) throw new Error("Canvas not available");
  ctx.translate(out.width / 2, out.height / 2);
  ctx.rotate((degrees * Math.PI) / 180);
  ctx.drawImage(src, -src.width / 2, -src.height / 2);
  return out;
}

/** Retângulo-guia no ecrã da câmara, em fração da área visível do vídeo. */
export const GUIDE = { width: 0.9, height: 0.62 };

/**
 * Converte o retângulo-guia (desenhado sobre um <video> com object-fit: cover)
 * para pixels do vídeo, para recortar só a caixa e deixar a mesa de fora.
 */
export function guideCrop(videoW: number, videoH: number, boxW: number, boxH: number) {
  const scale = Math.max(boxW / videoW, boxH / videoH);
  const w = (boxW / scale) * GUIDE.width;
  const h = (boxH / scale) * GUIDE.height;
  return { x: (videoW - w) / 2, y: (videoH - h) / 2, w, h };
}
