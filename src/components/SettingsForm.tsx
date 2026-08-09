"use client";

import { useEffect, useState, useTransition } from "react";
import { saveSettings } from "@/app/actions";

type ModelOption = { id: string; name: string };

export default function SettingsForm({
  initial,
}: {
  initial: {
    hasOpenrouterKey: boolean;
    hasKieKey: boolean;
    openrouterModel: string;
    voiceInput: boolean;
    voiceAnnounce: boolean;
  };
}) {
  const [openrouterKey, setOpenrouterKey] = useState("");
  const [kieKey, setKieKey] = useState("");
  const [model, setModel] = useState(initial.openrouterModel);
  const [modelSearch, setModelSearch] = useState("");
  const [models, setModels] = useState<ModelOption[]>([]);
  const [modelsError, setModelsError] = useState(false);
  const [voiceInput, setVoiceInput] = useState(initial.voiceInput);
  const [voiceAnnounce, setVoiceAnnounce] = useState(initial.voiceAnnounce);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    fetch("/api/openrouter/models")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((data: ModelOption[]) => setModels(data))
      .catch(() => setModelsError(true));
  }, []);

  const filtered = modelSearch
    ? models.filter((m) =>
        `${m.id} ${m.name}`.toLowerCase().includes(modelSearch.toLowerCase())
      )
    : models;

  function submit() {
    startTransition(async () => {
      await saveSettings({
        openrouterApiKey: openrouterKey,
        kieApiKey: kieKey,
        openrouterModel: model,
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
      <section className="rounded-2xl border border-border bg-surface p-4">
        <h2 className="font-semibold">Clé OpenRouter</h2>
        <p className="mt-1 text-xs text-muted">
          Nécessaire pour générer les programmes.{" "}
          {initial.hasOpenrouterKey ? (
            <span className="text-accent">✓ Une clé est configurée.</span>
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
          className="mt-2 w-full rounded-xl border border-border bg-surface-2 px-3 py-2.5 text-sm outline-none focus:border-accent"
        />
      </section>

      <section className="rounded-2xl border border-border bg-surface p-4">
        <h2 className="font-semibold">Modèle d&apos;IA</h2>
        <p className="mt-1 text-xs text-muted">
          Modèle OpenRouter utilisé pour générer les programmes.
        </p>
        <input
          value={modelSearch}
          onChange={(e) => setModelSearch(e.target.value)}
          placeholder="Rechercher un modèle…"
          className="mt-2 w-full rounded-xl border border-border bg-surface-2 px-3 py-2.5 text-sm outline-none focus:border-accent"
        />
        {modelsError ? (
          <input
            value={model}
            onChange={(e) => setModel(e.target.value)}
            placeholder="ex. openai/gpt-4o-mini"
            className="mt-2 w-full rounded-xl border border-border bg-surface-2 px-3 py-2.5 text-sm outline-none focus:border-accent"
          />
        ) : (
          <select
            value={model}
            onChange={(e) => setModel(e.target.value)}
            className="mt-2 w-full rounded-xl border border-border bg-surface-2 px-3 py-2.5 text-sm"
          >
            {!filtered.some((m) => m.id === model) && (
              <option value={model}>{model}</option>
            )}
            {filtered.slice(0, 200).map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        )}
      </section>

      <section className="rounded-2xl border border-border bg-surface p-4">
        <h2 className="font-semibold">Clé Kie.ai</h2>
        <p className="mt-1 text-xs text-muted">
          Nécessaire pour générer les images d&apos;exercices (GPT Image 2).{" "}
          {initial.hasKieKey ? (
            <span className="text-accent">✓ Une clé est configurée.</span>
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
          className="mt-2 w-full rounded-xl border border-border bg-surface-2 px-3 py-2.5 text-sm outline-none focus:border-accent"
        />
      </section>

      <section className="rounded-2xl border border-border bg-surface p-4">
        <h2 className="font-semibold">Voix</h2>
        <label className="mt-3 flex items-center justify-between gap-3">
          <span className="text-sm">
            Dictée vocale (poids/reps à la voix)
          </span>
          <input
            type="checkbox"
            checked={voiceInput}
            onChange={(e) => setVoiceInput(e.target.checked)}
            className="h-6 w-6 accent-[--color-accent]"
          />
        </label>
        <label className="mt-3 flex items-center justify-between gap-3">
          <span className="text-sm">
            Annonces vocales (exercices, fin de repos)
          </span>
          <input
            type="checkbox"
            checked={voiceAnnounce}
            onChange={(e) => setVoiceAnnounce(e.target.checked)}
            className="h-6 w-6 accent-[--color-accent]"
          />
        </label>
      </section>

      <button
        onClick={submit}
        disabled={pending}
        className="rounded-xl bg-accent px-4 py-3.5 font-semibold text-black disabled:opacity-50"
      >
        {pending ? "Enregistrement…" : saved ? "✓ Enregistré" : "Enregistrer"}
      </button>
    </div>
  );
}
