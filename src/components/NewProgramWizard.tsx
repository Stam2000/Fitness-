"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import ProgramEditor, { type EditableProgram } from "@/components/ProgramEditor";
import ModelPicker from "@/components/ModelPicker";
import { saveProgram, setDefaultModel } from "@/app/actions";

const GOALS = [
  "Prise de muscle",
  "Perte de poids",
  "Force",
  "Endurance",
  "Remise en forme",
];
const LEVELS = ["Débutant", "Intermédiaire", "Avancé"];
const DURATIONS = [30, 45, 60, 90];

type LocationView = {
  id: string;
  name: string;
  icon: string | null;
  equipmentCount: number;
};

export default function NewProgramWizard({
  locations,
  hasOpenrouterKey,
  defaultModel,
  pinnedModels,
}: {
  locations: LocationView[];
  hasOpenrouterKey: boolean;
  defaultModel: string;
  pinnedModels: string[];
}) {
  const router = useRouter();
  const [locationId, setLocationId] = useState(locations[0]?.id ?? "");
  const [model, setModel] = useState(defaultModel);
  // Suit les promotions faites depuis le sélecteur, sans recharger la page.
  const [currentDefault, setCurrentDefault] = useState(defaultModel);
  // 1 ou 2 objectifs combinables (ex. prise de muscle + perte de poids).
  const [goals, setGoals] = useState<string[]>([GOALS[0]]);
  const [level, setLevel] = useState(LEVELS[1]);
  const [daysPerWeek, setDaysPerWeek] = useState(3);
  const [sessionMinutes, setSessionMinutes] = useState(60);
  const [notes, setNotes] = useState("");
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<EditableProgram | null>(null);

  const goal = goals.join(" + ");

  function toggleGoal(g: string) {
    setGoals((prev) => {
      if (prev.includes(g)) {
        // Toujours au moins un objectif sélectionné.
        return prev.length > 1 ? prev.filter((x) => x !== g) : prev;
      }
      if (prev.length >= 2) return prev;
      return [...prev, g];
    });
  }

  async function generate() {
    setGenerating(true);
    setError(null);
    try {
      const res = await fetch("/api/generate-program", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          locationId,
          goal,
          level,
          daysPerWeek,
          sessionMinutes,
          notes: notes.trim() || undefined,
          model: model.trim() || undefined,
        }),
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
      const id = await saveProgram(
        {
          name: program.name,
          description: program.description ?? null,
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
              notes: ex.notes ?? null,
              variations: ex.variations ?? [],
            })),
          })),
        },
        { locationId, goal, level }
      );
      router.push(`/programs/${id}`);
    } catch {
      setError("Impossible d'enregistrer le programme.");
      setSaving(false);
    }
  }

  if (locations.length === 0) {
    return (
      <div className="rounded-2xl border border-border bg-surface p-6 text-center">
        <p className="text-4xl">📍</p>
        <h2 className="mt-3 text-lg font-semibold">
          Commence par créer un contexte
        </h2>
        <p className="mt-1 text-sm text-muted">
          Un contexte est un endroit où tu t&apos;entraînes (Maison, Gym X…)
          avec son équipement. L&apos;IA s&apos;en sert pour bâtir ton
          programme.
        </p>
        <Link
          href="/equipment"
          className="mt-4 inline-block rounded-xl bg-accent px-5 py-3 font-semibold text-black"
        >
          Créer mon premier contexte
        </Link>
      </div>
    );
  }

  if (draft) {
    return (
      <div className="flex flex-col gap-4">
        <div className="rounded-2xl border border-accent/40 bg-accent/10 p-3 text-sm">
          ✨ Programme généré ! Modifie-le si besoin puis enregistre-le.
        </div>
        {error && (
          <div className="rounded-xl border border-danger/40 bg-danger/10 p-3 text-sm text-danger">
            {error}
          </div>
        )}
        <ProgramEditor
          initial={draft}
          onSave={save}
          saveLabel="💾 Enregistrer le programme"
          saving={saving}
        />
        <button
          onClick={() => setDraft(null)}
          className="pb-2 text-sm text-muted"
        >
          ← Revenir au formulaire et régénérer
        </button>
      </div>
    );
  }

  return (
    <div className="flex max-w-2xl flex-col gap-5">
      {!hasOpenrouterKey && (
        <div className="rounded-xl border border-danger/40 bg-danger/10 p-3 text-sm">
          ⚠️ Aucune clé OpenRouter configurée.{" "}
          <Link href="/settings" className="font-semibold underline">
            Ajoute ta clé dans Réglages
          </Link>{" "}
          pour générer un programme.
        </div>
      )}

      <section>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">
          Où t&apos;entraînes-tu ?
        </h2>
        <div className="flex flex-wrap gap-2">
          {locations.map((l) => (
            <button
              key={l.id}
              onClick={() => setLocationId(l.id)}
              className={`rounded-xl px-4 py-3 text-sm font-semibold ${
                l.id === locationId
                  ? "bg-accent text-black"
                  : "border border-border bg-surface"
              }`}
            >
              {l.icon} {l.name}
              <span className="ml-1.5 text-xs opacity-70">
                {l.equipmentCount} équip.
              </span>
            </button>
          ))}
          <Link
            href="/equipment"
            className="rounded-xl border border-accent/60 bg-accent/10 px-4 py-3 text-sm font-semibold text-accent"
          >
            ＋ Ajouter un contexte
          </Link>
        </div>
        <p className="mt-1.5 text-xs text-muted">
          L&apos;équipement coché dans « Matériel » pour ce contexte sera
          utilisé.
        </p>
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">
          Objectifs
        </h2>
        <div className="flex flex-wrap gap-2">
          {GOALS.map((g) => {
            const selected = goals.includes(g);
            const full = goals.length >= 2 && !selected;
            return (
              <button
                key={g}
                onClick={() => toggleGoal(g)}
                className={`rounded-full px-3.5 py-2 text-sm ${
                  selected
                    ? "bg-accent/15 text-accent border border-accent"
                    : `border border-border bg-surface text-muted ${full ? "opacity-40" : ""}`
                }`}
              >
                {selected && goals.length > 1 ? "✓ " : ""}
                {g}
              </button>
            );
          })}
        </div>
        <p className="mt-1.5 text-xs text-muted">
          Jusqu&apos;à 2 objectifs combinables (ex. prise de muscle + perte de
          poids).
        </p>
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">
          Niveau
        </h2>
        <div className="flex gap-2">
          {LEVELS.map((l) => (
            <button
              key={l}
              onClick={() => setLevel(l)}
              className={`flex-1 rounded-xl py-2.5 text-sm ${
                l === level
                  ? "bg-accent/15 text-accent border border-accent"
                  : "border border-border bg-surface text-muted"
              }`}
            >
              {l}
            </button>
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">
          Séances par semaine : {daysPerWeek}
        </h2>
        <input
          type="range"
          min={1}
          max={7}
          value={daysPerWeek}
          onChange={(e) => setDaysPerWeek(Number(e.target.value))}
          className="w-full accent-[#a3e635]"
        />
        <div className="flex justify-between text-xs text-muted">
          {[1, 2, 3, 4, 5, 6, 7].map((n) => (
            <span key={n}>{n}</span>
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">
          Durée de séance
        </h2>
        <div className="flex gap-2">
          {DURATIONS.map((d) => (
            <button
              key={d}
              onClick={() => setSessionMinutes(d)}
              className={`flex-1 rounded-xl py-2.5 text-sm ${
                d === sessionMinutes
                  ? "bg-accent/15 text-accent border border-accent"
                  : "border border-border bg-surface text-muted"
              }`}
            >
              {d} min
            </button>
          ))}
        </div>
      </section>

      <section>
        <div className="mb-2 flex items-baseline justify-between gap-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">
            Modèle d&apos;IA
          </h2>
          {model.trim() !== currentDefault && (
            <button
              onClick={() => setModel(currentDefault)}
              className="text-xs text-accent"
            >
              ↺ Revenir au défaut
            </button>
          )}
        </div>
        <ModelPicker
          value={model}
          onChange={setModel}
          initialPinned={pinnedModels}
          defaultModel={currentDefault}
          onSetDefault={(m) => {
            setCurrentDefault(m);
            setDefaultModel(m);
          }}
          inputClassName="bg-surface"
        />
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">
          Précisions (optionnel)
        </h2>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Ex. je veux insister sur les épaules, j'ai mal au genou droit, pas de squat…"
          rows={3}
          className="w-full rounded-xl border border-border bg-surface px-3 py-2.5 text-sm outline-none focus:border-accent"
        />
      </section>

      {error && (
        <div className="rounded-xl border border-danger/40 bg-danger/10 p-3 text-sm text-danger">
          {error}
        </div>
      )}

      <button
        onClick={generate}
        disabled={generating || !locationId}
        className="rounded-xl bg-accent py-4 font-semibold text-black disabled:opacity-50"
      >
        {generating ? "🤖 Génération en cours…" : "✨ Générer mon programme"}
      </button>
      {generating && (
        <p className="text-center text-xs text-muted">
          Cela peut prendre 10 à 30 secondes selon le modèle choisi.
        </p>
      )}
    </div>
  );
}
