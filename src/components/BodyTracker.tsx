"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  BicepsFlexed,
  Camera,
  CircleCheck,
  FileUp,
  Loader2,
  Percent,
  PersonStanding,
  Plus,
  Trash2,
  Weight,
  X,
  type LucideIcon,
} from "lucide-react";
import {
  addBodyMeasurement,
  deleteBodyMeasurement,
  deleteProgressPhoto,
} from "@/app/actions";
import { btn, Button } from "@/components/ui/button";
import IconButton from "@/components/ui/IconButton";
import NutritionGoals, { type GoalView } from "@/components/NutritionGoals";

type MeasurementView = {
  id: string;
  dateIso: string;
  weightKg: number | null;
  muscleMassKg: number | null;
  bodyFatPct: number | null;
  notes: string | null;
};

type PhotoView = {
  id: string;
  dateIso: string;
  imageUrl: string;
  note: string | null;
};

const SERIES = "var(--color-accent-dark)";

function formatDate(iso: string) {
  return new Intl.DateTimeFormat("fr-FR", {
    day: "numeric",
    month: "short",
    year: "2-digit",
  }).format(new Date(iso));
}

function todayInput(): string {
  return new Date().toISOString().slice(0, 10);
}

const inputClass =
  "w-full rounded-[18px] border-[1.5px] border-border bg-surface px-4 py-3 text-sm outline-none focus:border-accent";

