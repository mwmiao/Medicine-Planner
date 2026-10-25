"use client";

import { useCallback, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { toast } from "@/components/Toast";
import { Button, Card, ExternalLink, Notice, PageTitle } from "@/components/ui";
import { backupFileName, deleteAllData, exportData, importData } from "@/lib/backup";
import { useMessages } from "@/lib/i18n";
import { INFOMED_SEARCH_URL } from "@/lib/infarmed/urls";
import { setLocale, setTextSize, useTextSize } from "@/lib/settings";
import type { Locale, TextSize } from "@/lib/types";

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card>
      <h2 className="mb-3 text-2xl font-bold">{title}</h2>
      <div className="flex flex-col gap-3">{children}</div>
    </Card>
  );
}

function Choice<T extends string>({ value, options, onChange }: { value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return (
    <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}>
      {options.map(([v, label]) => (
        <button
          key={v}
          type="button"
          aria-pressed={value === v}
          onClick={() => onChange(v)}
          className={`min-h-14 rounded-xl border-2 px-2 text-lg font-semibold ${value === v ? "border-primary bg-primary text-white" : "border-line bg-white"}`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

type Perm = NotificationPermission | "unsupported";
const subscribeNoop = () => () => undefined;
const readPerm = (): Perm => (typeof Notification === "undefined" ? "unsupported" : Notification.permission);

export default function SettingsPage() {
  const { m, locale } = useMessages();
  const size = useTextSize();
  const fileRef = useRef<HTMLInputElement>(null);
  const [pendingImport, setPendingImport] = useState<string | null>(null);
  const [deleteStep, setDeleteStep] = useState<0 | 1 | 2>(0);
  const [importError, setImportError] = useState(false);
  const initialPerm = useSyncExternalStore(subscribeNoop, readPerm, () => "default" as Perm);
  const [perm, setPerm] = useState<Perm | null>(null);
  const permission = perm ?? initialPerm;

  const closeImport = useCallback(() => setPendingImport(null), []);
  const closeDelete = useCallback(() => setDeleteStep(0), []);

  const doExport = async () => {
    try {
      const data = await exportData();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = backupFileName();
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
      toast(m.settings.exported);
    } catch {
      toast(m.common.errorGeneric, "error");
    }
  };

  const doImport = async () => {
    const text = pendingImport;
    setPendingImport(null);
    if (!text) return;
    try {
      const backup = await importData(text);
      setImportError(false);
      toast(m.settings.imported(backup.medications.length));
    } catch {
      setImportError(true);
    }
  };

  const askNotifications = async () => {
    if (typeof Notification === "undefined") return setPerm("unsupported");
    setPerm(await Notification.requestPermission());
  };

  return (
    <div className="flex flex-col gap-5">
      <PageTitle>{m.settings.title}</PageTitle>

      <Section title={m.settings.language}>
        <Choice<Locale> value={locale} options={[["pt", "Português"], ["zh", "中文"]]} onChange={setLocale} />
      </Section>

      <Section title={m.settings.textSize}>
        <Choice<TextSize>
          value={size}
          options={[
            ["normal", m.settings.sizes.normal],
            ["large", m.settings.sizes.large],
            ["xlarge", m.settings.sizes.xlarge],
          ]}
          onChange={setTextSize}
        />
      </Section>

      <Section title={m.reminders.notificationsTitle}>
        {permission === "granted" ? (
          <Notice tone="success">{m.reminders.enabled}</Notice>
        ) : permission === "denied" ? (
          <Notice tone="warn">{m.reminders.denied}</Notice>
        ) : permission === "unsupported" ? (
          <Notice tone="warn">{m.reminders.unsupported}</Notice>
        ) : (
          <Button block onClick={() => void askNotifications()}>
            🔔 {m.reminders.enable}
          </Button>
        )}
      </Section>

      <Section title={m.settings.remindersTitle}>
        <p className="text-lg">{m.settings.remindersIntro}</p>
        <ol className="list-decimal space-y-2 pl-6 text-lg">
          {m.settings.remindersSteps.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ol>
      </Section>

      <Section title={m.settings.installTitle}>
        <ol className="list-decimal space-y-2 pl-6 text-lg">
          {m.settings.installSteps.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ol>
      </Section>

      <Section title={m.settings.backup}>
        <p className="text-lg text-muted">{m.settings.backupIntro}</p>
        <Button block onClick={() => void doExport()}>
          ⬇ {m.settings.export}
        </Button>
        <Button variant="secondary" block onClick={() => fileRef.current?.click()}>
          ⬆ {m.settings.import}
        </Button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={async (e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (f) setPendingImport(await f.text());
          }}
        />
        {importError ? <Notice tone="error">{m.settings.importError}</Notice> : null}
      </Section>

      <Section title={m.settings.infarmedTitle}>
        <p className="text-lg">{m.settings.infarmedText}</p>
        <ExternalLink href={INFOMED_SEARCH_URL}>{m.infarmed.openInfomed}</ExternalLink>
      </Section>

      <Section title={m.settings.privacyTitle}>
        <p className="text-lg">{m.settings.privacyText}</p>
        <Button variant="danger" block onClick={() => setDeleteStep(1)}>
          🗑 {m.settings.deleteAll}
        </Button>
      </Section>

      <ConfirmDialog
        open={pendingImport !== null}
        title={m.settings.importTitle}
        confirmLabel={m.settings.importYes}
        cancelLabel={m.common.cancel}
        onCancel={closeImport}
        onConfirm={() => void doImport()}
      >
        {m.settings.importBody}
      </ConfirmDialog>

      <ConfirmDialog
        open={deleteStep === 1}
        title={m.settings.deleteTitle1}
        confirmLabel={m.common.delete}
        cancelLabel={m.common.cancel}
        tone="danger"
        onCancel={closeDelete}
        onConfirm={() => setDeleteStep(2)}
      >
        {m.settings.deleteBody1}
      </ConfirmDialog>
      <ConfirmDialog
        open={deleteStep === 2}
        title={m.settings.deleteTitle2}
        confirmLabel={m.settings.deleteYes}
        cancelLabel={m.common.cancel}
        tone="danger"
        onCancel={closeDelete}
        onConfirm={async () => {
          setDeleteStep(0);
          await deleteAllData();
          toast(m.settings.deletedAll);
        }}
      >
        {m.settings.deleteBody2}
      </ConfirmDialog>
    </div>
  );
}
