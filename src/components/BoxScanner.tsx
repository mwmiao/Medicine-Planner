"use client";

import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { useMessages } from "@/lib/i18n";
import { decodeBarcode } from "@/lib/barcode/decode";
import type { BarcodeInfo } from "@/lib/barcode/gs1";
import { OcrCancelled, recognizeImage } from "@/lib/ocr/ocr";
import { isUnclear, parseOcr, uncertainFields, type ParsedBox } from "@/lib/ocr/parse";
import { GUIDE, guideCrop, prepareImage } from "@/lib/ocr/preprocess";
import type { OcrExtract } from "@/lib/types";
import { Button, Card, Field, Notice, TextArea, TextInput } from "./ui";

type Phase = "start" | "starting" | "camera" | "preview" | "reading" | "failed" | "review";
/** De onde veio a fotografia, para "Tirar outra" voltar ao mesmo sítio. */
type Source = "native" | "gallery" | "live";

const FIELD_KEYS = ["name", "activeSubstance", "strength", "form", "packCount", "expiry", "manufacturer", "ean"] as const;
/** Depois deste tempo a ler, mostra que está a demorar (o botão "à mão" está sempre visível). */
const SLOW_MS = 15000;

export function BoxScanner({ onExtract, onClose }: { onExtract: (ocr: OcrExtract) => void; onClose: () => void }) {
  const { m } = useMessages();
  const [phase, setPhase] = useState<Phase>("start");
  const [source, setSource] = useState<Source>("native");
  const [photo, setPhoto] = useState<{ blob: Blob; url: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [failMsg, setFailMsg] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [stage, setStage] = useState<"barcode" | "text">("barcode");
  const [slow, setSlow] = useState(false);
  const [raw, setRaw] = useState("");
  const [barcode, setBarcode] = useState<BarcodeInfo | null>(null);
  const [fields, setFields] = useState<ParsedBox>({});
  const [unsure, setUnsure] = useState<Set<keyof ParsedBox>>(new Set());
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const phaseRef = useRef<Phase>("start");
  const readRef = useRef<AbortController | null>(null);
  const cameraFileRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const hasLiveCamera = typeof navigator !== "undefined" && !!navigator.mediaDevices?.getUserMedia;

  phaseRef.current = phase;

  const stopCamera = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  };

  const cancelRead = () => {
    readRef.current?.abort();
    readRef.current = null;
  };

  const clearPhoto = () => {
    setPhoto((p) => {
      if (p) URL.revokeObjectURL(p.url);
      return null;
    });
  };

  // Ao sair: desligar a câmara, parar a leitura e libertar a fotografia da memória.
  useEffect(
    () => () => {
      stopCamera();
      cancelRead();
    },
    [],
  );
  useEffect(() => () => void (photo && URL.revokeObjectURL(photo.url)), [photo]);

  // Ligar o vídeo só depois de ele estar no ecrã (necessário no Safari).
  useEffect(() => {
    if (phase !== "camera" || !videoRef.current || !streamRef.current) return;
    videoRef.current.srcObject = streamRef.current;
    void videoRef.current.play().catch(() => undefined);
  }, [phase]);

  // Se a app for para segundo plano com a câmara aberta, desligá-la.
  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === "hidden" && (phaseRef.current === "camera" || phaseRef.current === "starting")) {
        stopCamera();
        setPhase("start");
      }
    };
    document.addEventListener("visibilitychange", onHide);
    return () => document.removeEventListener("visibilitychange", onHide);
  }, []);

  // Aviso "está a demorar" durante a leitura.
  useEffect(() => {
    if (phase !== "reading") return;
    setSlow(false);
    const t = setTimeout(() => setSlow(true), SLOW_MS);
    return () => clearTimeout(t);
  }, [phase]);

  const read = async (blob: Blob) => {
    cancelRead();
    const ctrl = new AbortController();
    readRef.current = ctrl;
    setError(null);
    setProgress(0);
    setStage("barcode");
    setPhase("reading");
    try {
      const canvas = await prepareImage(blob);
      if (ctrl.signal.aborted) return;
      // Código de barras primeiro (rápido); depois o texto, na mesma fotografia.
      const code = await decodeBarcode(canvas).catch(() => null);
      if (ctrl.signal.aborted) return;
      setStage("text");
      const res = await recognizeImage(canvas, setProgress, { signal: ctrl.signal });
      if (ctrl.signal.aborted) return;
      const parsed = parseOcr(res.text, res.rawText);
      const next: ParsedBox = {
        ...parsed,
        // O código de barras é mais fiável do que os números lidos por OCR.
        ean: code?.ean ?? parsed.ean,
        expiry: parsed.expiry ?? code?.expiry,
      };
      setBarcode(code);
      setRaw(res.rawText);
      setFields(next);
      setUnsure(uncertainFields(next, res.text, res.confidence, code?.ean));
      // Sem texto útil (ou nada reconhecível) nem código de barras: mensagem simples em vez de campos vazios.
      const nothingFound = !Object.values(next).some((v) => v?.trim());
      if ((isUnclear(res.text, res.confidence) || nothingFound) && !code?.ean) {
        setFailMsg(m.scan.failed);
        setPhase("failed");
      } else {
        setPhase("review");
      }
    } catch (e) {
      if (e instanceof OcrCancelled || ctrl.signal.aborted) return;
      setFailMsg(m.scan.ocrError);
      setPhase("failed");
    } finally {
      if (readRef.current === ctrl) readRef.current = null;
    }
  };

  // Mostra a fotografia em grande; a leitura só começa com "Usar esta fotografia".
  const showPhoto = (blob: Blob, from: Source) => {
    clearPhoto();
    setError(null);
    setSource(from);
    setPhoto({ blob, url: URL.createObjectURL(blob) });
    setPhase("preview");
  };

  const openLiveCamera = async () => {
    setError(null);
    if (!navigator.mediaDevices?.getUserMedia) {
      setError(m.scan.cameraUnavailable);
      return;
    }
    setPhase("starting");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        // "ideal" e não "exact": o navegador escolhe a melhor resolução que conseguir.
        video: { facingMode: { ideal: "environment" }, width: { ideal: 3840 }, height: { ideal: 2160 } },
        audio: false,
      });
      // A utilizadora pode ter cancelado enquanto a câmara abria.
      if (phaseRef.current !== "starting") {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      streamRef.current = stream;
      setPhase("camera");
    } catch (e) {
      const name = e instanceof DOMException ? e.name : "";
      if (phaseRef.current !== "starting") return;
      setError(
        name === "NotAllowedError" || name === "SecurityError"
          ? m.scan.cameraDenied
          : name === "NotReadableError" || name === "AbortError"
            ? m.scan.cameraBusy
            : m.scan.cameraUnavailable,
      );
      setPhase("start");
    }
  };

  const takeLivePhoto = () => {
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
        if (blob) showPhoto(blob, "live");
        else {
          setError(m.scan.cameraUnavailable);
          setPhase("start");
        }
      },
      "image/jpeg",
      0.92,
    );
  };

  const onFile = (from: Source) => (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    // Cancelar o seletor não muda nada: fica tudo como estava.
    if (f) showPhoto(f, from);
  };

  const retake = () => {
    cancelRead();
    clearPhoto();
    setPhase("start");
    if (source === "live") void openLiveCamera();
    else (source === "gallery" ? galleryRef : cameraFileRef).current?.click();
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
    cancelRead();
    clearPhoto();
    onClose();
  };

  const manualButton = (variant: "primary" | "secondary" | "ghost") => (
    <Button variant={variant} block onClick={close}>
      ✍ {m.scan.manual}
    </Button>
  );

  return (
    <Card className="flex flex-col gap-4 ring-2 ring-primary">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">📷 {m.scan.title}</h2>
        <button type="button" onClick={close} aria-label={m.common.close} className="min-h-12 min-w-12 text-3xl font-bold text-muted">
          ×
        </button>
      </div>

      {/* Câmara nativa do iPhone (foto em resolução total, com focagem automática) e galeria. */}
      <input ref={cameraFileRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={onFile("native")} />
      <input ref={galleryRef} type="file" accept="image/*" className="hidden" onChange={onFile("gallery")} />

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
          <Button block className="min-h-16 text-xl" onClick={() => cameraFileRef.current?.click()}>
            📷 {m.scan.takePhoto}
          </Button>
          <Button variant="secondary" block onClick={() => galleryRef.current?.click()}>
            🖼 {m.scan.chooseFile}
          </Button>
          {hasLiveCamera ? (
            <Button variant="secondary" block onClick={() => void openLiveCamera()}>
              🎥 {m.scan.openCamera}
            </Button>
          ) : null}
          {manualButton("ghost")}
          <p className="text-base text-muted">
            {m.scan.photoNotSaved} {m.scan.firstTimeNote}
          </p>
        </>
      ) : null}

      {phase === "starting" ? (
        <>
          <div role="status" className="flex aspect-[3/4] w-full items-center justify-center rounded-2xl bg-black text-xl font-semibold text-white">
            {m.scan.startingCamera}
          </div>
          <Button variant="secondary" block onClick={() => setPhase("start")}>
            {m.common.cancel}
          </Button>
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
          <Button block className="min-h-16 text-xl" onClick={takeLivePhoto}>
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

      {photo && (phase === "preview" || phase === "reading" || phase === "failed") ? (
        <img
          src={photo.url}
          alt=""
          className={`w-full rounded-2xl bg-gray-100 object-contain ${phase === "preview" ? "max-h-[60vh]" : "max-h-56"}`}
        />
      ) : null}

      {phase === "preview" ? (
        <>
          <Button block className="min-h-16 text-xl" onClick={() => photo && void read(photo.blob)}>
            ✓ {m.scan.usePhoto}
          </Button>
          <Button variant="secondary" block onClick={retake}>
            📷 {source === "gallery" ? m.scan.chooseAnother : m.scan.retake}
          </Button>
        </>
      ) : null}

      {phase === "reading" ? (
        <>
          <div role="status" aria-live="polite" className="flex flex-col gap-2">
            <p className="text-xl font-semibold">{stage === "barcode" ? m.scan.readingBarcode : m.scan.reading(Math.round(progress * 100))}</p>
            <div className="h-4 overflow-hidden rounded-full bg-gray-200">
              <div className="h-full bg-primary transition-all" style={{ width: `${Math.max(3, Math.round(progress * 100))}%` }} />
            </div>
            {slow ? <p className="text-lg">{m.scan.slow}</p> : null}
          </div>
          {manualButton("secondary")}
        </>
      ) : null}

      {phase === "failed" ? (
        <>
          <Notice tone="warn">
            <p className="font-bold">{failMsg}</p>
            <p className="mt-1 text-base">{m.scan.unclearTips}</p>
          </Notice>
          {manualButton("primary")}
          <Button variant="secondary" block onClick={retake}>
            📷 {source === "gallery" ? m.scan.chooseAnother : m.scan.retake}
          </Button>
          {photo ? (
            <Button variant="ghost" block onClick={() => void read(photo.blob)}>
              {m.scan.tryAgain}
            </Button>
          ) : null}
        </>
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
          <Notice tone="warn">{m.scan.review}</Notice>
          <div className="flex flex-col gap-3">
            <h3 className="text-xl font-bold">{m.scan.found}</h3>
            {FIELD_KEYS.map((k) => (
              <Field
                key={k}
                label={m.scan.fields[k]}
                hint={unsure.has(k) ? `⚠ ${m.scan.checkThis}` : undefined}
                htmlFor={`ocr-${k}`}
              >
                <TextInput
                  id={`ocr-${k}`}
                  value={fields[k] ?? ""}
                  inputMode={k === "ean" ? "numeric" : undefined}
                  className={unsure.has(k) ? "ring-2 ring-amber-400" : undefined}
                  onChange={(e) => {
                    setFields((f) => ({ ...f, [k]: e.target.value }));
                    // Depois de corrigido à mão, já não é uma dúvida.
                    setUnsure((u) => {
                      const n = new Set(u);
                      n.delete(k);
                      return n;
                    });
                  }}
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
          <Button variant="secondary" block onClick={retake}>
            📷 {source === "gallery" ? m.scan.chooseAnother : m.scan.retake}
          </Button>
        </>
      ) : null}

      {error ? <Notice tone="error">{error}</Notice> : null}
    </Card>
  );
}
