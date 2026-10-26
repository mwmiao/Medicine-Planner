"use client";

import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { useMessages } from "@/lib/i18n";
import { decodeBarcode } from "@/lib/barcode/decode";
import type { BarcodeInfo } from "@/lib/barcode/gs1";
import { recognizeImage } from "@/lib/ocr/ocr";
import { isUnclear, parseOcr, type ParsedBox } from "@/lib/ocr/parse";
import { GUIDE, guideCrop, prepareImage } from "@/lib/ocr/preprocess";
import type { OcrExtract } from "@/lib/types";
import { Button, Card, Field, Notice, TextArea, TextInput } from "./ui";

type Phase = "start" | "camera" | "preview" | "reading" | "review";

const FIELD_KEYS = ["name", "activeSubstance", "strength", "form", "packCount", "expiry", "manufacturer", "ean"] as const;

export function BoxScanner({ onExtract, onClose }: { onExtract: (ocr: OcrExtract) => void; onClose: () => void }) {
  const { m } = useMessages();
  const [phase, setPhase] = useState<Phase>("start");
  const [photo, setPhoto] = useState<{ blob: Blob; url: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [raw, setRaw] = useState("");
  const [barcode, setBarcode] = useState<BarcodeInfo | null>(null);
  const [unclear, setUnclear] = useState(false);
  const [fields, setFields] = useState<ParsedBox>({});
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const cameraFileRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);

  const stopCamera = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  };

  const clearPhoto = () => {
    setPhoto((p) => {
      if (p) URL.revokeObjectURL(p.url);
      return null;
    });
  };

  // Ao sair, desligar a câmara e libertar a fotografia da memória.
  useEffect(() => () => stopCamera(), []);
  useEffect(() => () => void (photo && URL.revokeObjectURL(photo.url)), [photo]);

  const read = async (blob: Blob) => {
    setError(null);
    setProgress(0);
    setPhase("reading");
    try {
      const canvas = await prepareImage(blob);
      // Código de barras primeiro (rápido); depois o texto, na mesma fotografia.
      const code = await decodeBarcode(canvas).catch(() => null);
      setBarcode(code);
      const res = await recognizeImage(canvas, setProgress);
      const parsed = parseOcr(res.text, res.rawText);
      setRaw(res.rawText);
      setUnclear(isUnclear(res.text, res.confidence) && !code?.ean);
      setFields({
        ...parsed,
        // O código de barras é mais fiável do que os números lidos por OCR.
        ean: code?.ean ?? parsed.ean,
        expiry: parsed.expiry ?? code?.expiry,
      });
      setPhase("review");
    } catch {
      setError(m.scan.ocrError);
      setPhase("preview");
    }
  };

  // A leitura começa logo a seguir à fotografia: menos um passo para a utilizadora.
  const acceptPhoto = (blob: Blob) => {
    clearPhoto();
    setPhoto({ blob, url: URL.createObjectURL(blob) });
    void read(blob);
  };

  const openCamera = async () => {
    setError(null);
    if (!navigator.mediaDevices?.getUserMedia) {
      setError(m.scan.cameraUnavailable);
      cameraFileRef.current?.click();
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        // Pedir a resolução mais alta possível: texto pequeno precisa de pixels.
        video: { facingMode: { ideal: "environment" }, width: { ideal: 3840 }, height: { ideal: 2160 } },
        audio: false,
      });
      streamRef.current = stream;
      setPhase("camera");
      requestAnimationFrame(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          void videoRef.current.play().catch(() => undefined);
        }
      });
    } catch (e) {
      const name = e instanceof DOMException ? e.name : "";
      setError(name === "NotAllowedError" || name === "SecurityError" ? m.scan.cameraDenied : m.scan.cameraUnavailable);
    }
  };

  const takePhoto = () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    const crop = guideCrop(video.videoWidth, video.videoHeight, video.clientWidth, video.clientHeight);
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(crop.w);
    canvas.height = Math.round(crop.h);
    canvas.getContext("2d")?.drawImage(video, crop.x, crop.y, crop.w, crop.h, 0, 0, canvas.width, canvas.height);
    canvas.toBlob(
      (blob) => {
        stopCamera();
        if (blob) acceptPhoto(blob);
        else setError(m.scan.cameraUnavailable);
      },
      "image/jpeg",
      0.92,
    );
  };

  const onFile = (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (f) acceptPhoto(f);
  };

  const confirm = () => {
    const clean = (v?: string) => v?.trim() || undefined;
    onExtract({
      rawText: raw,
      name: clean(fields.name),
      activeSubstance: clean(fields.activeSubstance),
      strength: clean(fields.strength),
      form: clean(fields.form),
      packCount: clean(fields.packCount),
      expiry: clean(fields.expiry),
      manufacturer: clean(fields.manufacturer),
      ean: clean(fields.ean),
      capturedAt: new Date().toISOString(),
    });
    clearPhoto();
  };

  const close = () => {
    stopCamera();
    clearPhoto();
    onClose();
  };

  return (
    <Card className="flex flex-col gap-4 ring-2 ring-primary">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">📷 {m.scan.title}</h2>
        <button type="button" onClick={close} aria-label={m.common.close} className="min-h-12 min-w-12 text-3xl font-bold text-muted">
          ×
        </button>
      </div>

      {/* Câmara nativa do iPhone (foto em resolução total, com focagem automática) e galeria. */}
      <input ref={cameraFileRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={onFile} />
      <input ref={galleryRef} type="file" accept="image/*" className="hidden" onChange={onFile} />

      {phase === "start" ? (
        <>
          <div className="rounded-2xl bg-primary-soft p-4">
            <p className="text-lg font-bold">{m.scan.tipsTitle}</p>
            <ul className="mt-2 list-disc pl-6 text-lg">
              {m.scan.tips.map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ul>
          </div>
          <Button block className="min-h-16 text-xl" onClick={() => void openCamera()}>
            📷 {m.scan.openCamera}
          </Button>
          <Button variant="secondary" block onClick={() => cameraFileRef.current?.click()}>
            📱 {m.scan.nativeCamera}
          </Button>
          <Button variant="secondary" block onClick={() => galleryRef.current?.click()}>
            🖼 {m.scan.chooseFile}
          </Button>
          <p className="text-base text-muted">
            {m.scan.photoNotSaved} {m.scan.firstTimeNote}
          </p>
        </>
      ) : null}

      {phase === "camera" ? (
        <>
          <div className="relative overflow-hidden rounded-2xl bg-black">
            <video ref={videoRef} playsInline muted autoPlay className="aspect-[3/4] w-full object-cover" />
            <div
              aria-hidden
              className="pointer-events-none absolute rounded-xl border-4 border-white shadow-[0_0_0_9999px_rgba(0,0,0,0.45)]"
              style={{
                left: `${((1 - GUIDE.width) / 2) * 100}%`,
                top: `${((1 - GUIDE.height) / 2) * 100}%`,
                width: `${GUIDE.width * 100}%`,
                height: `${GUIDE.height * 100}%`,
              }}
            />
          </div>
          <p className="text-center text-lg font-semibold">{m.scan.frameHint}</p>
          <Button block className="min-h-16 text-xl" onClick={takePhoto}>
            ⬤ {m.scan.takePhoto}
          </Button>
          <Button
            variant="secondary"
            block
            onClick={() => {
              stopCamera();
              setPhase("start");
            }}
          >
            {m.common.cancel}
          </Button>
        </>
      ) : null}

      {photo && (phase === "preview" || phase === "reading") ? (
        <img src={photo.url} alt="" className="max-h-96 w-full rounded-2xl object-contain bg-gray-100" />
      ) : null}

      {phase === "preview" ? (
        <>
          <Button block className="min-h-16 text-xl" onClick={() => photo && void read(photo.blob)}>
            🔤 {m.scan.read}
          </Button>
          <Button variant="secondary" block onClick={() => { clearPhoto(); setPhase("start"); }}>
            {m.scan.retake}
          </Button>
        </>
      ) : null}

      {phase === "reading" ? (
        <div role="status" className="flex flex-col gap-2">
          <p className="text-xl font-semibold">{m.scan.reading(Math.round(progress * 100))}</p>
          <div className="h-4 overflow-hidden rounded-full bg-gray-200">
            <div className="h-full bg-primary transition-all" style={{ width: `${Math.round(progress * 100)}%` }} />
          </div>
        </div>
      ) : null}

      {phase === "review" ? (
        <>
          {photo ? (
            <>
              <img src={photo.url} alt="" className="max-h-56 w-full rounded-2xl bg-gray-100 object-contain" />
              <Button variant="danger" block onClick={clearPhoto}>
                🗑 {m.scan.deletePhoto}
              </Button>
            </>
          ) : null}
          {barcode?.ean ? (
            <Notice tone="success">
              <p className="font-bold">
                ▥ {m.scan.barcodeFound}: <span className="font-mono tabular-nums">{barcode.ean}</span>
              </p>
              <p className="text-base">{m.scan.barcodeNote}</p>
            </Notice>
          ) : (
            <Notice>{m.scan.noBarcode}</Notice>
          )}
          {unclear ? (
            <Notice tone="warn">
              <p className="font-bold">{m.scan.unclear}</p>
              <p className="mt-1 text-base">{m.scan.unclearTips}</p>
            </Notice>
          ) : (
            <Notice tone="warn">{m.scan.review}</Notice>
          )}
          <div className="flex flex-col gap-3">
            <h3 className="text-xl font-bold">{m.scan.found}</h3>
            {FIELD_KEYS.map((k) => (
              <Field key={k} label={m.scan.fields[k]} htmlFor={`ocr-${k}`}>
                <TextInput
                  id={`ocr-${k}`}
                  value={fields[k] ?? ""}
                  inputMode={k === "ean" ? "numeric" : undefined}
                  onChange={(e) => setFields((f) => ({ ...f, [k]: e.target.value }))}
                />
              </Field>
            ))}
          </div>
          <details className="rounded-2xl bg-canvas p-3">
            <summary className="min-h-12 cursor-pointer py-2 text-lg font-semibold">{m.scan.rawText}</summary>
            <TextArea value={raw} readOnly rows={8} className="font-mono text-base" />
            {barcode ? <p className="mt-2 break-all font-mono text-sm text-muted">{barcode.format}: {barcode.raw}</p> : null}
          </details>
          <Button block className="min-h-16 text-xl" onClick={confirm}>
            ✓ {m.scan.useData}
          </Button>
          <Button variant={unclear ? "primary" : "secondary"} block onClick={() => { clearPhoto(); setPhase("start"); }}>
            📷 {m.scan.retake}
          </Button>
        </>
      ) : null}

      {error ? <Notice tone="error">{error}</Notice> : null}
    </Card>
  );
}
