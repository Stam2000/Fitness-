import Link from "next/link";
import { redirect } from "next/navigation";
import { LogIn } from "lucide-react";
import { getCurrentUser, needsSetup } from "@/lib/session";
import { signInWithPassword } from "@/app/auth-actions";
import AuthShell from "@/components/auth/AuthShell";
import AuthField from "@/components/auth/AuthField";
import AuthForm from "@/components/auth/AuthForm";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  // Tant qu'aucun compte n'existe, tout mène à /setup : c'est la seule page
  // capable de rattacher les données historiques au premier compte.
  if (await needsSetup()) redirect("/setup");
  if (await getCurrentUser()) redirect("/");

  return (
    <AuthShell
      icon={LogIn}
      title="Connexion"
      subtitle="Retrouve tes programmes et ton suivi."
      footer={
        <>
          Pas encore de compte ?{" "}
          <Link href="/register" className="font-semibold text-accent">
            S&apos;inscrire avec un code
          </Link>
        </>
      }
    >
      <AuthForm action={signInWithPassword} submitLabel="Se connecter">
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
          autoComplete="current-password"
        />
      </AuthForm>
    </AuthShell>
  );
}