// Courbe simple d'une métrique corporelle dans le temps (SVG, même style
// que les graphiques de progression des exercices).
function MetricChart({
  icon: Icon,
  label,
  unit,
  points,
}: {
  icon: LucideIcon;
  label: string;
  unit: string;
  points: { dateIso: string; value: number }[];
}) {
  const [active, setActive] = useState(points.length - 1);
  if (points.length === 0) return null;

  const W = 320;
  const H = 110;
  const PAD_X = 10;
  const PAD_TOP = 24;
  const PAD_BOTTOM = 18;
  const values = points.map((p) => p.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const innerW = W - PAD_X * 2;
  const innerH = H - PAD_TOP - PAD_BOTTOM;
  const x = (i: number) =>
    points.length === 1 ? W / 2 : PAD_X + (i / (points.length - 1)) * innerW;
  const y = (v: number) => PAD_TOP + innerH - ((v - min) / span) * innerH;
  const path = values
    .map((v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(v).toFixed(1)}`)
    .join(" ");
  const current = points[Math.min(active, points.length - 1)];

  return (
    <div className="card p-4">
      <div className="flex items-baseline justify-between">
        <h3 className="flex items-center gap-1.5 text-sm font-extrabold">
          <Icon size={15} className="text-muted-2" /> {label}
        </h3>
        <p className="font-mono text-sm font-bold text-accent">
          {current.value} {unit}
          <span className="ml-1.5 text-xs font-medium text-muted">
            {formatDate(current.dateIso)}
          </span>
        </p>
      </div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="mt-1 w-full font-mono"
        role="img"
        aria-label={`${label} : ${values.join(", ")} ${unit}`}
      >
        {[min, max].map((v) => (
          <g key={v}>
            <line
              x1={PAD_X}
              x2={W - PAD_X}
              y1={y(v)}
              y2={y(v)}
              stroke="var(--color-border)"
              strokeWidth="1"
            />
            <text x={PAD_X} y={y(v) - 3} fill="var(--color-muted)" fontSize="9">
              {v} {unit}
            </text>
          </g>
        ))}
        {values.length > 1 && (
          <path d={path} fill="none" stroke={SERIES} strokeWidth="2" />
        )}
        {values.map((v, i) => (
          <g key={i}>
            <circle
              cx={x(i)}
              cy={y(v)}
              r="14"
              fill="transparent"
              onClick={() => setActive(i)}
            />
            <circle
              cx={x(i)}
              cy={y(v)}
              r={i === active ? 5 : 4}
              fill={SERIES}
              stroke="var(--color-surface)"
              strokeWidth="2"
              pointerEvents="none"
            />
          </g>
        ))}
      </svg>
    </div>
  );
}

export default function BodyTracker({
  measurements,
  photos,
  goal,
}: {
  measurements: MeasurementView[]; // triées par date croissante
  photos: PhotoView[]; // triées par date décroissante
  goal: GoalView | null;
}) {
  const router = useRouter();

  // — Formulaire de mesure —
  const [date, setDate] = useState(todayInput);
  const [weight, setWeight] = useState("");
  const [muscle, setMuscle] = useState("");
  const [fat, setFat] = useState("");
  const [savingMeasure, setSavingMeasure] = useState(false);
  const [measureError, setMeasureError] = useState<string | null>(null);

  // — Upload de photo —
  const fileInput = useRef<HTMLInputElement>(null);
  const [photoDate, setPhotoDate] = useState(todayInput);
  const [photoNote, setPhotoNote] = useState("");
  const [uploading, setUploading] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);

  // — Visionneuse plein écran —
  const [viewer, setViewer] = useState<PhotoView | null>(null);

  // — Comparaison avant/après (par défaut : première vs dernière photo) —
  const photosAsc = [...photos].reverse();
  const [leftId, setLeftId] = useState<string | null>(null);
  const [rightId, setRightId] = useState<string | null>(null);
  const leftPhoto =
    photosAsc.find((p) => p.id === leftId) ?? photosAsc[0] ?? null;
  const rightPhoto =
    photosAsc.find((p) => p.id === rightId) ??
    photosAsc[photosAsc.length - 1] ??
    null;

  // — Import CSV Samsung Health —
  const importInput = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);
  const [importMsg, setImportMsg] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);

  const num = (s: string): number | null => {
    const v = parseFloat(s.replace(",", "."));
    return isFinite(v) ? v : null;
  };

  async function saveMeasurement() {
    setSavingMeasure(true);
    setMeasureError(null);
    try {
      await addBodyMeasurement({
        date,
        weightKg: num(weight),
        muscleMassKg: num(muscle),
        bodyFatPct: num(fat),
      });
      setWeight("");
      setMuscle("");
      setFat("");
    } catch (e) {
      setMeasureError(
        e instanceof Error ? e.message : "Impossible d'enregistrer la mesure."
      );
    } finally {
      setSavingMeasure(false);
    }
  }

  async function uploadPhoto() {
    const file = fileInput.current?.files?.[0];
    if (!file) {
      setPhotoError("Choisis d'abord une photo.");
      return;
    }
    setUploading(true);
    setPhotoError(null);
    try {
      const form = new FormData();
      form.append("photo", file);
      form.append("date", photoDate);
      if (photoNote.trim()) form.append("note", photoNote.trim());
      const res = await fetch("/api/body/photos", {
        method: "POST",
        body: form,
      });
      const json = await res.json();
      if (!res.ok) {
        setPhotoError(json.error ?? "Erreur lors de l'envoi.");
        return;
      }
      if (fileInput.current) fileInput.current.value = "";
      setPhotoNote("");
      router.refresh();
    } catch {
      setPhotoError("Erreur réseau. Réessaie.");
    } finally {
      setUploading(false);
    }
  }

  async function importCsv() {
    const file = importInput.current?.files?.[0];
    if (!file) {
      setImportError("Choisis d'abord le fichier CSV exporté.");
      return;
    }
    setImporting(true);
    setImportError(null);
    setImportMsg(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/body/import", {
        method: "POST",
        body: form,
      });
      const json = await res.json();
      if (!res.ok) {
        setImportError(json.error ?? "Erreur lors de l'import.");
        return;
      }
      const parts = [`${json.imported} mesure(s) importée(s)`];
      if (json.skippedExisting > 0) {
        parts.push(`${json.skippedExisting} jour(s) déjà présent(s)`);
      }
      if (json.skippedInvalid > 0) {
        parts.push(`${json.skippedInvalid} ligne(s) ignorée(s)`);
      }
      setImportMsg(parts.join(" · "));
      if (importInput.current) importInput.current.value = "";
      router.refresh();
    } catch {
      setImportError("Erreur réseau. Réessaie.");
    } finally {
      setImporting(false);
    }
  }

  const weightPoints = measurements
    .filter((m) => m.weightKg != null)
    .map((m) => ({ dateIso: m.dateIso, value: m.weightKg! }));
  const musclePoints = measurements
    .filter((m) => m.muscleMassKg != null)
    .map((m) => ({ dateIso: m.dateIso, value: m.muscleMassKg! }));
  const fatPoints = measurements
    .filter((m) => m.bodyFatPct != null)
    .map((m) => ({ dateIso: m.dateIso, value: m.bodyFatPct! }));
  const recent = [...measurements].reverse().slice(0, 8);
  // Dernier poids pesé (mesures triées par date croissante) : c'est la base de
  // calcul des objectifs nutritionnels.
  const currentWeightKg =
    weightPoints.length > 0 ? weightPoints[weightPoints.length - 1].value : null;

  return (
    <main className="flex flex-col gap-5 pb-6">
      <header className="pt-2">
        <h1 className="flex items-center gap-2 text-[21px] font-extrabold italic leading-tight tracking-tight">
          <PersonStanding size={20} className="text-accent" /> Suivi corporel
        </h1>
        <p className="mt-1 text-[13.5px] text-muted-2">
          Poids, masse musculaire et photos de progression — recopie les
          valeurs de ta montre ou de ta balance.
        </p>
      </header>

      <NutritionGoals goal={goal} currentWeightKg={currentWeightKg} />

      {/* — Nouvelle mesure — */}
      <section className="card flex flex-col gap-3 p-4">
        <h2 className="overline-label">Nouvelle mesure</h2>
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className={inputClass}
          aria-label="Date de la mesure"
        />
        <div className="grid grid-cols-3 gap-2">
          <label className="flex flex-col gap-1 text-xs font-semibold text-muted">
            Poids (kg)
            <input
              type="text"
              inputMode="decimal"
              value={weight}
              onChange={(e) => setWeight(e.target.value)}
              placeholder="82,4"
              className={inputClass}
            />
          </label>
          <label className="flex flex-col gap-1 text-xs font-semibold text-muted">
            Muscle (kg)
            <input
              type="text"
              inputMode="decimal"
              value={muscle}
              onChange={(e) => setMuscle(e.target.value)}
              placeholder="36,2"
              className={inputClass}
            />
          </label>
          <label className="flex flex-col gap-1 text-xs font-semibold text-muted">
            Graisse (%)
            <input
              type="text"
              inputMode="decimal"
              value={fat}
              onChange={(e) => setFat(e.target.value)}
              placeholder="18,5"
              className={inputClass}
            />
          </label>
        </div>
        {measureError && (
          <p className="text-sm text-danger">{measureError}</p>
        )}
        <Button
          onClick={saveMeasurement}
          disabled={savingMeasure || (!weight && !muscle && !fat)}
          variant="primary"
          size="md"
        >
          {savingMeasure ? (
            <>
              <Loader2 size={17} className="animate-spin" /> Enregistrement…
            </>
          ) : (
            <>
              <Plus size={17} /> Enregistrer
            </>
          )}
        </Button>

        <div className="mt-1 flex flex-col gap-2 border-t border-border pt-3">
          <p className="flex items-center gap-1.5 text-xs font-extrabold">
            <FileUp size={15} className="shrink-0" /> Importer un export
            Samsung Health
          </p>
          <p className="text-xs leading-relaxed text-muted">
            Samsung Health → Paramètres → Télécharger les données personnelles,
            puis choisis le fichier{" "}
            <span className="font-mono">com.samsung.health.weight.….csv</span>{" "}
            — poids, masse musculaire et % de graisse seront repris (une mesure
            par jour, sans doublons).
          </p>
          <input
            ref={importInput}
            type="file"
            accept=".csv,text/csv,text/plain"
            className="text-sm file:mr-3 file:rounded-full file:border-0 file:bg-surface-2 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-ink"
            aria-label="Choisir le fichier CSV"
          />
          {importError && <p className="text-sm text-danger">{importError}</p>}
          {importMsg && (
            <p className="flex items-start gap-1.5 text-sm font-semibold text-accent">
              <CircleCheck size={15} className="mt-0.5 shrink-0" /> {importMsg}
            </p>
          )}
          <button
            onClick={importCsv}
            disabled={importing}
            aria-label="Importer le fichier CSV"
            title="Importer le fichier CSV"
            className={btn("outline", "md")}
          >
            {importing ? (
              <>
                <Loader2 size={17} className="animate-spin" /> Import…
              </>
            ) : (
              <>
                <FileUp size={17} /> Importer
              </>
            )}
          </button>
        </div>
      </section>

      {/* — Courbes — */}
      {(weightPoints.length > 0 ||
        musclePoints.length > 0 ||
        fatPoints.length > 0) && (
        <section className="flex flex-col gap-3">
          <MetricChart icon={Weight} label="Poids" unit="kg" points={weightPoints} />
          <MetricChart
            icon={BicepsFlexed}
            label="Masse musculaire"
            unit="kg"
            points={musclePoints}
          />
          <MetricChart
            icon={Percent}
            label="Masse grasse"
            unit="%"
            points={fatPoints}
          />
        </section>
      )}

      {/* — Dernières mesures — */}
      {recent.length > 0 && (
        <section className="card p-4">
          <h2 className="overline-label mb-2">Dernières mesures</h2>
          <ul className="flex flex-col divide-y divide-border">
            {recent.map((m) => (
              <li key={m.id} className="flex items-center gap-2 py-2 text-sm">
                <span className="w-20 shrink-0 font-mono text-xs text-muted">
                  {formatDate(m.dateIso)}
                </span>
                <span className="flex flex-1 flex-wrap items-center gap-x-2.5 gap-y-0.5 font-semibold">
                  {m.weightKg != null && <span>{m.weightKg} kg</span>}
                  {m.muscleMassKg != null && (
                    <span className="flex items-center gap-1">
                      <BicepsFlexed size={13} className="text-muted" />
                      {m.muscleMassKg} kg
                    </span>
                  )}
                  {m.bodyFatPct != null && <span>{m.bodyFatPct} %</span>}
                </span>
                <IconButton
                  onClick={() => {
                    if (confirm("Supprimer cette mesure ?")) {
                      deleteBodyMeasurement(m.id);
                    }
                  }}
                  aria-label="Supprimer la mesure"
                  variant="ghost"
                  size="sm"
                >
                  <X size={15} />
                </IconButton>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* — Photos de progression — */}
      <section className="card flex flex-col gap-3 p-4">
        <h2 className="overline-label">Photos de progression</h2>
        <input
          ref={fileInput}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="text-sm file:mr-3 file:rounded-full file:border-0 file:bg-surface-2 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-ink"
          aria-label="Choisir une photo"
        />
        <div className="grid grid-cols-2 gap-2">
          <input
            type="date"
            value={photoDate}
            onChange={(e) => setPhotoDate(e.target.value)}
            className={inputClass}
            aria-label="Date de la photo"
          />
          <input
            type="text"
            value={photoNote}
            onChange={(e) => setPhotoNote(e.target.value)}
            placeholder="Note (optionnel)"
            className={inputClass}
          />
        </div>
        {photoError && <p className="text-sm text-danger">{photoError}</p>}
        <Button
          onClick={uploadPhoto}
          disabled={uploading}
          variant="primary"
          size="md"
        >
          {uploading ? (
            <>
              <Loader2 size={17} className="animate-spin" /> Envoi…
            </>
          ) : (
            <>
              <Camera size={17} /> Ajouter
            </>
          )}
        </Button>
      </section>

      {/* — Comparaison avant / après — */}
      {photosAsc.length >= 2 && leftPhoto && rightPhoto && (
        <section className="card p-4">
          <h2 className="overline-label mb-2.5">Comparaison avant / après</h2>
          <div className="grid grid-cols-2 gap-2.5">
            {[
              { label: "Avant", photo: leftPhoto, set: setLeftId },
              { label: "Après", photo: rightPhoto, set: setRightId },
            ].map((panel) => (
              <div key={panel.label} className="flex flex-col gap-1.5">
                <button
                  onClick={() => setViewer(panel.photo)}
                  className="overflow-hidden rounded-2xl border border-card-border"
                  aria-label={`${panel.label} : agrandir la photo`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={panel.photo.imageUrl}
                    alt={`${panel.label} — ${formatDate(panel.photo.dateIso)}`}
                    loading="lazy"
                    className="aspect-[3/4] w-full object-cover"
                  />
                </button>
                <select
                  value={panel.photo.id}
                  onChange={(e) => panel.set(e.target.value)}
                  aria-label={`Photo « ${panel.label} »`}
                  className="w-full rounded-full border-[1.5px] border-border bg-surface px-3 py-2 text-xs font-semibold outline-none focus:border-accent"
                >
                  {photosAsc.map((p) => (
                    <option key={p.id} value={p.id}>
                      {panel.label === "Avant" ? "Avant · " : "Après · "}
                      {formatDate(p.dateIso)}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        </section>
      )}

      {photos.length > 0 && (
        <section className="grid grid-cols-3 gap-2">
          {photos.map((p) => (
            <button
              key={p.id}
              onClick={() => setViewer(p)}
              className="group relative overflow-hidden rounded-2xl border border-card-border"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={p.imageUrl}
                alt={`Photo du ${formatDate(p.dateIso)}`}
                loading="lazy"
                className="aspect-[3/4] w-full object-cover"
              />
              <span className="absolute inset-x-0 bottom-0 bg-black/55 px-1.5 py-1 text-center font-mono text-[10px] font-bold text-white">
                {formatDate(p.dateIso)}
              </span>
            </button>
          ))}
        </section>
      )}

      {/* — Visionneuse plein écran — */}
      {viewer && (
        <div className="fixed inset-0 z-50 flex flex-col bg-black/90">
          <button
            aria-label="Fermer"
            onClick={() => setViewer(null)}
            className="absolute inset-0"
          />
          <div className="relative m-auto flex w-full max-w-lg flex-col gap-3 p-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={viewer.imageUrl}
              alt={`Photo du ${formatDate(viewer.dateIso)}`}
              className="max-h-[75vh] w-full rounded-2xl object-contain"
            />
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-bold text-white">
                {formatDate(viewer.dateIso)}
                {viewer.note && (
                  <span className="ml-2 font-normal text-white/70">
                    {viewer.note}
                  </span>
                )}
              </p>
              <div className="flex gap-2">
                <IconButton
                  onClick={() => {
                    if (confirm("Supprimer cette photo ?")) {
                      deleteProgressPhoto(viewer.id);
                      setViewer(null);
                    }
                  }}
                  aria-label="Supprimer la photo"
                  variant="danger"
                  size="md"
                >
                  <Trash2 size={17} />
                </IconButton>
                <IconButton
                  onClick={() => setViewer(null)}
                  aria-label="Fermer"
                  variant="overlay"
                  size="md"
                >
                  <X size={17} />
                </IconButton>
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
