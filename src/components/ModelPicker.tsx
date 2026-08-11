"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { Pencil, Pin, PinOff, Plus, Star, Undo2 } from "lucide-react";
import { togglePinnedModel } from "@/app/actions";

type ModelOption = { id: string; name: string };

// Fournisseurs mis en avant, dans cet ordre. Le reste du catalogue OpenRouter
// est accessible via « Afficher tous les fournisseurs ».
const FEATURED = [
  { prefix: "anthropic", label: "Anthropic — Claude" },
  { prefix: "openai", label: "OpenAI — GPT" },
  { prefix: "google", label: "Google — Gemini" },
];

// OpenRouter préfixe ses noms par le fournisseur (« Anthropic: Claude … ») :
// redondant une fois l'option rangée dans son groupe.
function shortName(name: string) {
  const i = name.indexOf(": ");
  return i === -1 ? name : name.slice(i + 2);
}

export default function ModelPicker({
  value,
  onChange,
  initialPinned,
  defaultModel,
  onSetDefault,
  inputClassName = "bg-surface-2",
}: {
  value: string;
  onChange: (model: string) => void;
  initialPinned: string[];
  /** Modèle par défaut actuel ; marqué d'une étoile dans les épinglés. */
  defaultModel?: string;
  /** Fourni uniquement là où promouvoir un modèle par défaut a du sens. */
  onSetDefault?: (model: string) => void;
  inputClassName?: string;
}) {
  const [models, setModels] = useState<ModelOption[]>([]);
  const [pinned, setPinned] = useState(initialPinned);
  const [failed, setFailed] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [manual, setManual] = useState(false);
  const [pinPending, startPin] = useTransition();

  useEffect(() => {
    fetch("/api/openrouter/models")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((data: ModelOption[]) => setModels(data))
      .catch(() => {
        setFailed(true);
        setManual(true);
      });
  }, []);

  // Un modèle épinglé absent du catalogue (identifiant saisi à la main) reste
  // affiché sous son identifiant brut plutôt que de disparaître.
  const labelOf = useMemo(() => {
    const byId = new Map(models.map((m) => [m.id, shortName(m.name)]));
    return (id: string) => byId.get(id) ?? id;
  }, [models]);

  const groups = useMemo(() => {
    const result: { label: string; models: ModelOption[] }[] = [];
    if (pinned.length > 0) {
      result.push({
        label: "Épinglés",
        models: pinned.map((id) => ({ id, name: labelOf(id) })),
      });
    }
    for (const f of FEATURED) {
      const list = models.filter((m) => m.id.startsWith(`${f.prefix}/`));
      if (list.length > 0) {
        result.push({
          label: f.label,
          models: list.map((m) => ({ id: m.id, name: shortName(m.name) })),
        });
      }
    }
    if (showAll) {
      const rest = models.filter(
        (m) => !FEATURED.some((f) => m.id.startsWith(`${f.prefix}/`))
      );
      if (rest.length > 0) {
        result.push({ label: "Autres fournisseurs", models: rest });
      }
    }
    return result;
  }, [models, pinned, showAll, labelOf]);

  const featuredCount = FEATURED.reduce(
    (n, f) => n + models.filter((m) => m.id.startsWith(`${f.prefix}/`)).length,
    0
  );
  const otherCount = models.length - featuredCount;
  const current = value.trim();
  const isPinned = pinned.includes(current);
  const listed = groups.some((g) => g.models.some((m) => m.id === current));

  function togglePin() {
    if (!current) return;
    // Optimiste : la liste bascule tout de suite, l'action confirme ensuite.
    setPinned((p) =>
      p.includes(current) ? p.filter((m) => m !== current) : [...p, current]
    );
    startPin(async () => setPinned(await togglePinnedModel(current)));
  }

  const actions = (
    <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
      <button
        onClick={togglePin}
        disabled={!current || pinPending}
        className={`flex items-center gap-1 ${isPinned ? "text-accent" : "text-muted"}`}
      >
        {isPinned ? (
          <>
            <PinOff size={13} /> Retirer des épinglés
          </>
        ) : (
          <>
            <Pin size={13} /> Épingler ce modèle
          </>
        )}
      </button>
      {onSetDefault && current !== defaultModel && (
        <button
          onClick={() => onSetDefault(current)}
          disabled={!current}
          className="flex items-center gap-1 text-muted"
        >
          <Star size={13} /> Définir par défaut
        </button>
      )}
      <button
        onClick={() => setManual(!manual)}
        className="flex items-center gap-1 text-muted"
        hidden={failed}
      >
        {manual ? (
          <>
            <Undo2 size={13} /> Revenir à la liste
          </>
        ) : (
          <>
            <Pencil size={13} /> Saisir un identifiant
          </>
        )}
      </button>
      {!manual && !showAll && otherCount > 0 && (
        <button
          onClick={() => setShowAll(true)}
          className="flex items-center gap-1 text-muted"
        >
          <Plus size={13} /> {otherCount} autres fournisseurs
        </button>
      )}
    </div>
  );

  return (
    <>
      {pinned.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {pinned.map((id) => (
            <button
              key={id}
              onClick={() => onChange(id)}
              className={`inline-flex items-center gap-1 rounded-full px-3.5 py-2 text-xs font-semibold ${
                id === current
                  ? "border-[1.5px] border-accent bg-accent/15 text-accent"
                  : "border-[1.5px] border-border bg-surface text-muted-2"
              }`}
            >
              {labelOf(id)}
              {id === defaultModel && (
                <Star
                  size={12}
                  fill="currentColor"
                  aria-label="Modèle par défaut"
                />
              )}
            </button>
          ))}
        </div>
      )}

      {manual ? (
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="ex. anthropic/claude-sonnet-4.5"
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          className={`w-full rounded-full border-[1.5px] border-border px-4 py-3 font-mono text-sm outline-none focus:border-accent ${inputClassName}`}
        />
      ) : (
        <select
          value={current}
          onChange={(e) => onChange(e.target.value)}
          className={`w-full rounded-full border-[1.5px] border-border px-4 py-3 text-sm font-semibold outline-none focus:border-accent ${inputClassName}`}
        >
          {!listed && <option value={current}>{labelOf(current)}</option>}
          {groups.map((g) => (
            <optgroup key={g.label} label={g.label}>
              {g.models.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      )}

      {actions}

      {failed && (
        <p className="mt-1.5 text-xs text-muted">
          Liste OpenRouter injoignable — saisis l&apos;identifiant du modèle à la
          main.
        </p>
      )}
    </>
  );
}
