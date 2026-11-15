import { describe, it, expect } from "vitest";
import { formatPharmaceuticalForm } from "@/lib/format";

describe("formatPharmaceuticalForm", () => {
  it("traduz formas comuns para chinês", () => {
    expect(formatPharmaceuticalForm("Suspensão oral", "zh")).toBe("口服混悬液");
    expect(formatPharmaceuticalForm("Comprimido revestido", "zh")).toBe("片剂");
    expect(formatPharmaceuticalForm("Cápsula", "zh")).toBe("胶囊");
  });

  it("mantém o texto em português", () => {
    expect(formatPharmaceuticalForm("Suspensão oral", "pt")).toBe("Suspensão oral");
  });

  it("devolve o original quando não há correspondência", () => {
    expect(formatPharmaceuticalForm("Forma desconhecida", "zh")).toBe("Forma desconhecida");
  });
});
