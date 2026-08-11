"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import ProgramEditor, { type EditableProgram } from "@/components/ProgramEditor";
import { saveNextBlock } from "@/app/actions";
import { btn, Button } from "@/components/ui/button";

// Génération du bloc suivant d'un programme : l'IA analyse les performances
// du bloc écoulé et propose un draft, relu et ajusté avant enregistrement.
export default function NextBlockFlow({
  programId,
  programName,
  blockNumber,
  blockCycles,
  completedCycles,
  hasOpenrouterKey,
}: {
  programId: string;
  programName: string;
  blockNumber: number;
  blockCycles: number | null;
  completedCycles: number;
  hasOpenrouterKey: boolean;
}) {
  const router = useRouter();
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<EditableProgram | null>(null);

  async function generate() {
    setGenerating(true);
    setError(null);
    try {
      const res = await fetch(`/api/programs/${programId}/next-block`, {
        method: "POST",
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Erreur lors de la génération");
        return;
      }
      setDraft(json.draft as EditableProgram);
    } catch {
      setError("Erreur réseau. Vérifie ta connexion et réessaie.");
    } finally {
      setGenerating(false);
    }
  }

  async function save(program: EditableProgram) {
    setSaving(true);
    try {
      const id = await saveNextBlock(programId, {
        name: program.name,
        description: program.description ?? null,
        blockCycles: program.blockCycles ?? null,
        days: program.days.map((d) => ({
          name: d.name,
          focus: d.focus ?? null,
          exercises: d.exercises.map((ex) => ({
            name: ex.name,
            sets: ex.sets,
            reps: ex.reps,
            restSeconds: ex.restSeconds,
            weightHint: ex.weightHint ?? null,
            equipment: ex.equipment ?? [],
            muscles: ex.muscles ?? [],
            targetSeconds: ex.targetSeconds ?? null,
            setSeconds: ex.setSeconds ?? null,
            transitionSeconds: ex.transitionSeconds ?? null,
            notes: ex.notes ?? null,
            variations: (ex.variations ?? []).map((v) => ({
              ...v,
              muscles: v.muscles ?? [],
            })),
          })),
        })),
      });
      router.push(`/programs/${id}`);
    } catch {
      setError("Impossible d'enregistrer le bloc suivant.");
      setSaving(false);
    }
  }

  if (draft) {
    return (
      <main className="flex flex-col gap-4 pt-2">
        <div className="rounded-2xl border-[1.5px] border-accent/50 bg-accent/10 p-3.5 text-sm font-semibold text-accent">
          ✨ Bloc {blockNumber + 1} généré à partir de tes performances !
          Modifie-le si besoin puis enregistre-le.
        </div>
        {error && (
          <div className="rounded-2xl border border-danger/40 bg-danger/10 p-3 text-sm text-danger">
            {error}
          </div>
        )}
        <ProgramEditor
          initial={draft}
          onSave={save}
          saveLabel={`💾 Enregistrer le bloc ${blockNumber + 1}`}
          saving={saving}
        />
        <button
          onClick={() => setDraft(null)}
          className="pb-2 text-sm font-semibold text-muted"
        >
          ← Revenir et régénérer
        </button>
      </main>
    );
  }

  return (
    <main className="flex max-w-2xl flex-col gap-4 pt-2">
      <header>
        <h1 className="text-[21px] font-extrabold italic leading-tight tracking-tight">
          Bloc suivant
        </h1>
        <p className="mt-1 text-[13.5px] text-muted-2">
          {programName} · bloc {blockNumber} — {completedCycles} cycle
          {completedCycles > 1 ? "s" : ""} terminé
          {completedCycles > 1 ? "s" : ""}
          {blockCycles != null ? ` sur ${blockCycles} prévus` : ""}
        </p>
      </header>

      <div className="card p-4 text-sm leading-relaxed text-muted-2">
        <p>
          🤖 L&apos;IA va analyser les charges, répétitions et séries manquées
          de tout le bloc, puis concevoir la suite : nouvelles fourchettes,
          charges de départ concrètes, variantes plus difficiles ou décharge si
          besoin.
        </p>
        <p className="mt-2">
          L&apos;ancien bloc sera archivé, mais ton historique et tes courbes
          de progression continuent sans coupure.
        </p>
      </div>

      {!hasOpenrouterKey && (
        <div className="rounded-2xl border border-danger/40 bg-danger/10 p-3.5 text-sm">
          ⚠️ Aucune clé OpenRouter configurée.{" "}
          <Link href="/settings" className="font-semibold underline">
            Ajoute ta clé dans Réglages
          </Link>{" "}
          pour générer le bloc suivant.
        </div>
      )}

      {error && (
        <div className="rounded-2xl border border-danger/40 bg-danger/10 p-3 text-sm text-danger">
          {error}
        </div>
      )}

      <Button
        onClick={generate}
        disabled={generating || !hasOpenrouterKey}
        variant="primary"
        size="lg"
        className="text-[17px]"
      >
        {generating
          ? "🤖 Analyse et génération en cours…"
          : `✨ Générer le bloc ${blockNumber + 1}`}
      </Button>
      <p className="-mt-2 text-center text-xs text-muted">
        🤖 10 à 30 secondes selon le modèle choisi
      </p>

      <Link
        href={`/programs/${programId}`}
        className={btn("outline", "md", "text-center")}
      >
        ← Revenir au programme
      </Link>
    </main>
  );
}
