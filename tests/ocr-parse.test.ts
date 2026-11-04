import { describe, expect, it } from "vitest";
import { bestSearchTerm, isUnclear, parseBoxText, parseOcr, uncertainFields } from "@/lib/ocr/parse";

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

  it("separa o fabricante do lote/validade e limpa pontuação solta", () => {
    const p = parseBoxText(["ben-u-ron", "500 mg comprimidos", "Paracetamol!", "Lote: 23B417 VAL: 05/2027 Bene Farmacêutica, Lda."].join("\n"));
    expect(p.activeSubstance).toBe("Paracetamol");
    expect(p.manufacturer).toBe("Bene Farmacêutica, Lda.");
    expect(p.expiry).toBe("05/2027");
  });

  it("recupera a dosagem do texto completo quando o 'mg' foi descartado", () => {
    const clean = ["ben-u-ron", "500 comprimidos", "Paracetamol", "20 comprimidos", "Lote: 23B417 VAL: 05/2027"].join("\n");
    const raw = ["ben-u-ron", "500 mg comprimidos", "Paracetamol!", "20 comprimidos", "Lote: 23B417 VAL: 05/2027"].join("\n");
    const p = parseOcr(clean, raw);
    expect(p.strength).toBe("500 mg");
    expect(p.packCount).toBe("20");
    expect(p.activeSubstance).toBe("Paracetamol");
    expect(parseBoxText(clean).packCount).toBe("20");
    expect(parseBoxText(clean).activeSubstance).toBe("Paracetamol");
  });

  it("mantém o nome como está escrito na caixa e lê o EAN por baixo das barras", () => {
    const p = parseBoxText(["BRUFEN", "Ibuprofeno 400 mg", "Comprimidos revestidos por película", "20 comprimidos", "5 601234 567892"].join("\n"));
    expect(p.name).toBe("BRUFEN");
    expect(p.activeSubstance).toBe("Ibuprofeno");
    expect(p.form).toBe("Comprimido revestido");
    expect(p.ean).toBe("5601234567892");
    // Números com dígito de controlo errado não são aceites como EAN.
    expect(parseBoxText("5601234567890").ean).toBeUndefined();
  });

  it("preserva acentos portugueses", () => {
    const p = parseBoxText(["Ácido Acetilsalicílico 100 mg", "Solução oral"].join("\n"));
    expect(p.name).toBe("Ácido Acetilsalicílico");
    expect(p.form).toBe("Solução oral");
  });

  it("deteta leituras pouco claras", () => {
    expect(isUnclear("~ |", 90)).toBe(true);
    expect(isUnclear("Paracetamol 500 mg", 30)).toBe(true);
    expect(isUnclear("Paracetamol 500 mg", 80)).toBe(false);
  });
});

describe("campos a confirmar", () => {
  it("marca campos que só vieram do texto pouco confiante", () => {
    const clean = "Ben-u-ron\n500 mg comprimidos";
    const fields = { name: "Ben-u-ron", strength: "500 mg", form: "Comprimido", expiry: "03/2027", ean: "5601234567890" };
    expect(uncertainFields({ form: "Comprimido revestido" }, "20 comprimidos revestidos", 90).size).toBe(0);
    const u = uncertainFields(fields, clean, 88, "5601234567890");
    expect([...u]).toEqual(["expiry"]);
  });

  it("marca todos os campos lidos quando a confiança geral é baixa (exceto o código de barras)", () => {
    const u = uncertainFields({ name: "Brufen", ean: "5601234567890" }, "Brufen", 50, "5601234567890");
    expect([...u]).toEqual(["name"]);
  });

  it("ignora campos vazios e EAN só lido por OCR é para confirmar", () => {
    const u = uncertainFields({ name: "", ean: "5601234567890" }, "5601234567890", 90);
    expect(u.size).toBe(0);
    expect(uncertainFields({ ean: "5601234567890" }, "", 90).has("ean")).toBe(true);
  });
});
