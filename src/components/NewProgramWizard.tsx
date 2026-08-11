"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Check,
  ChevronLeft,
  Loader2,
  MapPin,
  Pencil,
  Plus,
  RotateCcw,
  Sparkles,
  Timer,
  TriangleAlert,
} from "lucide-react";
import ProgramEditor, { type EditableProgram } from "@/components/ProgramEditor";
import ModelPicker from "@/components/ModelPicker";
import { saveProgram, setDefaultModel } from "@/app/actions";
import { btn, Button } from "@/components/ui/button";
import Chip from "@/components/ui/Chip";

const GOALS = [
  "Prise de muscle",
  "Perte de poids",
  "Force",
  "Endurance",
  "Remise en forme",
];
const LEVELS = ["Débutant", "Intermédiaire", "Avancé"];
const DURATIONS = [30, 45, 60, 90];
// Propension de l'IA à réutiliser les exercices déjà en base vs en inventer.
const CREATIVITY_OPTIONS = [
  {
    value: "conservateur",
    label: "Conservateur",
    hint: "Réutilise au maximum les exercices de tes programmes existants (historique de charge préservé).",
  },
  {
    value: "normal",
    label: "Équilibré",
    hint: "Mélange d'exercices que tu connais déjà et de nouveautés pertinentes.",
  },
  {
    value: "creatif",
    label: "Créatif",
    hint: "Privilégie la variété et les mouvements que tu n'as pas encore pratiqués.",
  },
] as const;
type Creativity = (typeof CREATIVITY_OPTIONS)[number]["value"];

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
  const [creativity, setCreativity] = useState<Creativity>("normal");
  const [notes, setNotes] = useState("");
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<EditableProgram | null>(null);
  // true = brouillon vierge créé à la main (sans IA).
  const [manual, setManual] = useState(false);

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

  // Création sans IA : squelette minimal ouvert directement dans l'éditeur.
  function startManual() {
    setError(null);
    setManual(true);
    setDraft({
      name: "Mon programme",
      description: null,
      blockCycles: null,
      days: [
        {
          name: "Jour 1 — Séance",
          focus: null,
          exercises: [
            {
              name: "Nouvel exercice",
              sets: 3,
              reps: "10",
              restSeconds: 90,
              weightHint: null,
              equipment: [],
              notes: null,
            },
          ],
        },
      ],
    });
  }

  async function generate() {
    setGenerating(true);
    setError(null);
    setManual(false);
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
          creativity,
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
      <div className="card p-6 text-center">
        <MapPin size={36} className="mx-auto text-muted-2" strokeWidth={1.75} />
        <h2 className="mt-3 text-lg font-extrabold italic">
          Commence par créer un contexte
        </h2>
        <p className="mt-1 text-sm text-muted-2">
          Un contexte est un endroit où tu t&apos;entraînes (Maison, Gym X…)
          avec son équipement. L&apos;IA s&apos;en sert pour bâtir ton
          programme.
        </p>
        <Link href="/equipment" className={btn("primary", "lg", "mt-4")}>
          Créer mon premier contexte
        </Link>
      </div>
    );
  }

  if (draft) {
    return (
      <div className="flex flex-col gap-4">
        <div className="flex items-start gap-2 rounded-2xl border-[1.5px] border-accent/50 bg-accent/10 p-3.5 text-sm font-semibold text-accent">
          {manual ? (
            <Pencil size={15} className="mt-0.5 shrink-0" />
          ) : (
            <Sparkles size={15} className="mt-0.5 shrink-0" />
          )}
          {manual
            ? "Programme vierge : nomme-le, ajoute tes jours et exercices, puis enregistre."
            : "Programme généré ! Modifie-le si besoin puis enregistre-le."}
        </div>
        {error && (
          <div className="rounded-2xl border border-danger/40 bg-danger/10 p-3 text-sm text-danger">
            {error}
          </div>
        )}
        <ProgramEditor
          initial={draft}
          onSave={save}
          saveLabel="Enregistrer"
          saving={saving}
        />
        <button
          onClick={() => setDraft(null)}
          className="inline-flex items-center gap-1.5 pb-2 text-sm font-semibold text-muted"
        >
          <ChevronLeft size={15} /> Revenir au formulaire et régénérer
        </button>
      </div>
    );
  }

  return (
    <div className="flex max-w-2xl flex-col gap-5">
      {!hasOpenrouterKey && (
        <div className="flex items-start gap-2 rounded-2xl border border-danger/40 bg-danger/10 p-3.5 text-sm">
          <TriangleAlert size={15} className="mt-0.5 shrink-0 text-danger" />
          <span>
          Aucune clé OpenRouter configurée.{" "}
          <Link href="/settings" className="font-semibold underline">
            Ajoute ta clé dans Réglages
          </Link>{" "}
          pour générer un programme.
          </span>
        </div>
      )}

      <section>
        <h2 className="overline-label mb-2.5">Où t&apos;entraînes-tu ?</h2>
        <div className="flex flex-wrap gap-2">
          {locations.map((l) => (
            <Chip
              key={l.id}
              active={l.id === locationId}
              activeStyle="solid"
              onClick={() => setLocationId(l.id)}
            >
              {l.icon} {l.name}
              <span className="text-xs font-bold opacity-70">
                {l.equipmentCount} équip.
              </span>
            </Chip>
          ))}
          <Link href="/equipment" className={btn("tint", "md")}>
            <Plus size={17} /> Ajouter
          </Link>
        </div>
        <p className="mt-1.5 text-xs text-muted">
          L&apos;équipement coché dans « Matériel » pour ce contexte sera
          utilisé.
        </p>
      </section>

      <section>
        <h2 className="overline-label mb-2.5">Objectifs · Jusqu&apos;à 2</h2>
        <div className="flex flex-wrap gap-2">
          {GOALS.map((g) => {
            const selected = goals.includes(g);
            const full = goals.length >= 2 && !selected;
            return (
              <Chip
                key={g}
                active={selected}
                dimmed={full}
                onClick={() => toggleGoal(g)}
              >
                {selected && goals.length > 1 && <Check size={15} />}
                {g}
              </Chip>
            );
          })}
        </div>
        <p className="mt-1.5 text-xs text-muted">
          Jusqu&apos;à 2 objectifs combinables (ex. prise de muscle + perte de
          poids).
        </p>
      </section>

      <section>
        <h2 className="overline-label mb-2.5">Niveau</h2>
        <div className="flex gap-2">
          {LEVELS.map((l) => (
            <Chip
              key={l}
              active={l === level}
              onClick={() => setLevel(l)}
              className="flex-1"
            >
              {l}
            </Chip>
          ))}
        </div>
      </section>

      <section>
        <h2 className="overline-label mb-2.5">
          Séances par semaine : {daysPerWeek}
        </h2>
        <input
          type="range"
          min={1}
          max={7}
          value={daysPerWeek}
          onChange={(e) => setDaysPerWeek(Number(e.target.value))}
          className="w-full accent-accent"
        />
        <div className="flex justify-between font-mono text-xs text-muted">
          {[1, 2, 3, 4, 5, 6, 7].map((n) => (
            <span
              key={n}
              className={n === daysPerWeek ? "font-bold text-accent" : ""}
            >
              {n}
            </span>
          ))}
        </div>
      </section>

      <section>
        <h2 className="overline-label mb-2.5">Durée de séance</h2>
        <div className="flex gap-2">
          {DURATIONS.map((d) => (
            <Chip
              key={d}
              active={d === sessionMinutes}
              onClick={() => setSessionMinutes(d)}
              className="flex-1"
            >
              {d === sessionMinutes ? `${d} min` : d}
            </Chip>
          ))}
        </div>
      </section>

      <section>
        <h2 className="overline-label mb-2.5">Sélection des exercices</h2>
        <div className="flex gap-2">
          {CREATIVITY_OPTIONS.map((o) => (
            <Chip
              key={o.value}
              active={o.value === creativity}
              onClick={() => setCreativity(o.value)}
              className="flex-1"
            >
              {o.label}
            </Chip>
          ))}
        </div>
        <p className="mt-1.5 text-xs text-muted">
          {CREATIVITY_OPTIONS.find((o) => o.value === creativity)?.hint}
        </p>
      </section>

      <section>
        <div className="mb-2.5 flex items-baseline justify-between gap-2">
          <h2 className="overline-label">Modèle d&apos;IA</h2>
          {model.trim() !== currentDefault && (
            <button
              onClick={() => setModel(currentDefault)}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-accent"
            >
              <RotateCcw size={13} /> Revenir au défaut
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
        <h2 className="overline-label mb-2.5">Précisions (optionnel)</h2>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Ex. je veux insister sur les épaules, j'ai mal au genou droit, pas de squat…"
          rows={3}
          className="w-full rounded-[18px] border-[1.5px] border-border bg-surface px-4 py-3 text-sm outline-none focus:border-accent"
        />
      </section>

      {error && (
        <div className="rounded-2xl border border-danger/40 bg-danger/10 p-3 text-sm text-danger">
          {error}
        </div>
      )}

      <Button
        onClick={generate}
        disabled={generating || !locationId}
        variant="primary"
        size="lg"
        className="text-[17px]"
      >
        {generating ? (
          <>
            <Loader2 size={17} className="animate-spin" /> Génération…
          </>
        ) : (
          <>
            <Sparkles size={17} /> Générer
          </>
        )}
      </Button>
      <p className="-mt-2 flex items-center justify-center gap-1.5 text-center text-xs text-muted">
        <Timer size={13} /> 10 à 30 secondes selon le modèle choisi
      </p>

      <button
        onClick={startManual}
        disabled={!locationId}
        className={btn("outline", "md")}
        title="Créer mon programme manuellement, sans IA"
      >
        <Pencil size={17} /> Créer manuellement
      </button>
      <p className="-mt-3 text-center text-xs text-muted">
        Sans IA : tu pars d&apos;une page blanche, dans le contexte sélectionné.
      </p>
    </div>
  );
}
