"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useTodayDoses } from "@/lib/hooks";
import { useMessages } from "@/lib/i18n";

// Lembretes locais: enquanto a app está aberta, quando uma toma chega à hora
// mostra uma faixa no topo, faz um som curto e, se o utilizador permitiu,
// mostra uma notificação do sistema (via service worker).

let audioCtx: AudioContext | null = null;

function unlockAudio() {
  if (audioCtx || typeof window === "undefined" || !("AudioContext" in window)) return;
  audioCtx = new AudioContext();
}

function chime() {
  if (!audioCtx) return;
  const t = audioCtx.currentTime;
  [660, 880].forEach((freq, i) => {
    const osc = audioCtx!.createOscillator();
    const gain = audioCtx!.createGain();
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, t + i * 0.35);
    gain.gain.exponentialRampToValueAtTime(0.3, t + i * 0.35 + 0.05);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.35 + 0.3);
    osc.connect(gain).connect(audioCtx!.destination);
    osc.start(t + i * 0.35);
    osc.stop(t + i * 0.35 + 0.32);
  });
}

async function systemNotify(title: string) {
  if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    if (reg) await reg.showNotification(title, { icon: "/icons/icon-192.png", tag: title });
    else new Notification(title);
  } catch {
    // Alguns navegadores não permitem notificações fora do service worker.
  }
}

export function ReminderWatcher() {
  const { m } = useMessages();
  const { doses } = useTodayDoses();
  const notified = useRef(new Set<string>());
  const [banner, setBanner] = useState<string | null>(null);

  useEffect(() => {
    const unlock = () => unlockAudio();
    window.addEventListener("pointerdown", unlock, { once: true });
    return () => window.removeEventListener("pointerdown", unlock);
  }, []);

  useEffect(() => {
    if (!doses) return;
    const due = doses.filter((d) => d.view === "due");
    // Uma toma adiada volta a avisar quando o adiamento termina.
    const fresh = due.filter((d) => !notified.current.has(d.id + (d.log?.snoozedUntil ?? "")));
    if (!fresh.length) {
      if (!due.length) setBanner(null);
      return;
    }
    fresh.forEach((d) => notified.current.add(d.id + (d.log?.snoozedUntil ?? "")));
    const names = [...new Set(fresh.map((d) => d.medication.name))].join(", ");
    const text = m.reminders.dueNow(names);
    setBanner(text);
    chime();
    if ("vibrate" in navigator) navigator.vibrate?.([200, 100, 200]);
    void systemNotify(text);
  }, [doses, m]);

  if (!banner) return null;
  return (
    <div role="alert" className="fixed inset-x-0 top-0 z-40 pt-safe">
      <div className="mx-auto mt-2 flex max-w-xl items-center gap-3 rounded-2xl bg-overdue px-4 py-3 text-white shadow-lg mx-4">
        <span aria-hidden className="text-2xl">⏰</span>
        <p className="flex-1 text-lg font-bold">{banner}</p>
        <Link href="/" onClick={() => setBanner(null)} className="min-h-12 rounded-xl bg-white px-4 py-2 text-lg font-bold text-overdue">
          {m.reminders.open}
        </Link>
        <button type="button" aria-label={m.common.close} onClick={() => setBanner(null)} className="min-h-12 min-w-12 text-2xl font-bold">
          ×
        </button>
      </div>
    </div>
  );
}
