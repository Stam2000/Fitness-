import type { ButtonHTMLAttributes } from "react";

export type BtnVariant =
  | "primary"
  | "outline"
  | "tint"
  | "warm"
  | "warmOutline"
  | "ghost"
  | "danger";
export type BtnSize = "lg" | "md" | "sm";

const VARIANTS: Record<BtnVariant, string> = {
  primary: "bg-accent text-black",
  outline: "border-[1.5px] border-border text-ink",
  tint: "border-[1.5px] border-accent/50 bg-accent/10 text-accent",
  warm: "bg-warm text-black",
  warmOutline: "border-[1.5px] border-warm/50 bg-warm/10 text-warm-light",
  ghost: "text-muted",
  danger: "text-danger",
};

const SIZES: Record<BtnSize, string> = {
  lg: "min-h-[52px] px-6 text-base",
  md: "min-h-[44px] px-4 text-sm",
  sm: "min-h-[38px] px-3.5 text-sm",
};

/**
 * Classes du bouton pilule Vitrine — utilisable sur <button>, <Link> ou
 * n'importe quel élément cliquable.
 */
export function btn(
  variant: BtnVariant = "primary",
  size: BtnSize = "md",
  extra = "",
): string {
  return `inline-flex items-center justify-center gap-2 rounded-full font-semibold transition-colors disabled:opacity-50 ${VARIANTS[variant]} ${SIZES[size]}${extra ? ` ${extra}` : ""}`;
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: BtnVariant;
  size?: BtnSize;
};

export function Button({
  variant = "primary",
  size = "md",
  className = "",
  type = "button",
  ...rest
}: ButtonProps) {
  return <button type={type} className={btn(variant, size, className)} {...rest} />;
}
