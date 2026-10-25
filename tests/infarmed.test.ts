import { describe, expect, it } from "vitest";
import { ProviderUnavailableError, type InfarmedMatch, type InfarmedProvider } from "@/lib/infarmed/provider";
import { searchCache, searchInfarmed, selectMatch } from "@/lib/infarmed/search";
import { infomedDetailUrl, isOfficialInfarmedUrl, parseInfomedUrl } from "@/lib/infarmed/urls";
import { input, testDb } from "./helpers";

const match: InfarmedMatch = {
  id: "fe0aac206d5b11e2bfa681cd2679c334",
  name: "Ben-u-ron",
  activeSubstance: "Paracetamol",
  pharmaceuticalForm: "Comprimido",
  strength: "500 mg",
  authorisationStatus: "Autorizado",
  recordUrl: infomedDetailUrl("fe0aac206d5b11e2bfa681cd2679c334"),
  origin: "provider",
};

const fakeProvider: InfarmedProvider = { id: "fake", search: async () => [match] };

describe("pesquisa INFARMED, seleção e cache", () => {
  it("sem API pública, indica 'indisponível' e não inventa resultados", async () => {
    const db = testDb();
    const res = await searchInfarmed("paracetamol", { database: db, online: true });
    expect(res.remoteStatus).toBe("unavailable");
    expect(res.cached).toEqual([]);
    expect(res.remote).toEqual([]);
  });

  it("offline, só mostra a cache", async () => {
    const db = testDb();
    const res = await searchInfarmed("paracetamol", { database: db, online: false, provider: fakeProvider });
    expect(res.remoteStatus).toBe("offline");
    expect(res.remote).toEqual([]);
  });

  it("um erro do fornecedor é reportado como erro", async () => {
    const db = testDb();
    const failing: InfarmedProvider = { id: "x", search: async () => Promise.reject(new Error("500")) };
    const unavailable: InfarmedProvider = { id: "y", search: async () => Promise.reject(new ProviderUnavailableError()) };
    expect((await searchInfarmed("a b c", { database: db, online: true, provider: failing })).remoteStatus).toBe("error");
    expect((await searchInfarmed("abc", { database: db, online: true, provider: unavailable })).remoteStatus).toBe("unavailable");
  });

  it("selecionar preenche o formulário e guarda na cache com data", async () => {
    const db = testDb();
    const now = new Date("2026-10-25T10:00:00Z");
    const res = await searchInfarmed("ben-u-ron", { database: db, online: true, provider: fakeProvider });
    expect(res.remote).toHaveLength(1);

    const filled = await selectMatch(res.remote[0], input({ name: "ben", dosage: "" }), now, db);
    expect(filled.name).toBe("Ben-u-ron");
    expect(filled.activeSubstance).toBe("Paracetamol");
    expect(filled.dosage).toBe("500 mg");
    expect(filled.infarmed).toMatchObject({ matched: true, recordId: match.id, retrievedAt: now.toISOString(), recordUrl: match.recordUrl });

    const cached = await db.infarmedCache.get(match.id);
    expect(cached?.retrievedAt).toBe(now.toISOString());

    // A pesquisa seguinte encontra-o na cache (também por substância e sem acentos),
    // e não o repete nos resultados remotos.
    expect((await searchCache("PARACETAMOL", db)).map((m) => m.id)).toEqual([match.id]);
    const again = await searchInfarmed("paracetamol", { database: db, online: true, provider: fakeProvider });
    expect(again.cached[0].retrievedAt).toBe(now.toISOString());
    expect(again.remote).toEqual([]);
  });

  it("aceita só URLs oficiais do INFOMED", () => {
    expect(parseInfomedUrl("https://extranet.infarmed.pt/INFOMED-fo/detalhes-medicamento.xhtml?med_guid=fe0aac206d5b11e2bfa681cd2679c334")).toEqual({
      medGuid: "fe0aac206d5b11e2bfa681cd2679c334",
      url: match.recordUrl,
    });
    expect(parseInfomedUrl("https://evil.example/detalhes?med_guid=fe0aac206d5b11e2")).toBeNull();
    expect(parseInfomedUrl("http://extranet.infarmed.pt/x?med_guid=fe0aac206d5b11e2")).toBeNull();
    expect(parseInfomedUrl("isto não é um url")).toBeNull();
    expect(isOfficialInfarmedUrl("https://extranet.infarmed.pt/doc.pdf")).toBe(true);
    expect(isOfficialInfarmedUrl("https://infarmed.pt.evil.com/doc.pdf")).toBe(false);
  });
});
