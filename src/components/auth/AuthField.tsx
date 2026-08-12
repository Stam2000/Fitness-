import type { InputHTMLAttributes } from "react";

/** Champ de formulaire des pages publiques : libellé au-dessus, pilule en dessous. */
export default function AuthField({
  label,
  hint,
  className = "",
  ...rest
}: InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: string }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="overline-label">{label}</span>
      <input
        {...rest}
        className={`w-full rounded-full border-[1.5px] border-border bg-surface-2 px-4 py-2.5 text-sm outline-none placeholder:text-muted focus:border-accent ${className}`}
      />
      {hint ? <span className="px-1 text-xs text-muted">{hint}</span> : null}
    </label>
  );
}
