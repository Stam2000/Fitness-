"use client";

import { useState, useTransition } from "react";
import { Ban, Check, Copy, Loader2, Plus, Trash2 } from "lucide-react";
import {
  createInviteCode,
  deleteInviteCode,
  revokeInviteCode,
} from "@/app/auth-actions";
import { Button } from "@/components/ui/button";
import IconButton from "@/components/ui/IconButton";

export type InviteCodeView = {
  id: string;
  code: string;
  label: string | null;
  maxUses: number;
  usedCount: number;
  expiresAt: string | null;
  revokedAt: string | null;
};

type Status = { text: string; tone: "muted" | "danger" | "accent" };

function statusOf(c: InviteCodeView): Status {
  if (c.revokedAt) return { text: "Révoqué", tone: "danger" };
  if (c.expiresAt && new Date(c.expiresAt) <= new Date())
    return { text: "Expiré", tone: "danger" };
  if (c.usedCount >= c.maxUses) return { text: "Épuisé", tone: "muted" };
  return {
    text: `${c.maxUses - c.usedCount} utilisation${c.maxUses - c.usedCount > 1 ? "s" : ""} restante${c.maxUses - c.usedCount > 1 ? "s" : ""}`,
    tone: "accent",
  };
}

export default function InvitationsManager({
  codes,
}: {
  codes: InviteCodeView[];
}) {
  const [label, setLabel] = useState("");
  const [maxUses, setMaxUses] = useState(1);
  const [expiresInDays, setExpiresInDays] = useState(30);
  const [copied, setCopied] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function create() {
    startTransition(async () => {
      await createInviteCode({
        label,
        maxUses,
        expiresInDays: expiresInDays > 0 ? expiresInDays : null,
      });
      setLabel("");
    });
  }

  // Le lien pré-remplit le champ code de /register : rien à recopier à la main.
  async function copyLink(code: string) {
    const url = `${window.location.origin}/register?code=${encodeURIComponent(code)}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(code);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      // Presse-papiers refusé (contexte non sécurisé) : le code reste lisible.
    }
  }

  return (
    <div className="flex max-w-2xl flex-col gap-5">
      <section className="card flex flex-col gap-3 p-4">
        <h2 className="overline-label">Nouveau code</h2>
        <input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="Pour qui ? (facultatif)"
          className="w-full rounded-full border-[1.5px] border-border bg-surface-2 px-4 py-2.5 text-sm outline-none placeholder:text-muted focus:border-accent"
        />
        <div className="flex gap-3">
          <label className="flex flex-1 flex-col gap-1.5">
            <span className="overline-label">Utilisations</span>
            <input
              type="number"
              min={1}
              max={100}
              value={maxUses}
              onChange={(e) => setMaxUses(Number(e.target.value))}
              className="w-full rounded-full border-[1.5px] border-border bg-surface-2 px-4 py-2.5 text-sm outline-none focus:border-accent"
            />
          </label>
          <label className="flex flex-1 flex-col gap-1.5">
            <span className="overline-label">Validité (jours)</span>
            <input
              type="number"
              min={0}
              value={expiresInDays}
              onChange={(e) => setExpiresInDays(Number(e.target.value))}
              className="w-full rounded-full border-[1.5px] border-border bg-surface-2 px-4 py-2.5 text-sm outline-none focus:border-accent"
            />
          </label>
        </div>
        <p className="text-xs text-muted">0 jour = sans expiration.</p>
        <Button onClick={create} disabled={pending} className="self-start">
          {pending ? (
            <Loader2 size={16} className="animate-spin" />
          ) : (
            <Plus size={16} />
          )}
          Générer
        </Button>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="overline-label">Codes émis</h2>
        {codes.length === 0 ? (
          <p className="card p-4 text-sm text-muted">Aucun code pour le moment.</p>
        ) : (
          codes.map((c) => {
            const status = statusOf(c);
            const toneClass =
              status.tone === "danger"
                ? "text-danger"
                : status.tone === "accent"
                  ? "text-accent"
                  : "text-muted";
            return (
              <div
                key={c.id}
                className="card flex items-center gap-3 px-4 py-3"
              >
                <div className="min-w-0 flex-1">
                  <p className="font-mono text-sm font-bold tracking-widest">
                    {c.code}
                  </p>
                  <p className="truncate text-xs text-muted-2">
                    {c.label ? `${c.label} · ` : ""}
                    <span className={toneClass}>{status.text}</span>
                    {" · "}
                    {c.usedCount}/{c.maxUses} utilisé
                    {c.usedCount > 1 ? "s" : ""}
                  </p>
                </div>
                <IconButton
                  aria-label="Copier le lien d'invitation"
                  size="sm"
                  variant={copied === c.code ? "tint" : "outline"}
                  onClick={() => copyLink(c.code)}
                >
                  {copied === c.code ? <Check size={15} /> : <Copy size={15} />}
                </IconButton>
                {c.revokedAt ? null : (
                  <IconButton
                    aria-label="Révoquer"
                    size="sm"
                    variant="outline"
                    disabled={pending}
                    onClick={() =>
                      startTransition(() => revokeInviteCode(c.id))
                    }
                  >
                    <Ban size={15} />
                  </IconButton>
                )}
                <IconButton
                  aria-label="Supprimer"
                  size="sm"
                  variant="danger"
                  disabled={pending}
                  onClick={() => startTransition(() => deleteInviteCode(c.id))}
                >
                  <Trash2 size={15} />
                </IconButton>
              </div>
            );
          })
        )}
      </section>
    </div>
  );
}
