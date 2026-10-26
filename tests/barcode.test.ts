import { describe, expect, it } from "vitest";
import { eanFromText, gtinToEan13, parseGs1, validGtin } from "@/lib/barcode/gs1";

describe("códigos de barras", () => {
  it("valida o dígito de controlo do EAN-13", () => {
    expect(validGtin("5601234567892")).toBe(true);
    expect(validGtin("5601234567890")).toBe(false);
    expect(validGtin("4006381333931")).toBe(true);
    expect(validGtin("abc")).toBe(false);
  });

  it("converte GTIN-14 com zero à esquerda em EAN-13", () => {
    expect(gtinToEan13("05601234567892")).toBe("5601234567892");
    expect(gtinToEan13("15601234567899")).toBeUndefined();
  });

  it("lê o DataMatrix GS1 das caixas (GTIN, validade, lote, série)", () => {
    const gs = "\u001d";
    const p = parseGs1(`]d201056012345678921727123110AB12C${gs}21XYZ987`);
    expect(p).toEqual({ ean: "5601234567892", expiry: "12/2027", batch: "AB12C", serial: "XYZ987" });
    expect(parseGs1("(01)05601234567892(17)270630(10)L123")).toEqual({ ean: "5601234567892", expiry: "06/2027", batch: "L123" });
  });

  it("encontra o EAN nos números lidos por OCR, com ou sem espaços", () => {
    expect(eanFromText("Lote 23B417\n5 601234 567892")).toBe("5601234567892");
    expect(eanFromText("Registo nº 1234567")).toBeUndefined();
  });
});
