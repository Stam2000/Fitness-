import { Dumbbell, type LucideIcon } from "lucide-react";

type MediaThumbProps = {
  url: string | null | undefined;
  alt: string;
  icon?: LucideIcon;
  className?: string;
  iconSize?: number;
};

/**
 * Image avec repli gracieux : sans URL (pas de clé Kie.ai ou média non
 * généré), affiche un bloc dégradé avec une icône centrée.
 */
export default function MediaThumb({
  url,
  alt,
  icon: Icon = Dumbbell,
  className = "",
  iconSize = 28,
}: MediaThumbProps) {
  if (url) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={url} alt={alt} loading="lazy" className={`object-cover ${className}`} />;
  }
  return (
    <div
      role="img"
      aria-label={alt}
      className={`flex items-center justify-center bg-gradient-to-br from-surface-2 to-bg text-muted ${className}`}
    >
      <Icon size={iconSize} strokeWidth={1.75} />
    </div>
  );
}
