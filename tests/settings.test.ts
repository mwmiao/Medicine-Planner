import { afterEach, describe, expect, it } from "vitest";
import { getLocale } from "@/lib/settings";

function stubStorage(value: string | null) {
  (globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (k: string) => (k === "mp.locale" ? value : null),
  };
}

describe("idioma por omissão", () => {
  afterEach(() => {
    delete (globalThis as { localStorage?: unknown }).localStorage;
  });
  it("sem armazenamento é chinês", () => {
    expect(getLocale()).toBe("zh");
  });
  it("a escolha guardada 'pt' tem prioridade", () => {
    stubStorage("pt");
    expect(getLocale()).toBe("pt");
  });
  it("a escolha guardada 'zh' dá chinês", () => {
    stubStorage("zh");
    expect(getLocale()).toBe("zh");
  });
  it("um valor desconhecido dá chinês", () => {
    stubStorage("en");
    expect(getLocale()).toBe("zh");
  });
});
