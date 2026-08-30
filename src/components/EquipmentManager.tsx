"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import {
  Check,
  CircleCheck,
  Dumbbell,
  ImagePlus,
  Loader2,
  MapPin,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import {
  createEquipment,
  createLocation,
  deleteLocation,
  toggleLocationEquipment,
  updateLocation,
} from "@/app/actions";
import { btn, Button } from "@/components/ui/button";
import Chip from "@/components/ui/Chip";
import MediaThumb from "@/components/ui/MediaThumb";
import IconButton from "@/components/ui/IconButton";

type LocationView = {
  id: string;
  name: string;
  icon: string | null;
  equipmentIds: string[];
};

type EquipmentView = {
  id: string;
  name: string;
  category: string;
  imageUrl: string | null;
  imageTaskId: string | null;
};

type ImageState = {
  status: "idle" | "generating" | "done" | "error";
  url?: string;
  error?: string;
};

const CATEGORIES = [
  "Poids du corps",
  "Haltères & poids libres",
  "Machines",
  "Cardio",
  "Accessoires",
];

const ICONS = [
  "🏠", "🏡", "🏢", "🏬", "🏨", "🏫", "🏟️", "🏋️",
  "💪", "🤸", "🧘", "🥊", "🏊", "🚴", "⚽", "🎾",
  "🌳", "🏞️", "🏖️", "⛰️", "🏕️", "🌆", "🌃", "📍",
];

function LocationForm({
  initialName = "",
  initialIcon = "🏠",
  submitLabel,
  onSubmit,
  onCancel,
}: {
  initialName?: string;
  initialIcon?: string;
  submitLabel: string;
  onSubmit: (name: string, icon: string) => void;
  onCancel?: () => void;
}) {
  const [name, setName] = useState(initialName);
  const [icon, setIcon] = useState(initialIcon);
  return (
    <form
      className="card flex flex-col gap-2.5 p-3.5"
      onSubmit={(e) => {
        e.preventDefault();
        if (!name.trim()) return;
        onSubmit(name.trim(), icon);
      }}
    >
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Nom du contexte (ex. Gym Basic-Fit, Maison…)"
        autoFocus
        className="rounded-full border-[1.5px] border-border bg-surface-2 px-4 py-2.5 text-sm outline-none focus:border-accent"
      />
      <div className="flex flex-wrap gap-1.5">
        {ICONS.map((i) => (
          <button
            key={i}
            type="button"
            onClick={() => setIcon(i)}
            className={`flex h-10 w-10 items-center justify-center rounded-xl border text-lg ${
              i === icon ? "border-accent bg-accent/15" : "border-border"
            }`}
          >
            {i}
          </button>
        ))}
      </div>
      <div className="flex gap-2">
        <button type="submit" className={btn("primary", "md", "flex-1")}>
          {submitLabel}
        </button>
        {onCancel && (
          <Button variant="outline" size="md" onClick={onCancel}>
            Annuler
          </Button>
        )}
      </div>
    </form>
  );
}

