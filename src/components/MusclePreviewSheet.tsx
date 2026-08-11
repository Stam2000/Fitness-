"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import BottomSheet from "@/components/ui/BottomSheet";
import MediaThumb from "@/components/ui/MediaThumb";

export type MuscleChipInfo = {
  /** Nom tel qu'affiché sur l'exercice. */
  name: string;
  /** Ligne du catalogue Muscle ; null = nom hors base (ancien programme). */
  id: string | null;
  imageUrl: string | null;
  imageTaskId: string | null;
};

export type MuscleComboInfo = {
  /** Ligne MuscleCombo ; null = combinaison pas encore en base. */
  id: string | null;
  muscles: string[];
  imageUrl: string | null;
  imageTaskId: string | null;
};

type ItemState = {
  imageUrl: string | null;
  busy: boolean;
  error: string | null;
};

// Les états et pollers sont partagés entre muscles ("m:id") et combinaison
// ("c:id") ; seul l'endpoint d'API diffère.
function endpointFor(key: string): string {
  const [kind, id] = [key.slice(0, 1), key.slice(2)];
  return kind === "c"
    ? `/api/muscle-combos/${id}/image`
    : `/api/muscles/${id}/image`;
}

/**
 * Popup de prévisualisation des groupes musculaires travaillés par un
 * exercice : illustration combinée (≥ 2 muscles) puis image de chaque
 * muscle, avec génération à la demande et polling pendant la génération.
 */
