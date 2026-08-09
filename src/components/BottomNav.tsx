"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/", label: "Accueil", icon: "🏠" },
  { href: "/programs/new", label: "Créer", icon: "✨" },
  { href: "/equipment", label: "Matériel", icon: "🏋️" },
  { href: "/history", label: "Historique", icon: "📈" },
  { href: "/settings", label: "Réglages", icon: "⚙️" },
];

export default function BottomNav() {
  const pathname = usePathname();
  if (pathname.startsWith("/workout/")) return null;

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface/95 backdrop-blur pb-[env(safe-area-inset-bottom)]">
      <div className="mx-auto flex max-w-lg items-stretch justify-around">
        {TABS.map((tab) => {
          const active =
            tab.href === "/"
              ? pathname === "/"
              : pathname.startsWith(tab.href);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={`flex min-w-14 flex-1 flex-col items-center gap-0.5 py-2 text-[11px] ${
                active ? "text-accent" : "text-muted"
              }`}
            >
              <span className="text-xl leading-none">{tab.icon}</span>
              {tab.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
