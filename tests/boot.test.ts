import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";
import { PREFERENCES_BOOT_SCRIPT } from "@/lib/boot";

function boot(stored: Record<string, string>, languages: string[]) {
  const documentElement = { lang: "pt-PT", dataset: {} as Record<string, string> };
  runInNewContext(PREFERENCES_BOOT_SCRIPT, {
    localStorage: { getItem: (k: string) => stored[k] ?? null },
    navigator: { languages, language: languages[0] },
    document: { documentElement },
  });
  return documentElement;
}

describe("script de arranque", () => {
  it("sem escolha guardada segue o idioma do telemóvel", () => {
    expect(boot({}, ["zh-Hans-PT"]).lang).toBe("zh-CN");
    expect(boot({}, ["pt-PT"]).lang).toBe("pt-PT");
  });
  it("a escolha guardada tem prioridade", () => {
    expect(boot({ "mp.locale": "pt" }, ["zh-CN"]).lang).toBe("pt-PT");
    expect(boot({ "mp.locale": "zh" }, ["pt-PT"]).lang).toBe("zh-CN");
  });
  it("continua a aplicar o tamanho do texto", () => {
    expect(boot({ "mp.textSize": "large" }, ["pt-PT"]).dataset.textSize).toBe("large");
  });
});
