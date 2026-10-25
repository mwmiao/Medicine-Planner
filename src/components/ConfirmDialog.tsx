"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { Button } from "./ui";

export function ConfirmDialog({
  open,
  title,
  children,
  confirmLabel,
  cancelLabel,
  tone = "primary",
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  children?: ReactNode;
  confirmLabel: string;
  cancelLabel: string;
  tone?: "primary" | "success" | "danger";
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    cancelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onCancel();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onCancel]);

  if (!open) return null;
  const confirmVariant = tone === "danger" ? "danger" : tone;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 pb-safe sm:items-center" onClick={onCancel}>
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        className="mb-4 w-full max-w-md rounded-3xl bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="confirm-title" className="text-2xl font-bold">
          {title}
        </h2>
        {children ? <div className="mt-3 text-lg text-muted">{children}</div> : null}
        <div className="mt-6 flex flex-col gap-3">
          <Button
            variant={confirmVariant}
            block
            onClick={onConfirm}
            className={tone === "danger" ? "!bg-danger !text-white" : ""}
          >
            {confirmLabel}
          </Button>
          <Button ref={cancelRef} variant="secondary" block onClick={onCancel}>
            {cancelLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