export default function MusclePreviewSheet({
  open,
  onClose,
  muscles,
  combo = null,
}: {
  open: boolean;
  onClose: () => void;
  muscles: MuscleChipInfo[];
  combo?: MuscleComboInfo | null;
}) {
  // État vivant par clé (l'état serveur des props peut devenir obsolète
  // pendant une génération).
  const [items, setItems] = useState<Record<string, ItemState>>({});
  // Id de la combinaison créée à la demande (combo.id des props sinon).
  const [createdComboId, setCreatedComboId] = useState<string | null>(null);
  const pollers = useRef<Record<string, ReturnType<typeof setInterval>>>({});
  const initializedRef = useRef(false);

  const stopPolling = useCallback((key: string) => {
    const timer = pollers.current[key];
    if (timer) {
      clearInterval(timer);
      delete pollers.current[key];
    }
  }, []);

  const stopAll = useCallback(() => {
    for (const key of Object.keys(pollers.current)) stopPolling(key);
  }, [stopPolling]);

  const pollImage = useCallback(
    (key: string) => {
      if (pollers.current[key]) return;
      pollers.current[key] = setInterval(async () => {
        try {
          const res = await fetch(endpointFor(key));
          const json = await res.json();
          if (json.state === "success" && json.imageUrl) {
            stopPolling(key);
            setItems((prev) => ({
              ...prev,
              [key]: { imageUrl: json.imageUrl, busy: false, error: null },
            }));
          } else if (json.state === "fail" || json.state === "none") {
            stopPolling(key);
            setItems((prev) => ({
              ...prev,
              [key]: {
                imageUrl: json.imageUrl ?? prev[key]?.imageUrl ?? null,
                busy: false,
                error:
                  json.state === "fail"
                    ? (json.error ?? "Échec de génération")
                    : null,
              },
            }));
          }
        } catch {
          // hors-ligne : nouvel essai au prochain tick
        }
      }, 4000);
    },
    [stopPolling]
  );

  // Arrêt de tous les pollers au démontage.
  useEffect(() => stopAll, [stopAll]);

  // À l'ouverture : état initial depuis les props + reprise du polling des
  // tâches déjà en cours (ex. image lancée automatiquement à la création par
  // l'IA). À la fermeture : arrêt des pollers.
  useEffect(() => {
    if (!open) {
      initializedRef.current = false;
      stopAll();
      return;
    }
    if (initializedRef.current) return;
    initializedRef.current = true;
    const init = setTimeout(() => {
      const initial: Record<string, ItemState> = {};
      const seed = (key: string, imageUrl: string | null, taskId: string | null) => {
        const busy = !imageUrl && taskId != null;
        initial[key] = { imageUrl, busy, error: null };
        if (busy) pollImage(key);
      };
      for (const m of muscles) {
        if (m.id) seed(`m:${m.id}`, m.imageUrl, m.imageTaskId);
      }
      if (combo?.id) seed(`c:${combo.id}`, combo.imageUrl, combo.imageTaskId);
      setCreatedComboId(null);
      setItems(initial);
    }, 0);
    return () => clearTimeout(init);
  }, [open, muscles, combo, pollImage, stopAll]);

  const setItem = (key: string, state: ItemState) =>
    setItems((prev) => ({ ...prev, [key]: state }));

  async function generate(key: string) {
    setItem(key, {
      imageUrl: items[key]?.imageUrl ?? null,
      busy: true,
      error: null,
    });
    try {
      const res = await fetch(endpointFor(key), { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Erreur de génération");
      pollImage(key);
    } catch (e) {
      setItem(key, {
        imageUrl: items[key]?.imageUrl ?? null,
        busy: false,
        error: e instanceof Error ? e.message : "Erreur de génération",
      });
    }
  }

  // Génération de l'illustration combinée : crée la combinaison en base au
  // passage si elle n'y est pas encore (anciens programmes).
  async function generateCombo() {
    const comboId = createdComboId ?? combo?.id ?? null;
    if (comboId) {
      await generate(`c:${comboId}`);
      return;
    }
    const pendingKey = "c:pending";
    setItem(pendingKey, { imageUrl: null, busy: true, error: null });
    try {
      const res = await fetch("/api/muscle-combos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ muscles: muscles.map((m) => m.name) }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Erreur de génération");
      setCreatedComboId(json.id);
      const key = `c:${json.id}`;
      if (json.state === "success" && json.imageUrl) {
        setItem(key, { imageUrl: json.imageUrl, busy: false, error: null });
      } else {
        setItem(key, { imageUrl: null, busy: true, error: null });
        pollImage(key);
      }
      setItems((prev) => {
        const next = { ...prev };
        delete next[pendingKey];
        return next;
      });
    } catch (e) {
      setItem(pendingKey, {
        imageUrl: null,
        busy: false,
        error: e instanceof Error ? e.message : "Erreur de génération",
      });
    }
  }

  const comboId = createdComboId ?? combo?.id ?? null;
  const comboKey = comboId ? `c:${comboId}` : "c:pending";
  const comboState = items[comboKey];
  const comboImageUrl = comboState?.imageUrl ?? combo?.imageUrl ?? null;
  const comboBusy = comboState?.busy ?? false;

  return (
    <BottomSheet open={open} onClose={onClose}>
      <h2 className="text-lg font-extrabold italic">💪 Muscles travaillés</h2>

      <div className="max-h-[70vh] overflow-y-auto">
      {muscles.length >= 2 && (
        <div className="mt-4 flex flex-col gap-1.5">
          <MediaThumb
            url={comboImageUrl}
            alt={`Combinaison ${muscles.map((m) => m.name).join(" + ")}`}
            emoji="🫀"
            className="aspect-square max-h-56 w-full rounded-2xl border border-card-border"
            emojiClassName="text-5xl"
          />
          <p className="text-sm font-bold">
            Vue combinée · {muscles.map((m) => m.name).join(" + ")}
          </p>
          {comboBusy && (
            <p className="text-xs text-muted">⏳ Génération en cours…</p>
          )}
          {comboState?.error && (
            <p className="text-xs text-danger">{comboState.error}</p>
          )}
          {!comboImageUrl && !comboBusy && (
            <button
              type="button"
              onClick={generateCombo}
              className="text-left text-xs font-semibold text-accent"
            >
              ✨ Générer l&apos;illustration combinée
            </button>
          )}
        </div>
      )}

      <div className="mt-4 grid grid-cols-2 gap-3">
        {muscles.map((m) => {
          const muscleId = m.id;
          const key = muscleId ? `m:${muscleId}` : null;
          const state = key ? items[key] : undefined;
          const imageUrl = state?.imageUrl ?? m.imageUrl;
          const busy = state?.busy ?? false;
          return (
            <div key={m.name} className="flex flex-col gap-1.5">
              <MediaThumb
                url={imageUrl}
                alt={`Groupe musculaire ${m.name}`}
                emoji="💪"
                className="aspect-square w-full rounded-2xl border border-card-border"
                emojiClassName="text-4xl"
              />
              <p className="text-sm font-bold">{m.name}</p>
              {busy && (
                <p className="text-xs text-muted">⏳ Génération en cours…</p>
              )}
              {state?.error && (
                <p className="text-xs text-danger">{state.error}</p>
              )}
              {key && !imageUrl && !busy && (
                <button
                  type="button"
                  onClick={() => generate(key)}
                  className="text-left text-xs font-semibold text-accent"
                >
                  ✨ Générer l&apos;image
                </button>
              )}
              {!muscleId && (
                <p className="text-xs text-muted">Non répertorié</p>
              )}
            </div>
          );
        })}
      </div>
      </div>
    </BottomSheet>
  );
}
