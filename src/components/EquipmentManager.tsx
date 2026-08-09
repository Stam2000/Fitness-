"use client";

import { useMemo, useState, useTransition } from "react";
import {
  createEquipment,
  createLocation,
  deleteLocation,
  toggleLocationEquipment,
} from "@/app/actions";

type LocationView = {
  id: string;
  name: string;
  icon: string | null;
  equipmentIds: string[];
};

type EquipmentView = { id: string; name: string; category: string };

const CATEGORIES = [
  "Poids du corps",
  "Haltères & poids libres",
  "Machines",
  "Cardio",
  "Accessoires",
];

export default function EquipmentManager({
  locations,
  equipment,
}: {
  locations: LocationView[];
  equipment: EquipmentView[];
}) {
  const [activeId, setActiveId] = useState<string | null>(
    locations[0]?.id ?? null
  );
  const [checked, setChecked] = useState<Record<string, Set<string>>>(() =>
    Object.fromEntries(locations.map((l) => [l.id, new Set(l.equipmentIds)]))
  );
  const [, startTransition] = useTransition();
  const [showNewLocation, setShowNewLocation] = useState(false);
  const [newLocationName, setNewLocationName] = useState("");
  const [newEquipmentName, setNewEquipmentName] = useState("");
  const [newEquipmentCategory, setNewEquipmentCategory] = useState(
    "Accessoires"
  );

  const byCategory = useMemo(() => {
    const map = new Map<string, EquipmentView[]>();
    for (const cat of CATEGORIES) map.set(cat, []);
    for (const eq of equipment) {
      if (!map.has(eq.category)) map.set(eq.category, []);
      map.get(eq.category)!.push(eq);
    }
    return [...map.entries()].filter(([, items]) => items.length > 0);
  }, [equipment]);

  const active = locations.find((l) => l.id === activeId);
  const activeChecked = activeId ? checked[activeId] ?? new Set() : new Set();

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

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-2">
        {locations.map((l) => (
          <button
            key={l.id}
            onClick={() => setActiveId(l.id)}
            className={`rounded-xl px-4 py-2.5 text-sm font-semibold ${
              l.id === activeId
                ? "bg-accent text-black"
                : "border border-border bg-surface text-ink"
            }`}
          >
            {l.icon} {l.name}
            <span className="ml-1.5 text-xs opacity-70">
              {checked[l.id]?.size ?? 0}
            </span>
          </button>
        ))}
        <button
          onClick={() => setShowNewLocation((v) => !v)}
          className="rounded-xl border border-dashed border-border px-4 py-2.5 text-sm text-muted"
        >
          + Contexte
        </button>
      </div>

      {showNewLocation && (
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const name = newLocationName.trim();
            if (!name) return;
            startTransition(async () => {
              await createLocation(name, "📍");
              setNewLocationName("");
              setShowNewLocation(false);
            });
          }}
        >
          <input
            value={newLocationName}
            onChange={(e) => setNewLocationName(e.target.value)}
            placeholder="Ex. Hôtel, Parc, Bureau…"
            className="min-w-0 flex-1 rounded-xl border border-border bg-surface px-3 py-2.5 text-sm outline-none focus:border-accent"
          />
          <button
            type="submit"
            className="rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-black"
          >
            Ajouter
          </button>
        </form>
      )}

      {active && (
        <>
          {byCategory.map(([category, items]) => (
            <section key={category}>
              <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">
                {category}
              </h2>
              <div className="flex flex-wrap gap-2">
                {items.map((eq) => {
                  const on = activeChecked.has(eq.id);
                  return (
                    <button
                      key={eq.id}
                      onClick={() => toggle(eq.id)}
                      className={`rounded-full border px-3.5 py-2 text-sm ${
                        on
                          ? "border-accent bg-accent/15 text-accent"
                          : "border-border bg-surface text-muted"
                      }`}
                    >
                      {on ? "✓ " : ""}
                      {eq.name}
                    </button>
                  );
                })}
              </div>
            </section>
          ))}

          <form
            className="mt-2 flex flex-col gap-2 rounded-2xl border border-border bg-surface p-3"
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
            <p className="text-sm font-semibold">Ajouter un équipement</p>
            <div className="flex gap-2">
              <input
                value={newEquipmentName}
                onChange={(e) => setNewEquipmentName(e.target.value)}
                placeholder="Nom de l'équipement"
                className="min-w-0 flex-1 rounded-xl border border-border bg-surface-2 px-3 py-2.5 text-sm outline-none focus:border-accent"
              />
              <select
                value={newEquipmentCategory}
                onChange={(e) => setNewEquipmentCategory(e.target.value)}
                className="rounded-xl border border-border bg-surface-2 px-2 py-2.5 text-sm"
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
              className="rounded-xl bg-surface-2 px-4 py-2.5 text-sm font-semibold"
            >
              + Ajouter
            </button>
          </form>

          {locations.length > 1 && (
            <button
              onClick={() => {
                if (
                  confirm(
                    `Supprimer le contexte « ${active.name} » ? Les programmes associés seront conservés.`
                  )
                ) {
                  startTransition(async () => {
                    await deleteLocation(active.id);
                    setActiveId(locations.find((l) => l.id !== active.id)?.id ?? null);
                  });
                }
              }}
              className="text-sm text-danger"
            >
              Supprimer ce contexte
            </button>
          )}
        </>
      )}
    </div>
  );
}