export default function EquipmentManager({
  locations,
  equipment,
  hasKieKey,
}: {
  locations: LocationView[];
  equipment: EquipmentView[];
  hasKieKey: boolean;
}) {
  const [activeId, setActiveId] = useState<string | null>(
    locations[0]?.id ?? null
  );
  const [checked, setChecked] = useState<Record<string, Set<string>>>(() =>
    Object.fromEntries(locations.map((l) => [l.id, new Set(l.equipmentIds)]))
  );
  const [images, setImages] = useState<Record<string, ImageState>>(() =>
    Object.fromEntries(
      equipment.map((e) => [
        e.id,
        e.imageUrl
          ? ({ status: "done", url: e.imageUrl } as ImageState)
          : e.imageTaskId
            ? ({ status: "generating" } as ImageState)
            : ({ status: "idle" } as ImageState),
      ])
    )
  );
  const [generatingAll, setGeneratingAll] = useState(false);
  const [imageError, setImageError] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const [showNewLocation, setShowNewLocation] = useState(false);
  const [editingLocation, setEditingLocation] = useState(false);
  const [createdNotice, setCreatedNotice] = useState<string | null>(null);
  const [newEquipmentName, setNewEquipmentName] = useState("");
  const [newEquipmentCategory, setNewEquipmentCategory] = useState(
    "Accessoires"
  );
  const pollers = useRef<Record<string, ReturnType<typeof setInterval>>>({});

  // Un contexte vient d'être créé ou supprimé côté serveur : garder une
  // sélection valide (ajustement d'état pendant le rendu, cf. docs React).
  const [prevLocations, setPrevLocations] = useState(locations);
  if (prevLocations !== locations) {
    setPrevLocations(locations);
    // Le contexte fraîchement créé est déjà sélectionné par createNewLocation :
    // on ne réinitialise que si la sélection n'existe plus.
    if (!activeId || !locations.some((l) => l.id === activeId)) {
      setActiveId(locations[0]?.id ?? null);
    }
    setChecked((prev) => {
      const next = { ...prev };
      for (const l of locations) {
        if (!next[l.id]) next[l.id] = new Set(l.equipmentIds);
      }
      return next;
    });
  }

  const byCategory = useMemo(() => {
    const map = new Map<string, EquipmentView[]>();
    for (const cat of CATEGORIES) map.set(cat, []);
    for (const eq of equipment) {
      if (!map.has(eq.category)) map.set(eq.category, []);
      map.get(eq.category)!.push(eq);
    }
    return [...map.entries()].filter(([, items]) => items.length > 0);
  }, [equipment]);

  const pollImage = useCallback((equipmentId: string) => {
    if (pollers.current[equipmentId]) return;
    pollers.current[equipmentId] = setInterval(async () => {
      try {
        const res = await fetch(`/api/equipment/${equipmentId}/image`);
        const json = await res.json();
        if (json.state === "success") {
          clearInterval(pollers.current[equipmentId]);
          delete pollers.current[equipmentId];
          setImages((m) => ({
            ...m,
            [equipmentId]: { status: "done", url: json.imageUrl },
          }));
        } else if (json.state === "fail" || json.error) {
          clearInterval(pollers.current[equipmentId]);
          delete pollers.current[equipmentId];
          setImages((m) => ({
            ...m,
            [equipmentId]: { status: "error", error: json.error ?? "échec" },
          }));
        }
      } catch {
        // erreur réseau passagère : on continue à interroger
      }
    }, 4000);
  }, []);

  useEffect(() => {
    for (const eq of equipment) {
      if (eq.imageTaskId && !eq.imageUrl) pollImage(eq.id);
    }
    const current = pollers.current;
    return () => {
      Object.values(current).forEach(clearInterval);
    };
  }, [equipment, pollImage]);

  const generateImage = useCallback(
    async (equipmentId: string): Promise<boolean> => {
      setImages((m) => ({ ...m, [equipmentId]: { status: "generating" } }));
      try {
        const res = await fetch(`/api/equipment/${equipmentId}/image`, {
          method: "POST",
        });
        const json = await res.json();
        if (!res.ok) {
          setImages((m) => ({
            ...m,
            [equipmentId]: { status: "error", error: json.error },
          }));
          setImageError(json.error ?? "Erreur de génération");
          return false;
        }
        pollImage(equipmentId);
        return true;
      } catch {
        setImages((m) => ({
          ...m,
          [equipmentId]: { status: "error", error: "erreur réseau" },
        }));
        setImageError("Erreur réseau pendant la génération.");
        return false;
      }
    },
    [pollImage]
  );

  // URL en base mais plus accessible (lien Kie.ai expiré, fichier perdu) :
  // l'échec de chargement repasse l'image en « erreur » — sans ça, elle reste
  // comptée « done » et le bouton « générer tout » reste caché.
  function markImageFailed(equipmentId: string) {
    setImages((m) =>
      m[equipmentId]?.status === "done"
        ? { ...m, [equipmentId]: { status: "error", error: "image indisponible" } }
        : m
    );
  }

  async function generateAll() {
    setGeneratingAll(true);
    setImageError(null);
    for (const eq of equipment) {
      const state = images[eq.id];
      if (state?.status === "idle" || state?.status === "error") {
        const ok = await generateImage(eq.id);
        // Clé manquante ou erreur systémique : inutile d'insister.
        if (!ok) break;
        await new Promise((r) => setTimeout(r, 500));
      }
    }
    setGeneratingAll(false);
  }

  // Crée un contexte puis le sélectionne : sans cela l'écran reste sur
  // l'ancien contexte et la création semble sans effet.
  function createNewLocation(name: string, icon: string) {
    startTransition(async () => {
      const id = await createLocation(name, icon);
      if (id) {
        setActiveId(id);
        setChecked((prev) => ({ ...prev, [id]: new Set<string>() }));
        setCreatedNotice(name);
        setTimeout(() => setCreatedNotice(null), 6000);
      }
      setShowNewLocation(false);
    });
  }

  const active = locations.find((l) => l.id === activeId);
  const activeChecked = activeId ? checked[activeId] ?? new Set() : new Set();
  const missingImages = equipment.filter(
    (e) =>
      images[e.id]?.status !== "done" && images[e.id]?.status !== "generating"
  ).length;
  const generatingCount = Object.values(images).filter(
    (s) => s.status === "generating"
  ).length;

  function toggle(equipmentId: string) {
    if (!activeId) return;
    const on = !activeChecked.has(equipmentId);
    setChecked((prev) => {
      const next = { ...prev };
      const set = new Set(next[activeId]);
      if (on) set.add(equipmentId);
      else set.delete(equipmentId);
      next[activeId] = set;
      return next;
    });
    startTransition(() => toggleLocationEquipment(activeId, equipmentId, on));
  }

  // ---------- Aucun contexte : invite à créer le premier ----------
  if (locations.length === 0) {
    return (
      <div className="flex flex-col gap-4">
        <div className="card p-6 text-center">
          <MapPin size={36} className="mx-auto text-accent" />
          <h2 className="mt-3 text-lg font-extrabold italic">
            Crée ton premier contexte
          </h2>
          <p className="mt-1 text-sm text-muted-2">
            Un contexte est un endroit où tu t&apos;entraînes : chez toi, ta
            salle de sport, un parc… Tu cocheras ensuite l&apos;équipement
            disponible dans chacun.
          </p>
        </div>
        <LocationForm submitLabel="Créer le contexte" onSubmit={createNewLocation} />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-2">
        {locations.map((l) => (
          <Chip
            key={l.id}
            active={l.id === activeId}
            activeStyle="solid"
            onClick={() => {
              setActiveId(l.id);
              setEditingLocation(false);
            }}
          >
            {l.icon} {l.name}
            <span className="text-xs font-bold opacity-70">
              {checked[l.id]?.size ?? 0}
            </span>
          </Chip>
        ))}
        <button
          onClick={() => setShowNewLocation((v) => !v)}
          className={btn("tint", "md")}
        >
          <Plus size={17} /> Nouveau
        </button>
      </div>

      {showNewLocation && (
        <LocationForm
          submitLabel="Créer le contexte"
          onSubmit={createNewLocation}
          onCancel={() => setShowNewLocation(false)}
        />
      )}

      {createdNotice && (
        <p className="flex items-start gap-2 rounded-2xl border border-accent/40 bg-accent/10 p-3 text-sm text-accent">
          <CircleCheck size={15} className="mt-0.5 shrink-0" />
          <span>
            Contexte « {createdNotice} » créé — coche ci-dessous
            l&apos;équipement qui s&apos;y trouve.
          </span>
        </p>
      )}

      {active && !editingLocation && (
        <div className="flex items-center justify-between gap-2 rounded-[14px] bg-surface px-3.5 py-2.5">
          <p className="text-sm text-muted-2">
            Équipement disponible à{" "}
            <span className="font-bold text-ink">
              {active.icon} {active.name}
            </span>
          </p>
          <IconButton
            onClick={() => setEditingLocation(true)}
            aria-label="Renommer le contexte"
            variant="outline"
            size="sm"
          >
            <Pencil size={15} />
          </IconButton>
        </div>
      )}

      {active && editingLocation && (
        <LocationForm
          initialName={active.name}
          initialIcon={active.icon ?? "📍"}
          submitLabel="Enregistrer"
          onSubmit={(name, icon) =>
            startTransition(async () => {
              await updateLocation(active.id, name, icon);
              setEditingLocation(false);
            })
          }
          onCancel={() => setEditingLocation(false)}
        />
      )}

      {hasKieKey && missingImages > 0 && (
        <button
          onClick={generateAll}
          disabled={generatingAll}
          aria-label={
            generatingAll
              ? `Génération en cours (${generatingCount} restantes)`
              : `Générer les ${missingImages} images manquantes`
          }
          title={
            generatingAll
              ? `Génération en cours (${generatingCount} restantes)`
              : `Générer les ${missingImages} images manquantes`
          }
          className={btn("tint", "md", "w-full")}
        >
          {generatingAll ? (
            <>
              <Loader2 size={17} className="animate-spin" /> Génération… (
              {generatingCount})
            </>
          ) : (
            <>
              <ImagePlus size={17} /> {missingImages}
            </>
          )}
        </button>
      )}

      {/* Sans clé, la génération était masquée sans explication. */}
      {!hasKieKey && missingImages > 0 && (
        <p className="card flex items-start gap-2 p-3.5 text-sm text-muted-2">
          <ImagePlus size={15} className="mt-0.5 shrink-0" />
          <span>
            Les images des équipements ne sont pas encore générées.{" "}
            <Link href="/settings" className="font-semibold text-accent underline">
              Ajoute ta clé Kie.ai dans Réglages
            </Link>{" "}
            pour faire apparaître le bouton de génération.
          </span>
        </p>
      )}
      {generatingCount > 0 && !generatingAll && (
        <p className="flex items-center justify-center gap-1.5 text-xs text-muted">
          <Loader2 size={13} className="animate-spin" /> {generatingCount} image
          {generatingCount > 1 ? "s" : ""} en cours de génération…
        </p>
      )}
      {imageError && (
        <p className="rounded-xl border border-danger/40 bg-danger/10 p-3 text-sm text-danger">
          {imageError}
        </p>
      )}

      {active && (
        <>
          {byCategory.map(([category, items]) => (
            <section key={category}>
              <h2 className="overline-label mb-2">{category}</h2>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5">
                {items.map((eq) => {
                  const on = activeChecked.has(eq.id);
                  const img = images[eq.id];
                  return (
                    <div
                      key={eq.id}
                      role="checkbox"
                      aria-checked={on}
                      tabIndex={0}
                      onClick={() => toggle(eq.id)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          toggle(eq.id);
                        }
                      }}
                      className={`relative cursor-pointer overflow-hidden rounded-2xl text-left ${
                        on
                          ? "border-[1.5px] border-accent/55 bg-accent/10"
                          : "border border-card-border bg-surface"
                      }`}
                    >
                      <div className="relative aspect-[1.35] w-full bg-surface-2">
                        {img?.status === "done" && img.url ? (
                          <MediaThumb
                            url={img.url}
                            alt={eq.name}
                            className="h-full w-full"
                            iconSize={30}
                            // URL en base mais fichier injoignable : repasser
                            // en erreur pour recompter l'image comme manquante
                            // et réafficher le bouton de génération groupée.
                            onFail={() => markImageFailed(eq.id)}
                          />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center text-muted">
                            {img?.status === "generating" ? (
                              <Loader2 size={26} className="animate-spin" />
                            ) : (
                              <Dumbbell size={30} />
                            )}
                          </div>
                        )}
                        <span
                          className={`absolute left-2 top-2 flex h-6 w-6 items-center justify-center rounded-full ${
                            on
                              ? "bg-accent text-black"
                              : "bg-black/50 text-muted"
                          }`}
                        >
                          {on && <Check size={14} strokeWidth={3} />}
                        </span>
                        {hasKieKey && img?.status !== "generating" && (
                          <IconButton
                            onClick={(e) => {
                              e.stopPropagation();
                              generateImage(eq.id);
                            }}
                            aria-label={`Générer l'image de ${eq.name}`}
                            variant="overlay"
                            size="sm"
                            className="absolute right-2 top-2"
                          >
                            <ImagePlus size={15} />
                          </IconButton>
                        )}
                      </div>
                      <p
                        className={`px-2.5 py-2 text-[12.5px] font-bold leading-tight ${
                          on ? "text-accent" : "text-ink"
                        }`}
                      >
                        {eq.name}
                      </p>
                    </div>
                  );
                })}
              </div>
            </section>
          ))}

          <form
            className="card mt-2 flex flex-col gap-2.5 p-3.5"
            onSubmit={(e) => {
              e.preventDefault();
              const name = newEquipmentName.trim();
              if (!name) return;
              startTransition(async () => {
                await createEquipment(name, newEquipmentCategory);
                setNewEquipmentName("");
              });
            }}
          >
            <p className="text-sm font-extrabold">Ajouter un équipement</p>
            <div className="flex gap-2">
              <input
                value={newEquipmentName}
                onChange={(e) => setNewEquipmentName(e.target.value)}
                placeholder="Nom de l'équipement"
                className="min-w-0 flex-1 rounded-full border-[1.5px] border-border bg-surface-2 px-4 py-2.5 text-sm outline-none focus:border-accent"
              />
              <select
                value={newEquipmentCategory}
                onChange={(e) => setNewEquipmentCategory(e.target.value)}
                className="rounded-full border-[1.5px] border-border bg-surface-2 px-3 py-2.5 text-sm"
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <button
              type="submit"
              className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-full bg-surface-2 px-4 text-sm font-bold"
            >
              <Plus size={17} /> Ajouter
            </button>
          </form>

          <button
            onClick={() => {
              if (
                confirm(
                  `Supprimer le contexte « ${active.name} » ? Les programmes associés seront conservés.`
                )
              ) {
                startTransition(async () => {
                  await deleteLocation(active.id);
                  setActiveId(
                    locations.find((l) => l.id !== active.id)?.id ?? null
                  );
                });
              }
            }}
            className="flex items-center justify-center gap-1.5 text-sm font-semibold text-danger"
          >
            <Trash2 size={15} /> Supprimer ce contexte
          </button>
        </>
      )}
    </div>
  );
}
