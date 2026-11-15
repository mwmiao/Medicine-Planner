"use client";

// Tradução do folheto (lado do telemóvel): o pedido vai para o NAS, que fala com a Anthropic.
// A chave da API nunca está aqui.

import { getSync } from "./sync";
import { nasRequest, type NasIo } from "./sync/nas";
import type { MedicalInfoSection } from "./types";

export type Sections = Partial<Record<MedicalInfoSection, string[]>>;
export type LeafletResult = { legible: boolean; zh: Sections; pt: Sections };
export type LeafletInput = { text?: string; images?: { mediaType: string; data: string }[] };

/** O servidor tem a IA ligada? */
export async function aiAvailable(baseUrl = "", fetchFn: typeof fetch = (...a) => fetch(...a)): Promise<boolean> {
  try {
    const res = await fetchFn(`${baseUrl}/api/health`, { cache: "no-store" });
    if (!res.ok) return false;
    const body: unknown = await res.json();
    return typeof body === "object" && body !== null && (body as { ai?: unknown }).ai === true;
  } catch {
    return false;
  }
}

export async function translateLeaflet(input: LeafletInput, io: NasIo = {}, code: string | null = getSync().code): Promise<LeafletResult> {
  if (!code) throw new Error("not_connected");
  const res = await nasRequest(code, "POST", "/api/ai/leaflet", input, io);
  return (await res.json()) as LeafletResult;
}

export type BoxResult = {
  legible: boolean;
  fields: Partial<Record<"name" | "activeSubstance" | "strength" | "form" | "packCount" | "expiry" | "manufacturer" | "ean", string>>;
  uncertain: string[];
};

export async function readBoxPhoto(image: { mediaType: string; data: string }, io: NasIo = {}, code: string | null = getSync().code): Promise<BoxResult> {
  if (!code) throw new Error("not_connected");
  const res = await nasRequest(code, "POST", "/api/ai/box", { image }, io);
  return (await res.json()) as BoxResult;
}

/** Reduz a fotografia (lado maior `maxSide`) e converte-a em JPEG base64, para o envio ser leve. */
export async function fileToJpegBase64(file: Blob, maxSide = 1600, quality = 0.8): Promise<{ mediaType: "image/jpeg"; data: string }> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error("bad_image"));
      i.src = url;
    });
    const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(img.naturalWidth * scale);
    canvas.height = Math.round(img.naturalHeight * scale);
    canvas.getContext("2d")?.drawImage(img, 0, 0, canvas.width, canvas.height);
    return { mediaType: "image/jpeg", data: canvas.toDataURL("image/jpeg", quality).split(",")[1] ?? "" };
  } finally {
    URL.revokeObjectURL(url);
  }
}
