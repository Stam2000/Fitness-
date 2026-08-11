"use client";

import { Check, Loader2, Replace, Shuffle, WandSparkles, X } from "lucide-react";
import type { ChatProposal } from "@/lib/chat-shared";
import { Button } from "@/components/ui/button";

const KIND_META: Record<
  ChatProposal["kind"],
  { title: string; Icon: typeof WandSparkles }
> = {
  program_edit: { title: "Modification du programme", Icon: WandSparkles },
  substitution: { title: "Remplacement d'exercice", Icon: Replace },
  variations: { title: "Nouvelles variantes", Icon: Shuffle },
};

type ProposalCardProps = {
  proposal: ChatProposal;
  status: string | null;
  // Id BDD du message assistant (null tant que le stream n'est pas terminé).
  messageId: string | null;
  busy: boolean;
  onApply: (messageId: string) => void;
  onReject: (messageId: string) => void;
};

// Carte de confirmation d'une proposition : résumé du changement +
// Appliquer / Annuler. Rien n'est écrit en base avant « Appliquer ».
export default function ProposalCard({
  proposal,
  status,
  messageId,
  busy,
  onApply,
  onReject,
}: ProposalCardProps) {
  const { title, Icon } = KIND_META[proposal.kind];
  const ready = messageId !== null && !messageId.startsWith("tmp-");

  return (
    <div className="card mt-2 space-y-3 p-4">
      <div className="flex items-center gap-2">
        <Icon size={17} className="text-accent" />
        <span className="text-sm font-semibold">{title}</span>
      </div>

      <div className="max-h-56 space-y-1.5 overflow-y-auto text-sm text-muted">
        {proposal.kind === "program_edit" &&
          (proposal.changes.length > 0 ? (
            proposal.changes.map((c, i) => (
              <p key={i} className="leading-snug">
                • {c}
              </p>
            ))
          ) : (
            <p>Aucun changement détecté dans « {proposal.programName} ».</p>
          ))}

        {proposal.kind === "substitution" && (
          <>
            <p>
              <span className="text-ink">{proposal.oldName}</span>
              {" → "}
              <span className="font-semibold text-ink">
                {proposal.replacement.name}
              </span>{" "}
              ({proposal.dayName})
            </p>
            <p>
              {proposal.replacement.sets} × {proposal.replacement.reps} · repos{" "}
              {proposal.replacement.restSeconds}s
              {proposal.replacement.weightHint
                ? ` · ${proposal.replacement.weightHint}`
                : ""}
            </p>
            {(proposal.replacement.muscles ?? []).length > 0 && (
              <p>Muscles : {proposal.replacement.muscles!.join(", ")}</p>
            )}
            {(proposal.replacement.equipment ?? []).length > 0 && (
              <p>Matériel : {proposal.replacement.equipment!.join(", ")}</p>
            )}
            {proposal.replacement.notes && (
              <p>Note : {proposal.replacement.notes}</p>
            )}
            <p className="text-xs text-muted-2">
              Les variantes et médias de l’ancien exercice seront réinitialisés.
            </p>
          </>
        )}

        {proposal.kind === "variations" && (
          <>
            <p>
              En rotation avec{" "}
              <span className="text-ink">{proposal.exerciseName}</span> :
            </p>
            {proposal.variations.map((v, i) => (
              <p key={i} className="leading-snug">
                • <span className="text-ink">{v.name}</span> — {v.sets} ×{" "}
                {v.reps} · repos {v.restSeconds}s
              </p>
            ))}
            <p className="text-xs text-muted-2">
              Remplace les variantes existantes de cet exercice.
            </p>
          </>
        )}
      </div>

      {status === "pending" && (
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            disabled={!ready || busy}
            onClick={() => messageId && onApply(messageId)}
          >
            {busy ? (
              <Loader2 size={15} className="animate-spin" />
            ) : (
              <Check size={15} />
            )}
            Appliquer
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={!ready || busy}
            onClick={() => messageId && onReject(messageId)}
          >
            <X size={15} />
            Annuler
          </Button>
        </div>
      )}
      {status === "applied" && (
        <p className="flex items-center gap-1.5 text-sm font-semibold text-accent">
          <Check size={15} /> Appliqué
        </p>
      )}
      {status === "rejected" && (
        <p className="flex items-center gap-1.5 text-sm text-muted-2">
          <X size={15} /> Annulé
        </p>
      )}
      {status === "stale" && (
        <p className="text-sm text-warm-light">
          Proposition obsolète — le programme a changé entre-temps.
        </p>
      )}
    </div>
  );
}
