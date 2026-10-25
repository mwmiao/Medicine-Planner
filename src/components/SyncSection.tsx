"use client";

import { useCallback, useState } from "react";
import { formatClock, formatIsoDate } from "@/lib/format";
import { useMessages } from "@/lib/i18n";
import { getSync, useSyncAvailable, useSyncState } from "@/lib/sync";
import { ConfirmDialog } from "./ConfirmDialog";
import { toast } from "./Toast";
import { Button, Card, Field, Notice, TextInput } from "./ui";

export function SyncSection() {
  const { m, locale } = useMessages();
  const available = useSyncAvailable();
  const state = useSyncState();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmOff, setConfirmOff] = useState(false);
  const closeOff = useCallback(() => setConfirmOff(false), []);
  const connected = state.status !== "off";

  const connect = async () => {
    setBusy(true);
    setError(null);
    const status = await getSync().connect(code);
    setBusy(false);
    if (status === "idle") {
      setCode("");
      toast(m.sync.connectedToast);
    } else {
      setError(m.sync.status[status]);
    }
  };

  const tone = state.status === "idle" ? "success" : state.status === "syncing" ? "info" : "warn";

  return (
    <Card>
      <h2 className="mb-3 text-2xl font-bold">☁️ {m.sync.title}</h2>
      <div className="flex flex-col gap-3">
        <p className="text-lg">{m.sync.intro}</p>
        {available === false && !connected ? (
          <Notice tone="warn">{m.sync.unavailable}</Notice>
        ) : connected ? (
          <>
            <Notice tone={tone}>
              <p className="font-bold">{m.sync.status[state.status]}</p>
              <p className="text-base">
                {state.lastSyncedAt
                  ? m.sync.lastSynced(`${formatIsoDate(state.lastSyncedAt, locale)} ${formatClock(state.lastSyncedAt)}`)
                  : m.sync.never}
              </p>
            </Notice>
            <Button block onClick={() => void getSync().syncNow()} disabled={state.status === "syncing"}>
              🔄 {m.sync.syncNow}
            </Button>
            <Button variant="ghost" onClick={() => setConfirmOff(true)}>
              {m.sync.disconnect}
            </Button>
          </>
        ) : (
          <form
            className="flex flex-col gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              void connect();
            }}
          >
            <Field label={m.sync.codeLabel} hint={m.sync.codeHint} htmlFor="sync-code">
              <TextInput
                id="sync-code"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                autoComplete="off"
                autoCapitalize="off"
                autoCorrect="off"
                spellCheck={false}
              />
            </Field>
            {error ? <Notice tone="error">{error}</Notice> : null}
            <Button type="submit" block disabled={busy || !code.trim() || available === undefined}>
              ☁️ {busy ? m.sync.connecting : m.sync.connect}
            </Button>
          </form>
        )}
      </div>
      <ConfirmDialog
        open={confirmOff}
        title={m.sync.disconnectTitle}
        confirmLabel={m.sync.disconnect}
        cancelLabel={m.common.cancel}
        onCancel={closeOff}
        onConfirm={() => {
          setConfirmOff(false);
          getSync().disconnect();
        }}
      >
        {m.sync.disconnectBody}
      </ConfirmDialog>
    </Card>
  );
}
