import { redirect } from "next/navigation";
import { KeyRound, TriangleAlert } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { completeSetup } from "@/app/auth-actions";
import AuthShell from "@/components/auth/AuthShell";
import AuthField from "@/components/auth/AuthField";
import AuthForm from "@/components/auth/AuthForm";

export const dynamic = "force-dynamic";

/**
 * Première installation : crée le compte administrateur et lui rattache les
 * données déjà présentes en base (programmes, séances, mesures, photos créés
 * avant l'arrivée des comptes).
 *
 * Deux verrous : la page disparaît dès qu'un compte existe, et elle exige le
 * jeton SETUP_TOKEN défini côté serveur.
 */
export default async function SetupPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  if ((await prisma.user.count()) > 0) redirect("/login");

  const { token } = await searchParams;
  const presetToken = typeof token === "string" ? token : "";
  const [programs, sessions, measurements] = await Promise.all([
    prisma.program.count({ where: { userId: null } }),
    prisma.workoutSession.count({ where: { userId: null } }),
    prisma.bodyMeasurement.count({ where: { userId: null } }),
  ]);
  const hasLegacyData = programs + sessions + measurements > 0;

  if (!process.env.SETUP_TOKEN) {
    return (
      <AuthShell
        icon={TriangleAlert}
        title="Installation bloquée"
        subtitle="La variable SETUP_TOKEN n'est pas définie côté serveur."
      >
        <p className="text-sm text-muted-2">
          Définis <code className="font-mono text-ink">SETUP_TOKEN</code> dans
          l&apos;environnement de l&apos;application, puis recharge cette page.
          Ce jeton protège la création du compte administrateur et la reprise
          des données existantes.
        </p>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      icon={KeyRound}
      title="Première installation"
      subtitle="Crée le compte administrateur de cette instance."
    >
      {hasLegacyData ? (
        <p className="mb-4 rounded-2xl border border-accent/40 bg-accent/10 px-3.5 py-2.5 text-sm text-accent">
          {programs} programme{programs > 1 ? "s" : ""}, {sessions} séance
          {sessions > 1 ? "s" : ""} et {measurements} mesure
          {measurements > 1 ? "s" : ""} sans propriétaire seront rattachés à ce
          compte.
        </p>
      ) : null}

      <AuthForm action={completeSetup} submitLabel="Créer le compte">
        {/* Jeton passé dans l'URL (?token=…) : on ne le redemande pas. */}
        {presetToken ? (
          <input type="hidden" name="token" defaultValue={presetToken} />
        ) : (
          <AuthField
            label="Jeton d'installation"
            name="token"
            type="password"
            required
            autoComplete="off"
            hint="Valeur de SETUP_TOKEN."
          />
        )}
        <AuthField label="Nom" name="name" required autoComplete="name" />
        <AuthField
          label="E-mail"
          name="email"
          type="email"
          required
          autoComplete="email"
        />
        <AuthField
          label="Mot de passe"
          name="password"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          hint="8 caractères minimum."
        />
      </AuthForm>
    </AuthShell>
  );
}
