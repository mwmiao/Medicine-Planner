"use client";

import { LinkButton, Notice } from "@/components/ui";
import { useMessages } from "@/lib/i18n";

export default function NotFound() {
  const { m } = useMessages();
  return (
    <div className="flex flex-col gap-4">
      <Notice tone="warn">{m.common.errorGeneric}</Notice>
      <LinkButton href="/" block>
        {m.nav.today}
      </LinkButton>
    </div>
  );
}
