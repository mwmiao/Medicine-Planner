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
  it("sem escolha guardada é chinês, mesmo com o telemóvel em português", () => {
    expect(boot({}, ["pt-PT"]).lang).toBe("zh-CN");
  });
  it("com armazenamento a falhar é chinês e não lança erro", () => {
    const documentElement = { lang: "pt-PT", dataset: {} as Record<string, string> };
    const run = () =>
      runInNewContext(PREFERENCES_BOOT_SCRIPT, {
        localStorage: {
          getItem: () => {
            throw new Error("bloqueado");
          },
        },
        navigator: { languages: ["pt-PT"], language: "pt-PT" },
        document: { documentElement },
      });
    expect(run).not.toThrow();
    expect(documentElement.lang).toBe("zh-CN");
  });
  it("a escolha guardada tem prioridade", () => {
    expect(boot({ "mp.locale": "pt" }, ["zh-CN"]).lang).toBe("pt-PT");
    expect(boot({ "mp.locale": "zh" }, ["pt-PT"]).lang).toBe("zh-CN");
  });
  it("continua a aplicar o tamanho do texto", () => {
    expect(boot({ "mp.textSize": "large" }, ["pt-PT"]).dataset.textSize).toBe("large");
  });
});
