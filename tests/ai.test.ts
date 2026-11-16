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

describe("serviço de IA (instruções a partir da etiqueta pública)", () => {
  const label = {
    set_id: "03ddcc33-729c-4d46-ae6b-2ee47978ba16",
    indications_and_usage: ["Atovaquone oral suspension is indicated for the prevention of Pneumocystis jirovecii pneumonia."],
    dosage_and_administration: ["Take 1,500 mg (10 mL) once daily with food."],
    contraindications: ["Hypersensitivity to atovaquone."],
    warnings_and_cautions: ["Take with food to improve absorption."],
    adverse_reactions: ["Most common: rash, nausea, diarrhea."],
    how_supplied: ["Store at 15 to 25 C. Do not freeze."],
    information_for_patients: ["Shake the bottle well before use."],
    openfda: { generic_name: ["ATOVAQUONE"], substance_name: ["ATOVAQUONE"], brand_name: ["ATOVAQUONE"] },
  };
  const secs = (purpose: string[]) => ({ purpose, howToTake: [], missedDose: [], sideEffects: [], warnings: [], storage: [] });
  const out = { legible: true, zh: secs(["用于预防肺孢子菌肺炎。"]), pt: secs(["Previne a pneumonia por Pneumocystis."]), en: secs(["Prevents Pneumocystis pneumonia."]) };
  const input = { name: "Atovaquona Kabi", activeSubstance: "Atovaquona", strength: "750 mg/5 ml", form: "Suspensão oral" };

  /** Responde por URL: a Anthropic consome a fila; o openFDA devolve o JSON (ou erro). */
  function routedFetch({ anthropic, fda, fdaStatus = 200, fdaThrows = false }: { anthropic: unknown[]; fda?: unknown; fdaStatus?: number; fdaThrows?: boolean }) {
    const calls: { url: string; init: RequestInit }[] = [];
    const queue = [...anthropic];
    const fn = (async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      if (url.startsWith("https://api.anthropic.com/v1/messages")) return new Response(JSON.stringify(queue.shift()), { status: 200 });
      if (url.startsWith("https://api.fda.gov/drug/label.json")) {
        if (fdaThrows) throw new Error("offline");
        return new Response(JSON.stringify(fda), { status: fdaStatus });
      }
      throw new Error("URL inesperado: " + url);
    }) as unknown as typeof fetch;
    return {
      fn,
      calls,
      anthropicCalls: () => calls.filter((c) => c.url.startsWith("https://api.anthropic.com")),
      fdaCalls: () => calls.filter((c) => c.url.startsWith("https://api.fda.gov")),
    };
  }
  const inn = (...names: string[]) => anthropicReply(JSON.stringify({ inn: names }));

  it("caminho feliz: devolve chinês, inglês e a fonte construída pelo servidor", async () => {
    const f = routedFetch({ anthropic: [inn("atovaquone"), anthropicReply(JSON.stringify({ ...out, nameZh: "阿托伐醌" }))], fda: { results: [label] } });
    const r = await createAi({ apiKey: "k", fetchFn: f.fn }).instructions(input);
    expect(r.status).toBe(200);
    expect(r.body.found).toBe(true);
    expect(r.body.nameZh).toBe("阿托伐醌");
    expect(r.body.zh.purpose).toEqual(["用于预防肺孢子菌肺炎。"]);
    expect(r.body.en).toBeDefined();
    expect(r.body.pt.purpose).toEqual(["Previne a pneumonia por Pneumocystis."]);
    expect(r.body.sourceUrl).toBe("https://dailymed.nlm.nih.gov/dailymed/lookup.cfm?setid=03ddcc33-729c-4d46-ae6b-2ee47978ba16");
    expect(r.body.sourceName).toContain("FDA");
    const second = JSON.parse(String(f.anthropicCalls()[1].init.body));
    expect(JSON.stringify(second.messages)).toContain("once daily with food");
    expect(second.system).toContain("Simplified Chinese");
    expect(second.system).toContain("European Portuguese");
    expect(second.system).toContain("US");
  });

  it("nameZh: omitido se ausente, demasiado longo ou com caracteres estranhos", async () => {
    for (const nameZh of [undefined, "阿".repeat(25), "阿<托>", "阿\n托"]) {
      const f = routedFetch({ anthropic: [inn("atovaquone"), anthropicReply(JSON.stringify({ ...out, nameZh }))], fda: { results: [label] } });
      const r = await createAi({ apiKey: "k", fetchFn: f.fn }).instructions(input);
      expect(r.body.found).toBe(true);
      expect(r.body.nameZh).toBeUndefined();
    }
  });

  it("o URL do openFDA é correto e seguro", async () => {
    const f = routedFetch({ anthropic: [inn("atovaquone"), anthropicReply(JSON.stringify(out))], fda: { results: [label] } });
    await createAi({ apiKey: "k", fetchFn: f.fn }).instructions(input);
    const url = f.fdaCalls()[0].url;
    expect(url).toContain("openfda.generic_name");
    expect(url).toContain("atovaquone");
    expect(new URL(url).searchParams.get("search")).toBe('openfda.generic_name:"atovaquone"');
    expect(url.split("?")[1]).not.toMatch(/["\s;]/);

    const g = routedFetch({ anthropic: [inn('x" OR a:b;\n'), anthropicReply(JSON.stringify(out))], fda: { results: [label] } });
    await createAi({ apiKey: "k", fetchFn: g.fn }).instructions(input);
    for (const c of g.fdaCalls()) {
      const s = new URL(c.url).searchParams.get("search") ?? "";
      expect(s.slice(s.indexOf(":") + 1).slice(1, -1)).not.toMatch(/["\n;:]/);
    }
  });

  it("sem etiqueta: found false e uma só chamada à Anthropic", async () => {
    const f = routedFetch({ anthropic: [inn("atovaquone")], fda: { error: { code: "NOT_FOUND" } }, fdaStatus: 404 });
    const r = await createAi({ apiKey: "k", fetchFn: f.fn }).instructions(input);
    expect(r).toEqual({ status: 200, body: { found: false } });
    expect(f.anthropicCalls()).toHaveLength(1);

    const g = routedFetch({ anthropic: [inn()], fda: { results: [label] } });
    const r2 = await createAi({ apiKey: "k", fetchFn: g.fn }).instructions(input);
    expect(r2).toEqual({ status: 200, body: { found: false } });
    expect(g.fdaCalls()).toHaveLength(0);
  });

  it("o URL da fonte nunca vem da Claude", async () => {
    const evil = { ...out, sourceUrl: "https://evil.example", sourceName: "Evil" };
    const f = routedFetch({ anthropic: [inn("atovaquone"), anthropicReply(JSON.stringify(evil))], fda: { results: [label] } });
    const r = await createAi({ apiKey: "k", fetchFn: f.fn }).instructions(input);
    expect(r.body.sourceUrl).toContain("dailymed.nlm.nih.gov");
    expect(r.body.sourceUrl).not.toContain("evil");
    expect(r.body.sourceName).not.toContain("Evil");
  });

  it("escolhe a etiqueta mais completa", async () => {
    const poor = { set_id: "11111111-1111-1111-1111-111111111111", indications_and_usage: ["POOR LABEL TEXT"], openfda: { generic_name: ["ATOVAQUONE"] } };
    const f = routedFetch({ anthropic: [inn("atovaquone"), anthropicReply(JSON.stringify(out))], fda: { results: [poor, label] } });
    const r = await createAi({ apiKey: "k", fetchFn: f.fn }).instructions(input);
    const second = JSON.stringify(JSON.parse(String(f.anthropicCalls()[1].init.body)).messages);
    expect(second).toContain("once daily with food");
    expect(second).not.toContain("POOR LABEL TEXT");
    expect(r.body.sourceUrl).toContain(label.set_id);
  });

  it("erros: openFDA 500 ou rede → 502; pedido inválido → 400 sem chamadas; limite partilhado", async () => {
    const f = routedFetch({ anthropic: [inn("atovaquone")], fda: {}, fdaStatus: 500 });
    expect(await createAi({ apiKey: "k", fetchFn: f.fn }).instructions(input)).toEqual({ status: 502, body: { error: "source_failed" } });
    const g = routedFetch({ anthropic: [inn("atovaquone")], fdaThrows: true });
    expect(await createAi({ apiKey: "k", fetchFn: g.fn }).instructions(input)).toEqual({ status: 502, body: { error: "source_failed" } });

    const h = routedFetch({ anthropic: [] });
    const ai = createAi({ apiKey: "k", fetchFn: h.fn });
    for (const bad of [{}, null, "x", { name: "" }, { name: "x".repeat(121) }, { name: "a", form: 5 }, { name: "a", strength: "y".repeat(121) }]) {
      expect((await ai.instructions(bad)).status).toBe(400);
    }
    expect(h.calls).toHaveLength(0);

    const l = routedFetch({ anthropic: [inn("atovaquone"), anthropicReply(JSON.stringify(out))], fda: { results: [label] } });
    const limited = createAi({ apiKey: "k", fetchFn: l.fn, hourlyLimit: 1 });
    expect((await limited.instructions(input)).status).toBe(200);
    expect((await limited.instructions(input)).status).toBe(429);
  });

  it("found false não traz texto zh/en (nunca usa a memória da Claude)", async () => {
    const f = routedFetch({ anthropic: [inn("atovaquone"), anthropicReply(JSON.stringify({ ...out, legible: false }))], fda: { results: [label] } });
    const r = await createAi({ apiKey: "k", fetchFn: f.fn }).instructions(input);
    expect(r.body).toEqual({ found: false });
  });

  const combo = {
    set_id: "22222222-2222-2222-2222-222222222222",
    indications_and_usage: ["COMBO INDICATION TEXT"],
    dosage_and_administration: ["COMBO DOSE"],
    contraindications: ["c"],
    warnings_and_cautions: ["w"],
    adverse_reactions: ["a"],
    how_supplied: ["h"],
    information_for_patients: ["i"],
    openfda: { generic_name: ["ATOVAQUONE AND PROGUANIL HYDROCHLORIDE"], substance_name: ["ATOVAQUONE", "PROGUANIL HYDROCHLORIDE"] },
  };
  const sentToClaude = (f: ReturnType<typeof routedFetch>) => JSON.stringify(JSON.parse(String(f.anthropicCalls()[1].init.body)).messages);

  it("produto com uma substância nunca recebe a etiqueta da combinação", async () => {
    const plain = { set_id: "33333333-3333-3333-3333-333333333333", indications_and_usage: ["PLAIN INDICATION TEXT"], openfda: { substance_name: ["ATOVAQUONE"] } };
    const f = routedFetch({ anthropic: [inn("atovaquone"), anthropicReply(JSON.stringify(out))], fda: { results: [combo, plain] } });
    await createAi({ apiKey: "k", fetchFn: f.fn }).instructions(input);
    expect(sentToClaude(f)).toContain("PLAIN INDICATION TEXT");
    expect(sentToClaude(f)).not.toContain("COMBO INDICATION TEXT");
  });

  it("só existe a etiqueta da combinação: found false e uma só chamada à Anthropic", async () => {
    const f = routedFetch({ anthropic: [inn("atovaquone")], fda: { results: [combo] } });
    const r = await createAi({ apiKey: "k", fetchFn: f.fn }).instructions(input);
    expect(r).toEqual({ status: 200, body: { found: false } });
    expect(f.anthropicCalls()).toHaveLength(1);
  });

  it("duas substâncias: o URL exige ambas (AND) e escolhe a etiqueta da combinação", async () => {
    const single = { set_id: "44444444-4444-4444-4444-444444444444", indications_and_usage: ["AMLODIPINE ONLY TEXT"], dosage_and_administration: ["d"], contraindications: ["c"], openfda: { generic_name: ["AMLODIPINE"], substance_name: ["AMLODIPINE BESYLATE"] } };
    const both = { set_id: "55555555-5555-5555-5555-555555555555", indications_and_usage: ["AMLODIPINE VALSARTAN TEXT"], openfda: { generic_name: ["AMLODIPINE AND VALSARTAN"], substance_name: ["AMLODIPINE BESYLATE", "VALSARTAN"] } };
    const f = routedFetch({ anthropic: [inn("amlodipine", "valsartan"), anthropicReply(JSON.stringify(out))], fda: { results: [single, both] } });
    const r = await createAi({ apiKey: "k", fetchFn: f.fn }).instructions({ name: "Exforge", activeSubstance: "Amlodipina + Valsartan" });
    expect(f.fdaCalls()).toHaveLength(1);
    expect(new URL(f.fdaCalls()[0].url).searchParams.get("search")).toBe('openfda.generic_name:"amlodipine" AND openfda.generic_name:"valsartan"');
    expect(f.fdaCalls()[0].url).toContain("limit=25");
    expect(sentToClaude(f)).toContain("AMLODIPINE VALSARTAN TEXT");
    expect(sentToClaude(f)).not.toContain("AMLODIPINE ONLY TEXT");
    expect(r.body.sourceUrl).toContain(both.set_id);
  });

  it("desempate pela dosagem pedida", async () => {
    const base = { indications_and_usage: ["x"], dosage_and_administration: ["d"], openfda: { generic_name: ["ATOVAQUONE"], substance_name: ["ATOVAQUONE"] } };
    const a = { ...base, set_id: "66666666-6666-6666-6666-666666666666", how_supplied: ["Tablets 250 mg. LABEL A"] };
    const b = { ...base, set_id: "77777777-7777-7777-7777-777777777777", how_supplied: ["Suspension 750 mg per 5 mL. LABEL B"] };
    const f = routedFetch({ anthropic: [inn("atovaquone"), anthropicReply(JSON.stringify(out))], fda: { results: [a, b] } });
    const r = await createAi({ apiKey: "k", fetchFn: f.fn }).instructions(input);
    expect(r.body.sourceUrl).toContain(b.set_id);
    expect(sentToClaude(f)).toContain("Suspension 750 mg per 5 mL");
  });

  describe("dosagem só por número inteiro", () => {
    const base = { indications_and_usage: ["x"], openfda: { generic_name: ["AMLODIPINE"], substance_name: ["AMLODIPINE BESYLATE"] } };
    const rich = { dosage_and_administration: ["d"], contraindications: ["c"], warnings_and_cautions: ["w"], adverse_reactions: ["a"] };
    const pick = async (strength: string, results: unknown[], innName = "amlodipine") => {
      const f = routedFetch({ anthropic: [inn(innName), anthropicReply(JSON.stringify(out))], fda: { results } });
      const r = await createAi({ apiKey: "k", fetchFn: f.fn }).instructions({ name: "X", strength });
      return r.body.sourceUrl as string;
    };
    const id = (n: number) => `${String(n).repeat(8)}-${String(n).repeat(4)}-${String(n).repeat(4)}-${String(n).repeat(4)}-${String(n).repeat(12)}`;

    it("5 mg não casa com 25 mg, mesmo que essa etiqueta tenha mais secções", async () => {
      const l25 = { ...base, ...rich, set_id: id(1), how_supplied: ["Tablets 25 mg"] };
      const l5 = { ...base, set_id: id(2), how_supplied: ["Tablets 5 mg"] };
      expect(await pick("5 mg", [l25, l5])).toContain(id(2));
      expect(await pick("5 mg", [l5, l25])).toContain(id(2));
    });

    it("5 mg não casa com 2.5 mg, 15 mg, 50 mg nem 5 mgs (sem bónus)", async () => {
      const l5 = { ...base, set_id: id(2), how_supplied: ["Tablets 5 mg"] };
      for (const wrong of ["2.5 mg", "15 mg", "50 mg", "5 mgs"]) {
        const other = { ...base, ...rich, set_id: id(3), how_supplied: [`Tablets ${wrong}`] };
        expect(await pick("5 mg", [other, l5])).toContain(id(2));
      }
    });

    it("750 mg/5 ml, e escrito de formas diferentes, casa com o mesmo texto", async () => {
      const a = { ...base, ...rich, set_id: id(4), how_supplied: ["Tablets 250 mg"] };
      const b = { ...base, set_id: id(5), how_supplied: ["Suspension 750 mg per 5 mL"] };
      expect(await pick("750 mg per 5 mL", [a, b])).toContain(id(5));
      expect(await pick("750 mg/5ml", [a, b])).toContain(id(5));
      const c = { ...base, set_id: id(6), how_supplied: ["Suspension 750 mg/5 mL"] };
      expect(await pick("750 mg per 5 mL", [a, c])).toContain(id(6));
    });
  });

  it("a marca é ignorada: o pedido de substância traz a instrução e a substância ativa", async () => {
    const f = routedFetch({ anthropic: [inn("atovaquone"), anthropicReply(JSON.stringify(out))], fda: { results: [label] } });
    await createAi({ apiKey: "k", fetchFn: f.fn }).instructions(input);
    const first = JSON.parse(String(f.anthropicCalls()[0].init.body));
    expect(first.system).toMatch(/IGNORE brand, company/);
    expect(first.system).toContain("Kabi");
    expect(JSON.stringify(first.messages)).toContain("Atovaquona");
  });

  it("sem substance_name: só aceita etiqueta de uma única substância (conservador)", async () => {
    const mk = (generic: string[]) => ({ set_id: "88888888-8888-8888-8888-888888888888", indications_and_usage: ["FALLBACK TEXT"], openfda: { generic_name: generic } });
    const ok = routedFetch({ anthropic: [inn("atovaquone"), anthropicReply(JSON.stringify(out))], fda: { results: [mk(["ATOVAQUONE"])] } });
    expect((await createAi({ apiKey: "k", fetchFn: ok.fn }).instructions(input)).body.found).toBe(true);
    for (const g of [["ATOVAQUONE AND PROGUANIL HYDROCHLORIDE"], ["ATOVAQUONE", "PROGUANIL"], ["ATOVAQUONE, PROGUANIL"], ["ATOVAQUONE/PROGUANIL"], []]) {
      const f = routedFetch({ anthropic: [inn("atovaquone")], fda: { results: [mk(g)] } });
      expect((await createAi({ apiKey: "k", fetchFn: f.fn }).instructions(input)).body).toEqual({ found: false });
      expect(f.anthropicCalls()).toHaveLength(1);
    }
    const two = routedFetch({ anthropic: [inn("amlodipine", "valsartan")], fda: { results: [mk(["AMLODIPINE AND VALSARTAN"])] } });
    expect((await createAi({ apiKey: "k", fetchFn: two.fn }).instructions(input)).body).toEqual({ found: false });
  });
});
