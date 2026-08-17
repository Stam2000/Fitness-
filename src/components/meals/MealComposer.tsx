"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, Loader2, Mic, Square } from "lucide-react";
import BottomSheet from "@/components/ui/BottomSheet";
import { Button } from "@/components/ui/button";
import IconButton from "@/components/ui/IconButton";
import { downscaleImage } from "@/lib/image";
import { useDictation } from "@/lib/use-dictation";

type MealComposerProps = {
  open: boolean;
  onClose: () => void;
  /** Jour consulté : un repas ajouté depuis hier se date d'hier. */
  dayKey: string;
  hasAiKey: boolean;
  /** Appelé une fois le repas créé ET analysé (ou l'analyse échouée). */
  onDone: () => void;
};

type Phase = "idle" | "upload" | "analyze";

/**
 * Prise de vue d'un repas : photo, précisions (au clavier ou à la voix), puis
 * envoi. La capture passe par <input capture> — l'appareil photo natif, plus
 * fiable sur mobile qu'un viseur maison, et disponible en PWA installée.
 */
export default function MealComposer({
  open,
  onClose,
  dayKey,
  hasAiKey,
  onDone,
}: MealComposerProps) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);

  const dictation = useDictation({
    hasAiKey,
    onText: (text) => setNote((n) => (n ? `${n} ${text}` : text)),
  });

  // L'URL d'objet de l'aperçu doit être révoquée, sinon le blob reste en
  // mémoire tant que l'onglet vit.
  useEffect(() => {
    if (!preview) return;
    return () => URL.revokeObjectURL(preview);
  }, [preview]);

  function reset() {
    setFile(null);
    setPreview(null);
    setNote("");
    setPhase("idle");
    setError(null);
    if (fileInput.current) fileInput.current.value = "";
  }

  function close() {
    if (phase !== "idle") return; // envoi en cours : on ne coupe pas
    reset();
    onClose();
  }

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = e.target.files?.[0];
    if (!picked) return;
    setError(null);
    try {
      const reduced = await downscaleImage(picked);
      setFile(reduced);
      setPreview(URL.createObjectURL(reduced));
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Impossible de lire cette photo. Réessaie."
      );
    }
  }

  async function submit() {
    if (!file) return;
    setError(null);
    setPhase("upload");

    // L'envoi et l'analyse sont deux requêtes : une estimation prend cinq à
    // quinze secondes, trop pour tenir une connexion mobile ouverte. Si la
    // seconde échoue, le repas existe déjà avec sa photo et son bouton
    // « Relancer » — la prise de vue n'est jamais perdue.
    try {
      const form = new FormData();
      form.append("photo", file);
      form.append("eatenAt", eatenAtFor(dayKey));
      if (note.trim()) form.append("note", note.trim());

      const res = await fetch("/api/meals", { method: "POST", body: form });
      const json = (await res.json().catch(() => null)) as {
        meal?: { id: string };
        error?: string;
      } | null;
      if (!res.ok || !json?.meal) {
        setError(json?.error ?? "Envoi impossible. Réessaie.");
        setPhase("idle");
        return;
      }

      setPhase("analyze");
      await fetch(`/api/meals/${json.meal.id}/analyze`, { method: "POST" });
      // Même en cas d'échec d'analyse : le repas est visible et relançable.
      reset();
      onDone();
      onClose();
    } catch {
      setError("Envoi impossible. Vérifie ta connexion.");
      setPhase("idle");
    }
  }

  const busy = phase !== "idle";
  const recording = dictation.state === "recording";

  return (
    <BottomSheet open={open} onClose={close}>
      <h2 className="text-[17px] font-extrabold italic">Photographier un repas</h2>
      <p className="mt-1 text-[12.5px] leading-relaxed text-muted-2">
        L&apos;IA estime les calories à partir de la photo. Ajoute ce qu&apos;elle
        ne peut pas voir : huile de cuisson, sauce, boisson…
      </p>

      <input
        ref={fileInput}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={onPick}
        className="hidden"
        aria-label="Photographier le repas"
      />

      {preview ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={preview}
          alt="Aperçu du repas"
          className="mt-4 h-44 w-full rounded-2xl object-cover"
        />
      ) : (
        <button
          type="button"
          onClick={() => fileInput.current?.click()}
          className="mt-4 flex h-44 w-full flex-col items-center justify-center gap-2 rounded-2xl border-[1.5px] border-dashed border-[#33404f] text-muted-2"
        >
          <Camera size={30} strokeWidth={1.75} />
          <span className="text-sm font-semibold">Prendre la photo</span>
        </button>
      )}

      {preview && !busy && (
        <button
          type="button"
          onClick={() => fileInput.current?.click()}
          className="mt-2 text-[12.5px] font-semibold text-muted-2 hover:text-ink"
        >
          Reprendre la photo
        </button>
      )}

      <div className="mt-4">
        <label htmlFor="meal-note" className="overline-label">
          Précisions
        </label>
        <div className="mt-1.5 flex items-start gap-2">
          <textarea
            id="meal-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            disabled={busy}
            placeholder="Cuit à l'huile d'olive, deux cuillères…"
            className="min-w-0 flex-1 resize-none rounded-2xl border-[1.5px] border-border bg-surface-2 px-3.5 py-2.5 text-[14px] text-ink placeholder:text-muted focus:border-accent focus:outline-none"
          />
          {dictation.supported && (
            <IconButton
              aria-label={recording ? "Terminer la dictée" : "Dicter les précisions"}
              variant={recording ? "tint" : "outline"}
              onClick={() => void dictation.toggle()}
              disabled={busy || dictation.state === "transcribing"}
              className={recording ? "recording" : ""}
            >
              {dictation.state === "transcribing" ? (
                <Loader2 size={18} className="animate-spin" />
              ) : recording ? (
                <Square size={16} fill="currentColor" />
              ) : (
                <Mic size={18} />
              )}
            </IconButton>
          )}
        </div>
        {dictation.message && (
          <p className="mt-1.5 text-[12px] text-muted-2">{dictation.message}</p>
        )}
      </div>

      {error && <p className="mt-3 text-[12.5px] text-danger">{error}</p>}

      <div className="mt-4 flex gap-2">
        <Button variant="outline" size="md" onClick={close} disabled={busy}>
          Annuler
        </Button>
        <Button
          variant="primary"
          size="md"
          onClick={submit}
          disabled={!file || busy}
          className="flex-1"
        >
          {phase === "upload" ? (
            <>
              <Loader2 size={17} className="animate-spin" /> Envoi de la photo…
            </>
          ) : phase === "analyze" ? (
            <>
              <Loader2 size={17} className="animate-spin" /> Analyse du repas…
            </>
          ) : (
            "Analyser"
          )}
        </Button>
      </div>
    </BottomSheet>
  );
}

/**
 * Horodatage du repas : l'heure courante si l'on consulte aujourd'hui, midi
 * sinon — un repas ajouté après coup à une journée passée n'a pas d'heure
 * connue, et midi le range au milieu du journal plutôt qu'à minuit.
 */
function eatenAtFor(dayKey: string): string {
  const now = new Date();
  const [y, m, d] = dayKey.split("-").map(Number);
  const isToday =
    now.getFullYear() === y && now.getMonth() + 1 === m && now.getDate() === d;
  return (isToday ? now : new Date(y, m - 1, d, 12, 0, 0)).toISOString();
}
