import { describe, expect, it } from "vitest";
import { createAi } from "../server/ai.mjs";

const SECTIONS = ["purpose", "howToTake", "missedDose", "sideEffects", "warnings", "storage"];
const good = {
  legible: true,
  zh: { purpose: ["用于退烧和止痛。"], howToTake: ["每次 1 片，一天最多 4 次。"], missedDose: [], sideEffects: ["少见：皮疹。"], warnings: ["肝病患者请先问医生。"], storage: ["放在 25°C 以下。"] },
  pt: { purpose: ["Utilizado para a febre e a dor."], howToTake: ["1 comprimido, no máximo 4 vezes por dia."], missedDose: [], sideEffects: ["Raro: erupção cutânea."], warnings: ["Doentes do fígado: fale com o médico."], storage: ["Conservar abaixo de 25°C."] },
};

function fakeFetch(reply: unknown, status = 200) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fn = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return new Response(JSON.stringify(reply), { status });
  }) as unknown as typeof fetch;
  return { fn, calls };
}
const anthropicReply = (text: string) => ({ content: [{ type: "text", text }] });

describe("serviço de IA (folheto → chinês)", () => {
  it("traduz texto colado e devolve as seis secções em chinês e português", async () => {
    const f = fakeFetch(anthropicReply(JSON.stringify(good)));
    const ai = createAi({ apiKey: "test-key", fetchFn: f.fn });
    const r = await ai.leaflet({ text: "Folheto informativo: Ben-u-ron 500 mg ..." });
    expect(r.status).toBe(200);
    expect(r.body.zh.howToTake).toEqual(["每次 1 片，一天最多 4 次。"]);
    expect(r.body.pt.purpose).toEqual(["Utilizado para a febre e a dor."]);
    expect(Object.keys(r.body.zh).sort()).toEqual([...SECTIONS].sort());
    expect(f.calls).toHaveLength(1);
    const sent = JSON.parse(String(f.calls[0].init.body));
    expect(sent.system).toContain("Simplified Chinese");
    expect(JSON.stringify(sent.messages)).toContain("Ben-u-ron 500 mg");
    expect((f.calls[0].init.headers as Record<string, string>)["x-api-key"]).toBe("test-key");
  });

  it("envia as fotografias como blocos de imagem", async () => {
    const f = fakeFetch(anthropicReply(JSON.stringify(good)));
    const ai = createAi({ apiKey: "k", fetchFn: f.fn });
    await ai.leaflet({ images: [{ mediaType: "image/jpeg", data: "QUJD" }] });
    const sent = JSON.parse(String(f.calls[0].init.body));
    const blocks = sent.messages[0].content;
    expect(blocks.some((b: { type: string; source?: { media_type: string; data: string } }) => b.type === "image" && b.source?.media_type === "image/jpeg" && b.source.data === "QUJD")).toBe(true);
  });

  it("aceita JSON dentro de cercas de código", async () => {
    const f = fakeFetch(anthropicReply("```json\n" + JSON.stringify(good) + "\n```"));
    const r = await createAi({ apiKey: "k", fetchFn: f.fn }).leaflet({ text: "x".repeat(50) });
    expect(r.status).toBe(200);
  });

  it("limita o número e o tamanho das linhas e ignora lixo", async () => {
    const huge = { legible: true, zh: { ...good.zh, sideEffects: Array.from({ length: 40 }, (_, i) => `efeito ${i} ` + "字".repeat(600)), warnings: ["ok", 5, null, "  "] }, pt: good.pt };
    const r = await createAi({ apiKey: "k", fetchFn: fakeFetch(anthropicReply(JSON.stringify(huge))).fn }).leaflet({ text: "x".repeat(50) });
    expect(r.body.zh.sideEffects.length).toBeLessThanOrEqual(12);
    expect(r.body.zh.sideEffects[0].length).toBeLessThanOrEqual(400);
    expect(r.body.zh.warnings).toEqual(["ok"]);
  });

  it("devolve 'não legível' sem inventar conteúdo", async () => {
    const empty = { legible: false, zh: {}, pt: {} };
    const r = await createAi({ apiKey: "k", fetchFn: fakeFetch(anthropicReply(JSON.stringify(empty))).fn }).leaflet({ text: "x".repeat(50) });
    expect(r.status).toBe(200);
    expect(r.body.legible).toBe(false);
    expect(r.body.zh.purpose).toEqual([]);
  });

  it("erros: pedido inválido 400, resposta da IA inválida 502, falha do serviço 502, sem chave 503", async () => {
    const ok = fakeFetch(anthropicReply(JSON.stringify(good)));
    const ai = createAi({ apiKey: "k", fetchFn: ok.fn });
    expect((await ai.leaflet({})).status).toBe(400);
    expect((await ai.leaflet({ images: [{ mediaType: "application/pdf", data: "QUJD" }] })).status).toBe(400);
    expect((await ai.leaflet({ images: Array.from({ length: 7 }, () => ({ mediaType: "image/jpeg", data: "QUJD" })) })).status).toBe(400);
    expect((await ai.leaflet({ text: "x".repeat(40_000) })).status).toBe(400);
    expect(ok.calls).toHaveLength(0); // nada foi enviado ao serviço
    expect((await createAi({ apiKey: "k", fetchFn: fakeFetch(anthropicReply("não é json")).fn }).leaflet({ text: "x".repeat(50) })).status).toBe(502);
    expect((await createAi({ apiKey: "k", fetchFn: fakeFetch({ error: "boom" }, 500).fn }).leaflet({ text: "x".repeat(50) })).status).toBe(502);
    expect(createAi({ apiKey: "", fetchFn: ok.fn }).enabled).toBe(false);
  });

  it("limita os pedidos por hora", async () => {
    let t = 1_000_000;
    const ai = createAi({ apiKey: "k", fetchFn: fakeFetch(anthropicReply(JSON.stringify(good))).fn, hourlyLimit: 2, now: () => t });
    const body = { text: "x".repeat(50) };
    expect((await ai.leaflet(body)).status).toBe(200);
    expect((await ai.leaflet(body)).status).toBe(200);
    expect((await ai.leaflet(body)).status).toBe(429);
    t += 3_600_001;
    expect((await ai.leaflet(body)).status).toBe(200);
  });
});

