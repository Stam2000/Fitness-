"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LogOut, Loader2, ShieldCheck, UserRound } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";

/**
 * Carte « compte » des réglages : identité et déconnexion.
 *
 * La déconnexion vide les caches du service worker : les pages sont mises en
 * cache en « réseau d'abord » (voir public/sw.js), sans quoi celles du compte
 * précédent resteraient consultables hors ligne après un changement d'utilisateur.
 */
export default function AccountCard({
  name,
  email,
  isAdmin,
}: {
  name: string;
  email: string;
  isAdmin: boolean;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function signOut() {
    setPending(true);
    try {
      await authClient.signOut();
      if (typeof caches !== "undefined") {
        const names = await caches.keys();
        await Promise.all(names.map((n) => caches.delete(n)));
      }
      router.replace("/login");
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="card flex max-w-2xl items-center gap-3 p-4">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-surface-2 text-muted-2">
        <UserRound size={18} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-1.5 text-sm font-bold">
          {name}
          {isAdmin ? (
            <ShieldCheck size={14} className="text-accent" aria-label="Administrateur" />
          ) : null}
        </p>
        <p className="truncate text-xs text-muted-2">{email}</p>
      </div>
      <Button variant="outline" size="sm" onClick={signOut} disabled={pending}>
        {pending ? (
          <Loader2 size={15} className="animate-spin" />
        ) : (
          <LogOut size={15} />
        )}
        Déconnexion
      </Button>
    </section>
  );
}
