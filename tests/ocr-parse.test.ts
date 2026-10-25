import { describe, expect, it } from "vitest";
import { bestSearchTerm, isUnclear, parseBoxText } from "@/lib/ocr/parse";

describe("leitura do texto da caixa", () => {
  it("encontra nome, dosagem, forma, quantidade, validade e fabricante", () => {
    const text = ["BEN-U-RON", "Ben-u-ron 500 mg comprimidos", "Paracetamol", "20 comprimidos", "VAL: 05/2027", "Bene Farmacêutica, Lda."].join("\n");
    const p = parseBoxText(text);
    expect(p.name).toBe("Ben-u-ron");
    expect(p.strength).toBe("500 mg");
    expect(p.form).toBe("Comprimido");
    expect(p.packCount).toBe("20");
    expect(p.expiry).toBe("05/2027");
    expect(p.activeSubstance).toBe("Paracetamol");
    expect(p.manufacturer).toContain("Lda");
    expect(bestSearchTerm(p)).toBe("Ben-u-ron");
  });

  it("lê caixas em chinês", () => {
    const p = parseBoxText("阿莫西林胶囊\n0.25g\n24粒\n有效期至 2027-06\n某某制药有限公司");
    expect(p.strength).toBe("0.25 g");
    expect(p.form).toBe("胶囊");
    expect(p.packCount).toBe("24");
    expect(p.expiry).toBe("2027-06");
  });

  it("deteta leituras pouco claras", () => {
    expect(isUnclear("~ |", 90)).toBe(true);
    expect(isUnclear("Paracetamol 500 mg", 30)).toBe(true);
    expect(isUnclear("Paracetamol 500 mg", 80)).toBe(false);
  });
});
