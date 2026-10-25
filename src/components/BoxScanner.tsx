"use client";

import { useEffect, useRef, useState } from "react";
import { useMessages } from "@/lib/i18n";
import { recognizeImage, type OcrLanguage } from "@/lib/ocr/ocr";
import { isUnclear, parseBoxText, type ParsedBox } from "@/lib/ocr/parse";
import type { OcrExtract } from "@/lib/types";
import { Button, Card, Field, Notice, TextArea, TextInput } from "./ui";

type Phase = "start" | "camera" | "preview" | "reading" | "review";

const FIELD_KEYS = ["name", "activeSubstance", "strength", "form", "packCount", "expiry", "manufacturer"] as const;

export function BoxScanner({ onExtract, onClose }: { onExtract: (ocr: OcrExtract) => void; onClose: () => void }) {
  const { m } = useMessages();
  const [phase, setPhase] = useState<Phase>("start");
  const [lang, setLang] = useState<OcrLanguage>("por");
  const [photo, setPhoto] = useState<{ blob: Blob; url: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [raw, setRaw] = useState("");
  const [unclear, setUnclear] = useState(false);
  const [fields, setFields] = useState<ParsedBox>({});
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

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

  const acceptPhoto = (blob: Blob) => {
    clearPhoto();
    setPhoto({ blob, url: URL.createObjectURL(blob) });
    setPhase("preview");
  };

  const openCamera = async () => {
    setError(null);
    if (!navigator.mediaDevices?.getUserMedia) {
      setError(m.scan.cameraUnavailable);
      fileRef.current?.click();
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1080 } },
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
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d")?.drawImage(video, 0, 0);
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

  const read = async () => {
    if (!photo) return;
    setError(null);
    setProgress(0);
    setPhase("reading");
    try {
      const res = await recognizeImage(photo.blob, lang, setProgress);
      setRaw(res.text.trim());
      const bad = isUnclear(res.text, res.confidence);
      setUnclear(bad);
      setFields(bad ? {} : parseBoxText(res.text));
      setPhase("review");
    } catch {
      setError(m.scan.ocrError);
      setPhase("preview");
    }
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

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) acceptPhoto(f);
          e.target.value = "";
        }}
      />

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
          <fieldset>
            <legend className="mb-2 text-lg font-semibold">{m.scan.textLanguage}</legend>
            <div className="grid grid-cols-3 gap-2">
              {(
                [
                  ["por", m.scan.langPor],
                  ["chi_sim", m.scan.langZh],
                  ["por+chi_sim", m.scan.langBoth],
                ] as const
              ).map(([v, label]) => (
                <button
                  key={v}
                  type="button"
                  aria-pressed={lang === v}
                  onClick={() => setLang(v)}
                  className={`min-h-14 rounded-xl border-2 px-2 text-lg font-semibold ${lang === v ? "border-primary bg-primary text-white" : "border-line bg-white"}`}
                >
                  {label}
                </button>
              ))}
            </div>
          </fieldset>
          <Button block className="min-h-16 text-xl" onClick={() => void openCamera()}>
            📷 {m.scan.openCamera}
          </Button>
          <Button variant="secondary" block onClick={() => fileRef.current?.click()}>
            🖼 {m.scan.chooseFile}
          </Button>
          <p className="text-base text-muted">
            {m.scan.photoNotSaved} {m.scan.firstTimeNote}
          </p>
        </>
      ) : null}

      {phase === "camera" ? (
        <>
          <video ref={videoRef} playsInline muted autoPlay className="aspect-[3/4] w-full rounded-2xl bg-black object-cover" />
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
          <Button block className="min-h-16 text-xl" onClick={() => void read()}>
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
            <Button variant="danger" block onClick={clearPhoto}>
              🗑 {m.scan.deletePhoto}
            </Button>
          ) : null}
          {unclear ? <Notice tone="warn">{m.scan.unclear}</Notice> : <Notice tone="warn">{m.scan.review}</Notice>}
          {!unclear ? (
            <div className="flex flex-col gap-3">
              <h3 className="text-xl font-bold">{m.scan.found}</h3>
              {FIELD_KEYS.map((k) => (
                <Field key={k} label={m.scan.fields[k]} htmlFor={`ocr-${k}`}>
                  <TextInput id={`ocr-${k}`} value={fields[k] ?? ""} onChange={(e) => setFields((f) => ({ ...f, [k]: e.target.value }))} />
                </Field>
              ))}
            </div>
          ) : null}
          <details className="rounded-2xl bg-canvas p-3">
            <summary className="min-h-12 cursor-pointer py-2 text-lg font-semibold">{m.scan.rawText}</summary>
            <TextArea value={raw} onChange={(e) => setRaw(e.target.value)} rows={6} />
          </details>
          {!unclear ? (
            <Button block className="min-h-16 text-xl" onClick={confirm}>
              ✓ {m.scan.useData}
            </Button>
          ) : null}
          <Button variant="secondary" block onClick={() => { clearPhoto(); setPhase("start"); }}>
            {m.scan.retake}
          </Button>
          {unclear ? (
            <Button variant="ghost" block onClick={close}>
              {m.common.close}
            </Button>
          ) : null}
        </>
      ) : null}

      {error ? <Notice tone="error">{error}</Notice> : null}
    </Card>
  );
}
