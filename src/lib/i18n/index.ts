"use client";

import { useLocale } from "../settings";
import type { Locale } from "../types";
import { pt, type Messages } from "./pt";
import { zh } from "./zh";

export const messages: Record<Locale, Messages> = { pt, zh };

export function useMessages(): { m: Messages; locale: Locale } {
  const locale = useLocale();
  return { m: messages[locale], locale };
}

export type { Messages };
