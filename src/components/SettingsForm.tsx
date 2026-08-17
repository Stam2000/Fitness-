"use client";

import { useState, useTransition } from "react";
import {
  Bot,
  Check,
  CircleCheck,
  Key,
  Loader2,
  Mic,
  Star,
  Volume2,
} from "lucide-react";
import { saveSettings } from "@/app/actions";
import ModelPicker from "@/components/ModelPicker";
import { Button } from "@/components/ui/button";
import Toggle from "@/components/ui/Toggle";

export default function SettingsForm({
  initial,
  isAdmin,
}: {
  /** Clés API et modèles : sections masquées hors administration. */
  isAdmin: boolean;
  initial: {
    hasOpenrouterKey: boolean;
    hasKieKey: boolean;
    openrouterModel: string;
    pinnedModels: string[];
    voiceInput: boolean;
    voiceAnnounce: boolean;
    voiceModel: string;
    visionModel: string;
  };
}) {
  const [openrouterKey, setOpenrouterKey] = useState("");
  const [kieKey, setKieKey] = useState("");
  const [model, setModel] = useState(initial.openrouterModel);
  const [voiceInput, setVoiceInput] = useState(initial.voiceInput);
  const [voiceAnnounce, setVoiceAnnounce] = useState(initial.voiceAnnounce);
  const [voiceModel, setVoiceModel] = useState(initial.voiceModel);
  const [visionModel, setVisionModel] = useState(initial.visionModel);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  function submit() {
    startTransition(async () => {
      await saveSettings({
        voiceInput,
        voiceAnnounce,
        // Champs globaux : n'envoyer que depuis un compte admin — l'action
        // les refuse de toute façon, mais l'envoi ferait échouer la sauvegarde
        // des préférences personnelles au passage.
        ...(isAdmin
          ? {
              openrouterApiKey: openrouterKey,
              kieApiKey: kieKey,
              openrouterModel: model.trim(),
              voiceModel: voiceModel.trim(),
              visionModel: visionModel.trim(),
            }
          : {}),
      });
      setOpenrouterKey("");
      setKieKey("");
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    });
  }

  return (
    <div className="flex max-w-2xl flex-col gap-5">
      {isAdmin ? (
        <>
      <section className="card p-4">
        <h2 className="flex items-center gap-1.5 text-[15px] font-extrabold">
          <Key size={15} className="text-muted-2" /> Clé OpenRouter
        </h2>
        <p className="mt-1 text-xs text-muted-2">
          Nécessaire pour générer les programmes.{" "}
          {initial.hasOpenrouterKey ? (
            <span className="inline-flex items-center gap-1 font-bold text-accent">
              <CircleCheck size={13} /> Une clé est configurée.
            </span>
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
        <h2 className="flex items-center gap-1.5 text-[15px] font-extrabold">
          <Bot size={15} className="text-muted-2" /> Modèle d&apos;IA par défaut
        </h2>
        <p className="mt-1 mb-2 text-xs text-muted-2">
          Utilisé pour les programmes, l&apos;échauffement, les substitutions
          d&apos;exercices et les adaptations. Épingle tes modèles favoris pour
          les retrouver en tête de liste ; le modèle enregistré ici est marqué
          d&apos;une étoile{" "}
          <Star size={12} className="inline align-[-1.5px]" aria-hidden />.
        </p>
        <ModelPicker
          value={model}
          onChange={setModel}
          initialPinned={initial.pinnedModels}
          defaultModel={initial.openrouterModel}
        />
      </section>

      <section className="card p-4">
        <h2 className="flex items-center gap-1.5 text-[15px] font-extrabold">
          <Key size={15} className="text-muted-2" /> Clé Kie.ai
        </h2>
        <p className="mt-1 text-xs text-muted-2">
          Nécessaire pour générer les images d&apos;exercices (GPT Image 2).{" "}
          {initial.hasKieKey ? (
            <span className="inline-flex items-center gap-1 font-bold text-accent">
              <CircleCheck size={13} /> Une clé est configurée.
            </span>
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
        </>
      ) : null}

      <section className="card p-4">
        <h2 className="text-[15px] font-extrabold">Voix</h2>
        <div className="mt-3 flex items-center justify-between gap-3 py-1.5">
          <span className="flex items-center gap-2 text-sm">
            <Mic size={15} className="shrink-0 text-muted-2" /> Dictée vocale
            (poids/reps à la voix)
          </span>
          <Toggle
            checked={voiceInput}
            onChange={setVoiceInput}
            aria-label="Dictée vocale"
          />
        </div>
        <div className="mt-1 flex items-center justify-between gap-3 py-1.5">
          <span className="flex items-center gap-2 text-sm">
            <Volume2 size={15} className="shrink-0 text-muted-2" /> Annonces
            vocales (exercices, fin de repos)
          </span>
          <Toggle
            checked={voiceAnnounce}
            onChange={setVoiceAnnounce}
            aria-label="Annonces vocales"
          />
        </div>
        {isAdmin ? (
        <div className="mt-3 border-t border-card-border pt-3">
          <p className="text-sm font-bold">Modèle vocal (dictée au micro)</p>
          <p className="mb-2 mt-1 text-xs text-muted-2">
            Écoute et interprète directement ta voix : choisis un modèle qui
            accepte l&apos;audio (ex. Gemini Flash, GPT-4o audio).
          </p>
          <ModelPicker
            value={voiceModel}
            onChange={setVoiceModel}
            initialPinned={initial.pinnedModels}
          />
        </div>
        ) : null}
        {isAdmin ? (
        <div className="mt-3 border-t border-card-border pt-3">
          <p className="text-sm font-bold">Modèle photo (analyse des repas)</p>
          <p className="mb-2 mt-1 text-xs text-muted-2">
            Lit les photos de repas et estime les calories : choisis un modèle
            qui accepte les images (ex. Gemini Flash, GPT-4o).
          </p>
          <ModelPicker
            value={visionModel}
            onChange={setVisionModel}
            initialPinned={initial.pinnedModels}
          />
        </div>
        ) : null}
      </section>

      <Button onClick={submit} disabled={pending} variant="primary" size="lg">
        {pending ? (
          <>
            <Loader2 size={19} className="animate-spin" /> Enregistrement…
          </>
        ) : saved ? (
          <>
            <Check size={19} /> Enregistré
          </>
        ) : (
          "Enregistrer"
        )}
      </Button>
    </div>
  );
}
