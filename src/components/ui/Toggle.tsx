"use client";

type ToggleProps = {
  checked: boolean;
  onChange: (checked: boolean) => void;
  "aria-label"?: string;
};

/** Interrupteur style iOS : 46×26, lime quand actif. */
export default function Toggle({ checked, onChange, ...rest }: ToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative h-[26px] w-[46px] flex-shrink-0 rounded-full transition-colors ${
        checked ? "bg-accent" : "border border-border bg-surface-2"
      }`}
      {...rest}
    >
      <span
        className={`absolute left-[3px] top-[3px] h-5 w-5 rounded-full bg-black transition-transform ${
          checked ? "translate-x-5" : "translate-x-0"
        }`}
      />
    </button>
  );
}
