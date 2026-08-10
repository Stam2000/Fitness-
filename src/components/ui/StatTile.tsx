import type { ReactNode } from "react";

type StatTileProps = {
  value: ReactNode;
  label: ReactNode;
  hint?: ReactNode;
  size?: "md" | "lg";
};

/** Tuile statistique : grande valeur mono lime + libellé. */
export default function StatTile({
  value,
  label,
  hint,
  size = "md",
}: StatTileProps) {
  return (
    <div className={`card text-center ${size === "lg" ? "px-3 py-4" : "px-2 py-3"}`}>
      <p
        className={`font-mono font-bold text-accent ${
          size === "lg" ? "text-3xl" : "text-[22px]"
        }`}
      >
        {value}
      </p>
      <p className="mt-0.5 text-[11px] leading-tight text-muted-2">{label}</p>
      {hint ? <p className="mt-px text-[10px] text-muted">{hint}</p> : null}
    </div>
  );
}
