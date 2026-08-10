"use client";

import { useState, useTransition } from "react";
import { saveSettings } from "@/app/actions";
import ModelPicker from "@/components/ModelPicker";
import { Button } from "@/components/ui/button";
import Toggle from "@/components/ui/Toggle";

export default function SettingsForm({
  initial,
}: {
  initial: {
    hasOpenrouterKey: boolean;
    hasKieKey: boolean;
    openrouterModel: string;
    pinnedModels: string[];
    voiceInput: boolean;
    voiceAnnounce: boolean;
  };
}) {
  const [openrouterKey, setOpenrouterKey] = useState("");
  const [kieKey, setKieKey] = useState("");
  const [model, setModel] = useState(initial.openrouterModel);
  const [voiceInput, setVoiceInput] = useState(initial.voiceInput);
  const [voiceAnnounce, setVoiceAnnounce] = useState(initial.voiceAnnounce);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  function submit() {
    startTransition(async () => {
      await saveSettings({
        openrouterApiKey: openrouterKey,
        kieApiKey: kieKey,
        openrouterModel: model.trim(),
        voiceInput,
        voiceAnnounce,
      });
      setOpenrouterKey("");
      setKieKey("");
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    });
  }

  return (
    <div className="flex max-w-2xl flex-col gap-5">
      <section className="card p-4">
        <h2 className="text-[15px] font-extrabold">Clé OpenRouter</h2>
        <p className="mt-1 text-xs text-muted-2">
          Nécessaire pour générer les programmes.{" "}
          {initial.hasOpenrouterKey ? (
            <span className="font-bold text-accent">✓ Une clé est configurée.</span>
          ) : (
            <span className="text-danger">Aucune clé configurée.</span>
          )}
        </p>
        <input
          type="password"
          value={openrouterKey}
          onChange={(e) => setOpenrouterKey(e.target.value)}
          placeholder={
            initial.hasOpenrouterKey
              ? "Laisser vide pour conserver la clé actuelle"
              : "sk-or-…"
          }
          className="mt-2.5 w-full rounded-full border-[1.5px] border-border bg-surface-2 px-4 py-3 font-mono text-sm outline-none focus:border-accent"
        />
      </section>

      <section className="card p-4">
        <h2 className="text-[15px] font-extrabold">Modèle d&apos;IA par défaut</h2>
        <p className="mt-1 mb-2 text-xs text-muted-2">
          Utilisé pour les programmes, l&apos;échauffement, les substitutions
          d&apos;exercices et les adaptations. Épingle tes modèles favoris pour
          les retrouver en tête de liste ; le modèle enregistré ici est marqué
          ⭐.
        </p>
        <ModelPicker
          value={model}
          onChange={setModel}
          initialPinned={initial.pinnedModels}
          defaultModel={initial.openrouterModel}
        />
      </section>

      <section className="card p-4">
        <h2 className="text-[15px] font-extrabold">Clé Kie.ai</h2>
        <p className="mt-1 text-xs text-muted-2">
          Nécessaire pour générer les images d&apos;exercices (GPT Image 2).{" "}
          {initial.hasKieKey ? (
            <span className="font-bold text-accent">✓ Une clé est configurée.</span>
          ) : (
            <span className="text-danger">Aucune clé configurée.</span>
          )}
        </p>
        <input
          type="password"
          value={kieKey}
          onChange={(e) => setKieKey(e.target.value)}
          placeholder={
            initial.hasKieKey
              ? "Laisser vide pour conserver la clé actuelle"
              : "Clé API kie.ai"
          }
          className="mt-2.5 w-full rounded-full border-[1.5px] border-border bg-surface-2 px-4 py-3 font-mono text-sm outline-none focus:border-accent"
        />
      </section>

      <section className="card p-4">
        <h2 className="text-[15px] font-extrabold">Voix</h2>
        <div className="mt-3 flex items-center justify-between gap-3 py-1.5">
          <span className="text-sm">
            🎤 Dictée vocale (poids/reps à la voix)
          </span>
          <Toggle
            checked={voiceInput}
            onChange={setVoiceInput}
            aria-label="Dictée vocale"
          />
        </div>
        <div className="mt-1 flex items-center justify-between gap-3 py-1.5">
          <span className="text-sm">
            🔊 Annonces vocales (exercices, fin de repos)
          </span>
          <Toggle
            checked={voiceAnnounce}
            onChange={setVoiceAnnounce}
            aria-label="Annonces vocales"
          />
        </div>
      </section>

      <Button onClick={submit} disabled={pending} variant="primary" size="lg">
        {pending ? "Enregistrement…" : saved ? "✓ Enregistré" : "Enregistrer"}
      </Button>
    </div>
  );
}