describe("serviço de IA (fotografia da caixa)", () => {
  const photo = { image: { mediaType: "image/jpeg", data: "QUJD" } };
  const reply = (o: unknown) => fakeFetch(anthropicReply(JSON.stringify(o)));

  it("devolve os campos lidos e quais estão duvidosos", async () => {
    const f = reply({ legible: true, name: " Ben-u-ron ", activeSubstance: "Paracetamol", strength: "500 mg", form: "Comprimido", packCount: "20", expiry: null, manufacturer: "Bial", ean: "5601234567890", uncertain: ["strength", "banana"] });
    const r = await createAi({ apiKey: "k", fetchFn: f.fn }).box(photo);
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ legible: true, fields: { name: "Ben-u-ron", activeSubstance: "Paracetamol", strength: "500 mg", form: "Comprimido", packCount: "20", manufacturer: "Bial", ean: "5601234567890" }, uncertain: ["strength"] });
    const sent = JSON.parse(String(f.calls[0].init.body));
    expect(sent.messages[0].content[0]).toMatchObject({ type: "image", source: { type: "base64", media_type: "image/jpeg", data: "QUJD" } });
  });

  it("descarta um EAN que não tem 13 algarismos e corta textos longos", async () => {
    const r = await createAi({ apiKey: "k", fetchFn: reply({ legible: true, name: "X".repeat(300), ean: "12345" }).fn }).box(photo);
    expect(r.body.fields.ean).toBeUndefined();
    expect(r.body.fields.name.length).toBeLessThanOrEqual(120);
  });

  it("caixa ilegível: sem campos", async () => {
    const r = await createAi({ apiKey: "k", fetchFn: reply({ legible: false, name: "inventado" }).fn }).box(photo);
    expect(r.body).toEqual({ legible: false, fields: {}, uncertain: [] });
  });

  it("valida o pedido e partilha o limite por hora com o folheto", async () => {
    const ok = reply({ legible: true, name: "A" });
    const ai = createAi({ apiKey: "k", fetchFn: ok.fn, hourlyLimit: 1 });
    expect((await ai.box({})).status).toBe(400);
    expect((await ai.box({ image: { mediaType: "image/gif", data: "QUJD" } })).status).toBe(400);
    expect(ok.calls).toHaveLength(0);
    expect((await ai.box(photo)).status).toBe(200);
    expect((await ai.leaflet({ text: "x".repeat(50) })).status).toBe(429);
  });
});
