import Link from "next/link";
import { redirect } from "next/navigation";
import { UserPlus } from "lucide-react";
import { getCurrentUser, needsSetup } from "@/lib/session";
import { registerWithInvite } from "@/app/auth-actions";
import AuthShell from "@/components/auth/AuthShell";
import AuthField from "@/components/auth/AuthField";
import AuthForm from "@/components/auth/AuthForm";

export const dynamic = "force-dynamic";

/** Inscription fermée : il faut un code d'invitation émis par l'administrateur. */
export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  if (await needsSetup()) redirect("/setup");
  if (await getCurrentUser()) redirect("/");

  const { code } = await searchParams;
  const presetCode = typeof code === "string" ? code.toUpperCase() : "";

  return (
    <AuthShell
      icon={UserPlus}
      title="Créer un compte"
      subtitle="Un code d'invitation est nécessaire."
      footer={
        <>
          Déjà inscrit ?{" "}
          <Link href="/login" className="font-semibold text-accent">
            Se connecter
          </Link>
        </>
      }
    >
      <AuthForm action={registerWithInvite} submitLabel="Créer mon compte">
        <AuthField
          label="Code d'invitation"
          name="code"
          required
          defaultValue={presetCode}
          autoComplete="off"
          spellCheck={false}
          className="font-mono uppercase tracking-widest"
        />
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
