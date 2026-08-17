import Link from "next/link";
import { ChevronRight, Settings, Ticket } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { getUserPreferences } from "@/lib/settings";
import { requireUser } from "@/lib/session";
import SettingsForm from "@/components/SettingsForm";
import AccountCard from "@/components/auth/AccountCard";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const user = await requireUser();
  const [prefs, s] = await Promise.all([
    getUserPreferences(user.id),
    // Réglages globaux : lus pour l'affichage, modifiables par l'admin seul.
    prisma.settings.upsert({ where: { id: 1 }, update: {}, create: { id: 1 } }),
  ]);

  return (
    <main className="flex flex-col gap-4">
      <header className="pt-2">
        <h1 className="flex items-center gap-2 text-2xl font-extrabold italic tracking-tight">
          <Settings size={20} className="text-accent" /> Réglages
        </h1>
        <p className="text-sm text-muted-2">
          {user.isAdmin
            ? "Compte, options vocales, clés API et modèle d'IA."
            : "Compte et options vocales."}
        </p>
      </header>

      <AccountCard name={user.name} email={user.email} isAdmin={user.isAdmin} />

      {user.isAdmin ? (
        <Link
          href="/settings/invitations"
          className="card flex max-w-2xl items-center gap-3 px-4 py-3.5"
        >
          <Ticket size={18} className="text-accent" />
          <span className="flex-1 text-sm font-semibold">Invitations</span>
          <ChevronRight size={18} className="text-muted" />
        </Link>
      ) : null}

      <SettingsForm
        isAdmin={user.isAdmin}
        initial={{
          hasOpenrouterKey:
            Boolean(s.openrouterApiKey) ||
            Boolean(process.env.OPENROUTER_API_KEY),
          hasKieKey: Boolean(s.kieApiKey) || Boolean(process.env.KIE_API_KEY),
          openrouterModel: s.openrouterModel,
          pinnedModels: s.pinnedModels,
          voiceInput: prefs.voiceInput,
          voiceAnnounce: prefs.voiceAnnounce,
          voiceModel: s.voiceModel,
          visionModel: s.visionModel,
        }}
      />
    </main>
  );
}
