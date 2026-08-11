import type { LucideIcon } from "lucide-react";
import {
  CalendarDays,
  Dumbbell,
  House,
  PersonStanding,
  Settings,
  Sparkles,
} from "lucide-react";

export type NavTab = { href: string; label: string; icon: LucideIcon };

export const NAV_TABS: NavTab[] = [
  { href: "/", label: "Accueil", icon: House },
  { href: "/programs/new", label: "Créer", icon: Sparkles },
  { href: "/equipment", label: "Matériel", icon: Dumbbell },
  { href: "/history", label: "Suivi", icon: CalendarDays },
  { href: "/body", label: "Corps", icon: PersonStanding },
  { href: "/settings", label: "Réglages", icon: Settings },
];

export function isTabActive(href: string, pathname: string): boolean {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}
