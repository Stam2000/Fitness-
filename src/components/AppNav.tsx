"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV_TABS, isTabActive } from "@/components/nav-tabs";

/**
 * Navigation adaptative :
 * - téléphone (< md) : barre du bas, masquée pendant une séance
 * - tablette (md)    : barre latérale réduite aux icônes
 * - ordinateur (lg+) : barre latérale avec libellés
 */
export default function AppNav() {
  const pathname = usePathname();
  const inWorkout = pathname.startsWith("/workout/");

  return (
    <>
      {/* Barre latérale — tablette et ordinateur */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-[4.5rem] flex-col border-r border-card-border bg-surface/95 backdrop-blur md:flex lg:w-60">
        <div className="flex items-center gap-2 px-3 py-5 lg:px-5">
          <span className="text-2xl">💪</span>
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
            return (
              <Link
                key={tab.href}
                href={tab.href}
                title={tab.label}
                className={`flex flex-col items-center gap-0.5 rounded-[14px] px-2 py-2.5 text-[11px] lg:flex-row lg:gap-3 lg:rounded-full lg:px-4 lg:py-3 lg:text-sm ${
                  active
                    ? "bg-accent/[0.12] font-extrabold text-accent"
                    : "font-medium text-muted hover:bg-surface-2 hover:text-ink"
                }`}
              >
                <span className="text-xl leading-none">{tab.icon}</span>
                <span className="lg:text-[15px]">{tab.label}</span>
              </Link>
            );
          })}
        </nav>
      </aside>

      {/* Barre du bas — téléphone uniquement */}
      {!inWorkout && (
        <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-card-border bg-[#10151c]/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
          <div className="mx-auto flex max-w-lg items-center justify-around px-2 py-1.5">
            {NAV_TABS.map((tab) => {
              const active = isTabActive(tab.href, pathname);
              return (
                <Link
                  key={tab.href}
                  href={tab.href}
                  className={`flex flex-col items-center gap-0.5 rounded-[14px] text-[11px] ${
                    active
                      ? "bg-accent/[0.12] px-3.5 py-1.5 font-extrabold text-accent"
                      : "px-2 py-1.5 font-medium text-muted"
                  }`}
                >
                  <span className="text-xl leading-none">{tab.icon}</span>
                  {tab.label}
                </Link>
              );
            })}
          </div>
        </nav>
      )}
    </>
  );
}
