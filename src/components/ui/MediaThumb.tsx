"use client";

import { useEffect, useRef, useState } from "react";
import { Dumbbell, type LucideIcon } from "lucide-react";

type MediaThumbProps = {
  url: string | null | undefined;
  alt: string;
  icon?: LucideIcon;
  className?: string;
  iconSize?: number;
  /** Recadrage de l'image : cover par défaut, contain pour la vue plein écran. */
  fit?: "cover" | "contain";
  /**
   * Prévenu quand le chargement échoue (URL morte). Le parent peut réagir —
   * p. ex. ProgramDetail repasse le média en « erreur », ce qui rouvre la
   * génération et recompte l'image comme manquante.
   */
  onFail?: () => void;
};

/**
 * Image avec repli gracieux, dans deux cas :
 *  - pas d'URL (média jamais généré, ou pas de clé Kie.ai) ;
 *  - URL présente mais chargement en échec — lien Kie.ai expiré ou fichier
 *    absent du volume. Sans ce repli, le navigateur affiche son icône d'image
 *    cassée et le texte alternatif : illisible et sans explication.
 */
export default function MediaThumb({
  url,
  alt,
  icon: Icon = Dumbbell,
  className = "",
  iconSize = 28,
  fit = "cover",
  onFail,
}: MediaThumbProps) {
  const [failed, setFailed] = useState(false);
  const imgRef = useRef<HTMLImageElement | null>(null);
  // Classes littérales : Tailwind n'extrait pas les noms composés à l'exécution.
  const fitClass = fit === "contain" ? "object-contain" : "object-cover";

  // Une image peut échouer AVANT l'hydratation (URL morte, chargement plus
  // rapide que le JS) : l'événement onError est alors perdu — React ne
  // l'écoute pas encore — et l'icône d'image cassée du navigateur reste à
  // l'écran. L'état DOM permet de constater l'échec a posteriori.
  useEffect(() => {
    const el = imgRef.current;
    if (el?.complete && el.naturalWidth === 0) {
      setFailed(true);
      onFail?.();
    }
  }, [onFail]);

  if (url && !failed) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        ref={imgRef}
        src={url}
        alt={alt}
        loading="lazy"
        onError={() => {
          setFailed(true);
          onFail?.();
        }}
        // text-transparent : si l'image casse avant l'hydratation, le
        // navigateur rend le texte alternatif avec la couleur de l'élément —
        // en transparent, la fenêtre de battement n'affiche plus un gros
        // pavé de texte. Les lecteurs d'écran le lisent toujours.
        className={`${fitClass} text-transparent ${className}`}
      />
    );
  }
  return (
    <div
      role="img"
      aria-label={alt}
      title={failed ? `${alt} — image indisponible` : alt}
      className={`flex items-center justify-center bg-gradient-to-br from-surface-2 to-bg text-muted ${className}`}
    >
      <Icon size={iconSize} strokeWidth={1.75} />
    </div>
  );
}
