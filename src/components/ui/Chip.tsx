import type { ButtonHTMLAttributes } from "react";

type ChipProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  active?: boolean;
  tone?: "accent" | "warm";
  /** tint = bordure + fond translucide ; solid = fond plein, texte noir. */
  activeStyle?: "tint" | "solid";
  /** Atténue la puce (ex. objectifs non choisis quand 2 sont déjà cochés). */
  dimmed?: boolean;
};

/** Pilule sélectionnable : objectifs, niveaux, contextes, variantes, raisons… */
export default function Chip({
  active = false,
  tone = "accent",
  activeStyle = "tint",
  dimmed = false,
  className = "",
  type = "button",
  ...rest
}: ChipProps) {
  const activeClasses =
    activeStyle === "solid"
      ? tone === "warm"
        ? "bg-warm font-bold text-black"
        : "bg-accent font-bold text-black"
      : tone === "warm"
        ? "border-[1.5px] border-warm/50 bg-warm/10 font-bold text-warm-light"
        : "border-[1.5px] border-accent bg-accent/15 font-bold text-accent";
  return (
    <button
      type={type}
      className={`inline-flex min-h-[42px] items-center justify-center gap-1.5 rounded-full px-4 text-sm transition-colors ${
        active
          ? activeClasses
          : "border-[1.5px] border-border font-medium text-muted-2"
      }${dimmed ? " opacity-40" : ""}${className ? ` ${className}` : ""}`}
      {...rest}
    />
  );
}
