import { describe, expect, it } from "vitest";
import { cleanLines, comparable, looksLikeText, scoreLines } from "@/lib/ocr/clean";
import { grayscaleStretch, guideCrop, targetScale } from "@/lib/ocr/preprocess";

describe("limpeza do OCR", () => {
  it("descarta lixo de logótipos e palavras com pouca confiança", () => {
    const lines = cleanLines([
      { words: [{ text: "ben-u-ron", confidence: 92 }] },
      { words: [{ text: "~|:", confidence: 95 }, { text: "e", confidence: 70 }, { text: "SST)", confidence: 30 }] },
      { words: [{ text: "500", confidence: 90 }, { text: "mg", confidence: 88 }, { text: "Ç%#", confidence: 20 }] },
    ]);
    expect(lines).toEqual(["ben-u-ron", "500 mg"]);
    // Só alfabeto latino: caracteres de outros alfabetos são ruído; acentos portugueses mantêm-se.
    expect(looksLikeText("阿莫西林")).toBe(false);
    expect(looksLikeText("Solução")).toBe(true);
    expect(looksLikeText("Ibuprofeno®")).toBe(true);
    expect(cleanLines([{ words: [{ text: "Solução", confidence: 90 }, { text: "oral", confidence: 88 }, { text: "片", confidence: 95 }] }])).toEqual(["Solução oral"]);
    expect(comparable("  ácido   acetilsalicílico ")).toBe("ÁCIDO ACETILSALICÍLICO");
    expect(looksLikeText("=")).toBe(false);
  });

  it("dá mais pontos a leituras com texto real e confiante", () => {
    const good = scoreLines([{ words: [{ text: "Paracetamol", confidence: 90 }] }]);
    const garbage = scoreLines([{ words: [{ text: "ep]", confidence: 40 }, { text: "BonNgo", confidence: 35 }] }]);
    expect(good.score).toBeGreaterThan(garbage.score);
    expect(garbage.goodChars).toBe(0);
  });
});

describe("preparação da imagem", () => {
  it("reduz fotos enormes e amplia fotos pequenas", () => {
    expect(targetScale(4032, 3024)).toBeCloseTo(2400 / 4032);
    expect(targetScale(640, 480)).toBe(2); // ampliação limitada a 2x
    expect(targetScale(1000, 800)).toBeCloseTo(1.4);
    expect(targetScale(1800, 1200)).toBe(1);
  });

  it("estica o contraste de uma imagem desbotada", () => {
    const px = new Uint8ClampedArray([100, 100, 100, 255, 150, 150, 150, 255]);
    grayscaleStretch(px);
    expect(px[0]).toBe(0);
    expect(px[4]).toBe(255);
  });

  it("recorta o retângulo-guia em pixels do vídeo (object-fit: cover)", () => {
    // Vídeo 1920x1080 (paisagem) mostrado num quadro 300x400 (retrato): só se vê o centro.
    const c = guideCrop(1920, 1080, 300, 400);
    expect(c.h).toBeCloseTo(1080 * 0.62);
    expect(c.w).toBeCloseTo(1080 * (300 / 400) * 0.9);
    expect(c.x + c.w / 2).toBeCloseTo(960);
  });
});
