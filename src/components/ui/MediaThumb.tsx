"use client";

import { useState } from "react";
import { Dumbbell, type LucideIcon } from "lucide-react";

type MediaThumbProps = {
  url: string | null | undefined;
  alt: string;
  icon?: LucideIcon;
  className?: string;
  iconSize?: number;
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
}: MediaThumbProps) {
  const [failed, setFailed] = useState(false);

  if (url && !failed) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={url}
        alt={alt}
        loading="lazy"
        onError={() => setFailed(true)}
        className={`object-cover ${className}`}
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
