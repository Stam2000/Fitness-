import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

/**
 * Cadre commun aux pages publiques (connexion, inscription, installation) :
 * carte centrée, logo, titre et sous-titre. Ces pages sont rendues sans la
 * navigation ni le panneau d'assistant — voir src/app/layout.tsx.
 */
export default function AuthShell({
  icon: Icon,
  title,
  subtitle,
  children,
  footer,
}: {
  icon: LucideIcon;
  title: string;
  subtitle: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-6 px-5 py-10">
      <div className="flex items-center gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/logo-192.png"
          alt="Mon Coach Fitness"
          className="h-11 w-11 rounded-xl"
        />
        <span className="text-lg font-extrabold italic leading-tight tracking-tight">
          Mon Coach
          <span className="block text-xs font-normal not-italic tracking-normal text-muted">
            Fitness
          </span>
        </span>
      </div>

      <section className="card w-full max-w-sm p-6">
        <h1 className="flex items-center gap-2 text-xl font-extrabold italic tracking-tight">
          <Icon size={18} className="text-accent" /> {title}
        </h1>
        <p className="mt-1 text-sm text-muted-2">{subtitle}</p>
        <div className="mt-5">{children}</div>
      </section>

      {footer ? <div className="text-sm text-muted">{footer}</div> : null}
    </main>
  );
}
