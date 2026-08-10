type MediaThumbProps = {
  url: string | null | undefined;
  alt: string;
  emoji?: string;
  className?: string;
  emojiClassName?: string;
};

/**
 * Image avec repli gracieux : sans URL (pas de clé Kie.ai ou média non
 * généré), affiche un bloc dégradé avec un emoji centré.
 */
export default function MediaThumb({
  url,
  alt,
  emoji = "🏋️",
  className = "",
  emojiClassName = "text-3xl",
}: MediaThumbProps) {
  if (url) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={url} alt={alt} loading="lazy" className={`object-cover ${className}`} />;
  }
  return (
    <div
      role="img"
      aria-label={alt}
      className={`flex items-center justify-center bg-gradient-to-br from-surface-2 to-bg ${className}`}
    >
      <span className={emojiClassName}>{emoji}</span>
    </div>
  );
}
