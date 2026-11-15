import { describe, expect, it } from "vitest";
import { localeFromLanguages } from "@/lib/settings";

describe("idioma por omissão a partir do telemóvel", () => {
  it("escolhe chinês quando o primeiro idioma é chinês", () => {
    expect(localeFromLanguages(["zh-Hans-PT", "pt-PT"])).toBe("zh");
    expect(localeFromLanguages(["zh-CN"])).toBe("zh");
    expect(localeFromLanguages(["ZH"])).toBe("zh");
  });
  it("escolhe português nos outros casos", () => {
    expect(localeFromLanguages(["pt-PT", "zh-CN"])).toBe("pt");
    expect(localeFromLanguages(["en-US"])).toBe("pt");
    expect(localeFromLanguages([])).toBe("pt");
    expect(localeFromLanguages([""])).toBe("pt");
  });
});
