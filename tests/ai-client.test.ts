import { describe, expect, it } from "vitest";
import { aiAvailable, findInstructions, readBoxPhoto, translateLeaflet } from "@/lib/ai";
import { HttpError } from "@/lib/sync/nas";

const result = { legible: true, zh: { purpose: ["用于退烧。"] }, pt: { purpose: ["Para a febre."] } };

function fakeFetch(reply: unknown, status = 200) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fn = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return new Response(JSON.stringify(reply), { status });
  }) as unknown as typeof fetch;
  return { fn, calls };
}

describe("cliente de IA", () => {
  it("aiAvailable: verdadeiro só se /api/health disser ai: true", async () => {
    expect(await aiAvailable("", fakeFetch({ ok: true, ai: true }).fn)).toBe(true);
    expect(await aiAvailable("", fakeFetch({ ok: true, ai: false }).fn)).toBe(false);
    expect(await aiAvailable("", fakeFetch({ ok: true }, 500).fn)).toBe(false);
    const broken = (async () => {
      throw new Error("offline");
    }) as unknown as typeof fetch;
    expect(await aiAvailable("", broken)).toBe(false);
  });

  it("translateLeaflet envia o código, o caminho e o corpo JSON", async () => {
    const f = fakeFetch(result);
    const r = await translateLeaflet({ text: "x".repeat(30) }, { fetchFn: f.fn }, "abc-code");
    expect(r).toEqual(result);
    expect(f.calls[0].url).toBe("/api/ai/leaflet");
    expect(f.calls[0].init.method).toBe("POST");
    expect((f.calls[0].init.headers as Record<string, string>).Authorization).toBe("Bearer abc-code");
    expect(JSON.parse(String(f.calls[0].init.body))).toEqual({ text: "x".repeat(30) });
  });

  it("sem código rejeita com not_connected", async () => {
    await expect(translateLeaflet({ text: "x".repeat(30) }, { fetchFn: fakeFetch(result).fn }, null)).rejects.toThrow("not_connected");
  });

  it("uma resposta 503 rejeita com HttpError 503", async () => {
    const err = await translateLeaflet({ text: "x".repeat(30) }, { fetchFn: fakeFetch({ error: "ai_disabled" }, 503).fn }, "c").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(HttpError);
    expect((err as HttpError).status).toBe(503);
  });
});

describe("cliente de IA (caixa)", () => {
  const image = { mediaType: "image/jpeg", data: "QUJD" };
  const box = { legible: true, fields: { name: "Ben-u-ron" }, uncertain: ["name"] };

  it("readBoxPhoto envia o código, o caminho e a imagem", async () => {
    const f = fakeFetch(box);
    const r = await readBoxPhoto(image, { fetchFn: f.fn }, "abc-code");
    expect(r).toEqual(box);
    expect(f.calls[0].url).toBe("/api/ai/box");
    expect(f.calls[0].init.method).toBe("POST");
    expect((f.calls[0].init.headers as Record<string, string>).Authorization).toBe("Bearer abc-code");
    expect(JSON.parse(String(f.calls[0].init.body))).toEqual({ image });
  });

  it("sem código rejeita com not_connected", async () => {
    await expect(readBoxPhoto(image, { fetchFn: fakeFetch(box).fn }, null)).rejects.toThrow("not_connected");
  });

  it("uma resposta 503 rejeita com HttpError 503", async () => {
    const err = await readBoxPhoto(image, { fetchFn: fakeFetch({ error: "ai_disabled" }, 503).fn }, "c").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(HttpError);
    expect((err as HttpError).status).toBe(503);
  });
});

describe("cliente de IA (instruções)", () => {
  const input = { name: "Atovaquona Kabi", activeSubstance: "Atovaquona", strength: "750 mg/5 ml", form: "Suspensão oral" };
  const found = {
    found: true,
    zh: { purpose: ["用于预防肺炎。"] },
    pt: { purpose: ["Previne a pneumonia."] },
    en: { purpose: ["Prevents pneumonia."] },
    sourceName: "DailyMed / US FDA drug label (ATOVAQUONE)",
    sourceUrl: "https://dailymed.nlm.nih.gov/dailymed/lookup.cfm?setid=03ddcc33-729c-4d46-ae6b-2ee47978ba16",
  };

  it("findInstructions envia o código, o caminho e o corpo JSON", async () => {
    const f = fakeFetch(found);
    expect(await findInstructions(input, { fetchFn: f.fn }, "abc-code")).toEqual(found);
    expect(f.calls[0].url).toBe("/api/ai/instructions");
    expect(f.calls[0].init.method).toBe("POST");
    expect((f.calls[0].init.headers as Record<string, string>).Authorization).toBe("Bearer abc-code");
    expect(JSON.parse(String(f.calls[0].init.body))).toEqual(input);
  });

  it("devolve found false tal como veio", async () => {
    expect(await findInstructions(input, { fetchFn: fakeFetch({ found: false }).fn }, "c")).toEqual({ found: false });
  });

  it("sem código rejeita com not_connected", async () => {
    await expect(findInstructions(input, { fetchFn: fakeFetch(found).fn }, null)).rejects.toThrow("not_connected");
  });

  it("uma resposta 503 rejeita com HttpError 503", async () => {
    const err = await findInstructions(input, { fetchFn: fakeFetch({ error: "ai_disabled" }, 503).fn }, "c").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(HttpError);
    expect((err as HttpError).status).toBe(503);
  });
});
