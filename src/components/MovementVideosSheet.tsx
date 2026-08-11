"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Loader2,
  MonitorPlay,
  Plus,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import BottomSheet from "@/components/ui/BottomSheet";
import IconButton from "@/components/ui/IconButton";

type MovementVideoView = {
  id: string;
  title: string | null;
  sourceUrl: string;
  videoUrl: string | null;
  status: string; // downloading | ready | failed
  error: string | null;
};

/**
 * Vidéos YouTube de démonstration d'un mouvement : colle un lien, le serveur
 * télécharge la vidéo en local (yt-dlp) et elle reste consultable dans
 * l'app, y compris hors ligne. Plusieurs vidéos par mouvement, partagées
 * entre exercice de base, variantes et programmes (rattachement par nom).
 */
export default function MovementVideosSheet({
  open,
  onClose,
  movementName,
}: {
  open: boolean;
  onClose: () => void;
  movementName: string | null;
}) {
  const [videos, setVideos] = useState<MovementVideoView[] | null>(null);
  const [url, setUrl] = useState("");
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async () => {
    if (!movementName) return;
    try {
      const res = await fetch(
        `/api/movement-videos?name=${encodeURIComponent(movementName)}`
      );
      const json = await res.json();
      if (res.ok) setVideos(json.videos);
    } catch {
      // hors-ligne : on garde la dernière liste connue
    }
  }, [movementName]);

  // À l'ouverture : chargement + polling léger (3 s) tant qu'un
  // téléchargement est en cours ; tout s'arrête à la fermeture.
  useEffect(() => {
    if (!open || !movementName) {
      if (pollTimer.current) clearInterval(pollTimer.current);
      pollTimer.current = null;
      return;
    }
    const start = setTimeout(() => {
      setVideos(null);
      setError(null);
      load();
    }, 0);
    pollTimer.current = setInterval(load, 3000);
    return () => {
      clearTimeout(start);
      if (pollTimer.current) clearInterval(pollTimer.current);
      pollTimer.current = null;
    };
  }, [open, movementName, load]);

  async function addVideo() {
    if (!movementName || !url.trim()) return;
    setAdding(true);
    setError(null);
    try {
      const res = await fetch("/api/movement-videos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: movementName, url: url.trim() }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Erreur lors de l'ajout.");
        return;
      }
      setUrl("");
      load();
    } catch {
      setError("Erreur réseau. Réessaie.");
    } finally {
      setAdding(false);
    }
  }

  async function removeVideo(id: string) {
    if (!confirm("Supprimer cette vidéo ?")) return;
    await fetch(`/api/movement-videos/${id}`, { method: "DELETE" }).catch(
      () => {}
    );
    load();
  }

  return (
    <BottomSheet open={open} onClose={onClose}>
      <h2 className="flex items-center gap-2 text-lg font-extrabold italic">
        <MonitorPlay size={18} className="shrink-0 text-accent" />
        <span className="min-w-0 truncate">{movementName}</span>
      </h2>
      <p className="mt-1 text-xs text-muted-2">
        Colle un lien YouTube : la vidéo est téléchargée dans l&apos;app et
        reste consultable, même hors ligne.
      </p>

      <div className="mt-3 flex gap-2">
        <input
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://youtube.com/watch?v=…"
          className="min-w-0 flex-1 rounded-[18px] border-[1.5px] border-border bg-surface px-4 py-3 text-sm outline-none focus:border-accent"
          aria-label="Lien YouTube"
        />
        <IconButton
          onClick={addVideo}
          disabled={adding || !url.trim()}
          variant="solid"
          size="lg"
          aria-label="Ajouter la vidéo"
          className="self-center"
        >
          {adding ? (
            <Loader2 size={17} className="animate-spin" />
          ) : (
            <Plus size={17} />
          )}
        </IconButton>
      </div>
      {error && <p className="mt-2 text-sm text-danger">{error}</p>}

      <div className="mt-3 flex max-h-[55vh] flex-col gap-3 overflow-y-auto">
        {videos === null ? (
          <p className="animate-pulse text-sm text-muted">Chargement…</p>
        ) : videos.length === 0 ? (
          <p className="text-sm text-muted">
            Aucune vidéo pour ce mouvement pour l&apos;instant.
          </p>
        ) : (
          videos.map((v) => (
            <div key={v.id} className="flex flex-col gap-1.5">
              {v.status === "ready" && v.videoUrl ? (
                <video
                  controls
                  preload="metadata"
                  src={v.videoUrl}
                  className="w-full rounded-2xl border border-card-border bg-black"
                />
              ) : v.status === "downloading" ? (
                <p className="flex animate-pulse items-center gap-1.5 rounded-2xl bg-surface-2 px-3.5 py-3 text-sm text-muted">
                  <Loader2 size={15} className="shrink-0 animate-spin" />
                  Téléchargement en cours… (selon la durée de la vidéo)
                </p>
              ) : (
                <p className="flex items-start gap-1.5 rounded-2xl bg-danger/10 px-3.5 py-3 text-xs text-danger">
                  <TriangleAlert size={13} className="mt-0.5 shrink-0" />
                  Échec : {v.error ?? "erreur inconnue"}
                </p>
              )}
              <div className="flex items-center justify-between gap-2">
                <p className="min-w-0 flex-1 truncate text-xs font-semibold text-muted-2">
                  {v.title ?? v.sourceUrl}
                </p>
                <IconButton
                  onClick={() => removeVideo(v.id)}
                  variant="ghost"
                  size="sm"
                  aria-label="Supprimer la vidéo"
                >
                  <Trash2 size={15} />
                </IconButton>
              </div>
            </div>
          ))
        )}
      </div>
    </BottomSheet>
  );
}
