export type NavTab = { href: string; label: string; icon: string };

export const NAV_TABS: NavTab[] = [
  { href: "/", label: "Accueil", icon: "🏠" },
  { href: "/programs/new", label: "Créer", icon: "✨" },
  { href: "/equipment", label: "Matériel", icon: "🏋️" },
  { href: "/history", label: "Suivi", icon: "🗓️" },
  { href: "/body", label: "Corps", icon: "🧍" },
  { href: "/settings", label: "Réglages", icon: "⚙️" },
];

export function isTabActive(href: string, pathname: string): boolean {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}
