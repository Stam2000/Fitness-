import type { ButtonHTMLAttributes } from "react";

type IconBtnVariant = "outline" | "tint" | "solid" | "ghost" | "danger" | "overlay";
type IconBtnSize = "sm" | "md" | "lg";

const VARIANTS: Record<IconBtnVariant, string> = {
  outline: "border-[1.5px] border-border text-muted-2 hover:text-ink",
  tint: "border-[1.5px] border-accent/50 bg-accent/10 text-accent",
  solid: "bg-accent text-black",
  ghost: "text-muted-2 hover:text-ink",
  danger: "border-[1.5px] border-danger/40 bg-danger/10 text-danger",
  overlay: "bg-bg/70 text-ink backdrop-blur",
};

const SIZES: Record<IconBtnSize, string> = {
  sm: "h-8 w-8",
  md: "h-10 w-10",
  lg: "h-12 w-12",
};

type IconButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  /** Obligatoire : seul texte accessible du bouton (icône seule à l'écran). */
  "aria-label": string;
  variant?: IconBtnVariant;
  size?: IconBtnSize;
};

/**
 * Bouton rond « icône seule » : l'action est portée par l'icône Lucide,
 * le libellé vit dans aria-label (et title, pour l'infobulle au survol).
 */
export default function IconButton({
  variant = "outline",
  size = "md",
  className = "",
  type = "button",
  title,
  ...rest
}: IconButtonProps) {
  return (
    <button
      type={type}
      title={title ?? rest["aria-label"]}
      className={`inline-flex shrink-0 items-center justify-center rounded-full transition-colors disabled:opacity-50 ${VARIANTS[variant]} ${SIZES[size]}${className ? ` ${className}` : ""}`}
      {...rest}
    />
  );
}
