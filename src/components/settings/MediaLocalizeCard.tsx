"use client";

import { useState, useTransition } from "react";
import { CheckCircle2, FolderDown, TriangleAlert } from "lucide-react";
import { btn } from "@/components/ui/button";
import { localizeRemoteMedia, type MediaLocalizeReport } from "@/app/actions";

/**
 * Carte d'admin : rapatrie en un appui tout média encore hébergé chez Kie.ai
 * vers le stockage local de l'app. Les liens Kie.ai expirent (~14 jours) ;
 * les générations récentes sont déjà sauvegardées à la création, cette carte
 * rattrape ce qui leur est antérieur — sans passer par la ligne de commande.
 */
export default function MediaLocalizeCard() {
  const [report, setReport] = useState<MediaLocalizeReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function run() {
    setError(null);
    startTransition(async () => {
      try {
        setReport(await localizeRemoteMedia());
      } catch {
        setError("Rapatriement impossible. Réessaie.");
      }
    });
  }

  const allGood = report && report.localized === 0 && report.dead.length === 0;

  return (
    <section className="card p-4">
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <h2 className="overline-label flex items-center gap-1.5">
            <FolderDown size={13} className="text-accent" /> Médias locaux
          </h2>
          <p className="mt-1.5 text-[13px] leading-relaxed text-muted-2">
            Les images et vidéos générées par l&apos;IA sont copiées dans le
            stockage de l&apos;app : les liens d&apos;origine (Kie.ai) expirent
            au bout de ~14 jours. Un appui rattrape tout ce qui ne l&apos;est
            pas encore.
          </p>
        </div>
        <button
          onClick={run}
          disabled={pending}
          className={btn("tint", "md", "shrink-0")}
        >
          {pending ? "Rapatriement…" : "Rapatrier"}
        </button>
      </div>

      {report && (
        <div className="mt-3 border-t border-card-border pt-3 text-[13px]">
          {report.localized > 0 && (
            <p className="flex items-start gap-1.5 text-accent">
              <CheckCircle2 size={15} className="mt-0.5 shrink-0" />
              {report.localized} média{report.localized > 1 ? "s" : ""}{" "}
              rapatrié{report.localized > 1 ? "s" : ""} en local.
            </p>
          )}
          {allGood && (
            <p className="flex items-start gap-1.5 text-accent">
              <CheckCircle2 size={15} className="mt-0.5 shrink-0" />
              Tous les médias sont déjà en local.
            </p>
          )}
          {report.dead.length > 0 && (
            <>
              <p className="mt-1.5 flex items-start gap-1.5 text-warm">
                <TriangleAlert size={15} className="mt-0.5 shrink-0" />
                <span>
                  {report.dead.length} lien{report.dead.length > 1 ? "s" : ""}{" "}
                  mort{report.dead.length > 1 ? "s" : ""} (expiré
                  {report.dead.length > 1 ? "s" : ""}) : régénère{" "}
                  {report.dead.length > 1 ? "les" : "l'"}
                  image{report.dead.length > 1 ? "s" : ""} avec le bouton
                  « régénérer » de l&apos;exercice — la nouvelle sera aussitôt
                  copiée en local.
                </span>
              </p>
              <p className="mt-1 truncate pl-[22px] text-[12px] text-muted-2">
                {report.dead.slice(0, 6).join(" · ")}
                {report.dead.length > 6 ? " · …" : ""}
              </p>
            </>
          )}
        </div>
      )}
      {error && <p className="mt-2 text-[13px] text-danger">{error}</p>}
    </section>
  );
}
