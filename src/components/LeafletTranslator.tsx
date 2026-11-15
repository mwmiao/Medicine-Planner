"use client";

import { useEffect, useRef, useState } from "react";
import { aiAvailable, fileToJpegBase64, translateLeaflet, type LeafletResult } from "@/lib/ai";
import { useMessages } from "@/lib/i18n";
import { getSync, useSyncState } from "@/lib/sync";
import { Button, Notice, TextArea } from "./ui";

const MAX_PHOTOS = 6;
const MIN_TEXT = 20;

type Problem = "failed" | "unreadable" | null;

export function LeafletTranslator({ onDone }: { onDone: (result: LeafletResult) => void }) {
  const { m } = useMessages();
  useSyncState(); // volta a desenhar quando a ligação ao NAS muda
  const [available, setAvailable] = useState(false);
  const [open, setOpen] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<Problem>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let alive = true;
    void aiAvailable().then((v) => alive && setAvailable(v));
    return () => {
      alive = false;
    };
  }, []);

  if (!available || !getSync().connected) return null;

  const canRun = !busy && (files.length > 0 || text.trim().length >= MIN_TEXT);

  const run = async () => {
    setBusy(true);
    setProblem(null);
    try {
      const images = await Promise.all(files.map((f) => fileToJpegBase64(f)));
      const trimmed = text.trim();
      const result = await translateLeaflet({ ...(images.length ? { images } : {}), ...(trimmed ? { text: trimmed } : {}) });
      if (result.legible) onDone(result);
      else setProblem("unreadable");
    } catch {
      setProblem("failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <Button variant="secondary" block aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        {m.info.translateButton}
      </Button>
      {open ? (
        <div className="flex flex-col gap-3 rounded-2xl border-2 border-line p-4">
          <p className="text-lg">{m.info.translateIntro}</p>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => {
              setFiles(Array.from(e.target.files ?? []).slice(0, MAX_PHOTOS));
              e.target.value = "";
            }}
          />
          <Button variant="secondary" block onClick={() => fileRef.current?.click()}>
            📷 {m.info.translatePhotos}
          </Button>
          {files.length ? <p className="text-lg">{m.info.translatePhotosCount(files.length)}</p> : null}
          <label className="flex flex-col gap-1.5">
            <span className="text-lg font-bold">{m.info.translatePaste}</span>
            <TextArea value={text} rows={5} onChange={(e) => setText(e.target.value)} />
          </label>
          <Button block disabled={!canRun} onClick={() => void run()}>
            {m.info.translateRun}
          </Button>
          {busy ? <Notice>{m.info.translating}</Notice> : null}
          {problem === "unreadable" ? <Notice tone="warn">{m.info.translateUnreadable}</Notice> : null}
          {problem === "failed" ? <Notice tone="error">{m.info.translateFailed}</Notice> : null}
        </div>
      ) : null}
    </div>
  );
}
