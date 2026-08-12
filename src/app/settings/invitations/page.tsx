import Link from "next/link";
import { ChevronLeft, Ticket } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/session";
import InvitationsManager from "@/components/auth/InvitationsManager";

export const dynamic = "force-dynamic";

export default async function InvitationsPage() {
  await requireAdmin();

  const codes = await prisma.inviteCode.findMany({
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  return (
    <main className="flex flex-col gap-4">
      <header className="pt-2">
        <Link
          href="/settings"
          className="inline-flex items-center gap-1 text-sm text-muted hover:text-ink"
        >
          <ChevronLeft size={16} /> Réglages
        </Link>
        <h1 className="mt-1 flex items-center gap-2 text-2xl font-extrabold italic tracking-tight">
          <Ticket size={20} className="text-accent" /> Invitations
        </h1>
        <p className="text-sm text-muted-2">
          L&apos;inscription est fermée : sans code, personne ne peut créer de
          compte. Les comptes invités utilisent tes clés API.
        </p>
      </header>

      <InvitationsManager
        codes={codes.map((c) => ({
          id: c.id,
          code: c.code,
          label: c.label,
          maxUses: c.maxUses,
          usedCount: c.usedCount,
          expiresAt: c.expiresAt?.toISOString() ?? null,
          revokedAt: c.revokedAt?.toISOString() ?? null,
        }))}
      />
    </main>
  );
}
