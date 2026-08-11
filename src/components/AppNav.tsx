"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV_TABS, isTabActive } from "@/components/nav-tabs";

/**
 * Navigation adaptative, icônes seules (libellés en infobulle/aria) :
 * - téléphone (< md) : barre du bas, masquée pendant une séance
 * - tablette (md)    : barre latérale réduite aux icônes
 * - ordinateur (lg+) : barre latérale icône + libellé
 */
export default function AppNav() {
  const pathname = usePathname();
  const inWorkout = pathname.startsWith("/workout/");

  return (
    <>
      {/* Barre latérale — tablette et ordinateur */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-[4.5rem] flex-col border-r border-card-border bg-surface/95 backdrop-blur md:flex lg:w-60">
        <div className="flex items-center justify-center gap-2 px-3 py-5 lg:justify-start lg:px-5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/logo-192.png"
            alt="Mon Coach Fitness"
            className="h-9 w-9 rounded-xl"
          />
          <span className="hidden text-base font-extrabold italic leading-tight tracking-tight lg:block">
            Mon Coach
            <span className="block text-xs font-normal not-italic tracking-normal text-muted">
              Fitness
            </span>
          </span>
        </div>
        <nav className="flex flex-1 flex-col gap-1 px-2 lg:px-3">
          {NAV_TABS.map((tab) => {
            const active = isTabActive(tab.href, pathname);
            const Icon = tab.icon;
            return (
              <Link
                key={tab.href}
                href={tab.href}
                title={tab.label}
                aria-label={tab.label}
                aria-current={active ? "page" : undefined}
                className={`flex items-center justify-center rounded-[14px] py-3 lg:justify-start lg:gap-3 lg:rounded-full lg:px-4 ${
                  active
                    ? "bg-accent/[0.12] text-accent"
                    : "text-muted hover:bg-surface-2 hover:text-ink"
                }`}
              >
                <Icon size={21} strokeWidth={active ? 2.5 : 2} />
                <span
                  className={`hidden text-[15px] lg:block ${
                    active ? "font-extrabold" : "font-medium"
                  }`}
                >
                  {tab.label}
                </span>
              </Link>
            );
          })}
        </nav>
      </aside>

      {/* Barre du bas — téléphone uniquement, icônes seules */}
      {!inWorkout && (
        <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-card-border bg-[#10151c]/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
          <div className="mx-auto flex max-w-lg items-center justify-around px-2 py-2">
            {NAV_TABS.map((tab) => {
              const active = isTabActive(tab.href, pathname);
              const Icon = tab.icon;
              return (
                <Link
                  key={tab.href}
                  href={tab.href}
                  title={tab.label}
                  aria-label={tab.label}
                  aria-current={active ? "page" : undefined}
                  className={`flex h-11 items-center justify-center rounded-full transition-colors ${
                    active
                      ? "w-14 bg-accent/[0.12] text-accent"
                      : "w-11 text-muted"
                  }`}
                >
                  <Icon size={22} strokeWidth={active ? 2.5 : 2} />
                </Link>
              );
            })}
          </div>
        </nav>
      )}
    </>
  );
}
