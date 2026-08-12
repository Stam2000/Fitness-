"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { CircleAlert, Loader2 } from "lucide-react";
import type { ReactNode } from "react";
import type { AuthFormState } from "@/app/auth-actions";
import { btn } from "@/components/ui/button";

function SubmitButton({ label }: { label: string }) {
  // useFormStatus doit vivre dans un enfant du <form> pour observer son envoi.
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={btn("primary", "lg", "w-full")}>
      {pending ? <Loader2 size={16} className="animate-spin" /> : null}
      {label}
    </button>
  );
}

/**
 * Enveloppe des trois formulaires d'authentification : gère l'état d'erreur
 * renvoyé par la Server Action et l'indicateur d'envoi. En cas de succès,
 * l'action redirige — le composant n'a pas d'état « connecté » à afficher.
 */
export default function AuthForm({
  action,
  submitLabel,
  children,
}: {
  action: (prev: AuthFormState, formData: FormData) => Promise<AuthFormState>;
  submitLabel: string;
  children: ReactNode;
}) {
  const [state, formAction] = useActionState(action, { error: null });

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {children}
      {state.error ? (
        <p
          role="alert"
          className="flex items-start gap-2 rounded-2xl border border-danger/40 bg-danger/10 px-3.5 py-2.5 text-sm text-danger"
        >
          <CircleAlert size={16} className="mt-0.5 shrink-0" />
          {state.error}
        </p>
      ) : null}
      <SubmitButton label={submitLabel} />
    </form>
  );
}
