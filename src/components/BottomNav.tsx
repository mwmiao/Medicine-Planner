"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMessages } from "@/lib/i18n";

function Icon({ name }: { name: "today" | "meds" | "settings" }) {
  const paths = {
    today: "M8 2v3M16 2v3M3.5 9h17M5 4h14a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Zm4 10 2 2 4-4",
    meds: "M10.5 20.5 3.5 13.5a4.95 4.95 0 0 1 7-7l7 7a4.95 4.95 0 0 1-7 7ZM7 10l7 7",
    settings:
      "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm7.4-3a7.4 7.4 0 0 0-.1-1.3l2-1.6-2-3.4-2.4 1a7.6 7.6 0 0 0-2.2-1.3L14.3 3h-4l-.4 2.4a7.6 7.6 0 0 0-2.2 1.3l-2.4-1-2 3.4 2 1.6a7.4 7.4 0 0 0 0 2.6l-2 1.6 2 3.4 2.4-1a7.6 7.6 0 0 0 2.2 1.3l.4 2.4h4l.4-2.4a7.6 7.6 0 0 0 2.2-1.3l2.4 1 2-3.4-2-1.6c.1-.4.1-.9.1-1.3Z",
  };
  return (
    <svg aria-hidden viewBox="0 0 24 24" className="h-8 w-8" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d={paths[name]} />
    </svg>
  );
}

export function BottomNav() {
  const { m } = useMessages();
  const pathname = usePathname() ?? "/";
  const tabs = [
    { href: "/", label: m.nav.today, icon: "today" as const, active: pathname === "/" || pathname.startsWith("/history") },
    { href: "/medications/", label: m.nav.medications, icon: "meds" as const, active: pathname.startsWith("/medications") },
    { href: "/settings/", label: m.nav.settings, icon: "settings" as const, active: pathname.startsWith("/settings") },
  ];
  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 border-t-2 border-line bg-white pb-safe">
      <ul className="mx-auto grid max-w-xl grid-cols-3">
        {tabs.map((t) => (
          <li key={t.href}>
            <Link
              href={t.href}
              aria-current={t.active ? "page" : undefined}
              className={`flex min-h-18 flex-col items-center justify-center gap-0.5 py-2 text-base font-semibold ${
                t.active ? "text-primary" : "text-muted"
              }`}
            >
              <Icon name={t.icon} />
              {t.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
