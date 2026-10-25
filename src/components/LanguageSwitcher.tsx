"use client";

import { useMessages } from "@/lib/i18n";
import { setLocale } from "@/lib/settings";
import type { Locale } from "@/lib/types";

const options: { value: Locale; label: string }[] = [
  { value: "pt", label: "PT" },
  { value: "zh", label: "中文" },
];

export function LanguageSwitcher() {
  const { m, locale } = useMessages();
  return (
    <div role="group" aria-label={m.lang.label} className="flex rounded-2xl bg-white p-1 ring-2 ring-primary">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={locale === o.value}
          onClick={() => setLocale(o.value)}
          className={`min-h-12 min-w-16 rounded-xl px-3 text-lg font-bold ${
            locale === o.value ? "bg-primary text-white" : "text-primary"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
