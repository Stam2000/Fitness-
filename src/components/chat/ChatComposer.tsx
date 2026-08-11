"use client";

import { useRef, useState } from "react";
import { ArrowUp } from "lucide-react";
import IconButton from "@/components/ui/IconButton";

type ChatComposerProps = {
  disabled: boolean;
  onSend: (text: string) => void;
};

export default function ChatComposer({ disabled, onSend }: ChatComposerProps) {
  const [value, setValue] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const send = () => {
    const text = value.trim();
    if (!text || disabled) return;
    onSend(text);
    setValue("");
    const el = textareaRef.current;
    if (el) el.style.height = "auto";
  };

  return (
    <div className="border-t border-card-border p-3">
      <div className="flex items-end gap-2 rounded-2xl border-[1.5px] border-border bg-surface-2 p-2 transition-colors focus-within:border-accent/60">
        <textarea
          ref={textareaRef}
          value={value}
          rows={1}
          placeholder="Demande au coach…"
          className="max-h-40 flex-1 resize-none bg-transparent px-2 py-1.5 text-sm outline-none placeholder:text-muted-2"
          onChange={(e) => {
            setValue(e.target.value);
            // Auto-agrandissement borné par max-h.
            e.target.style.height = "auto";
            e.target.style.height = `${e.target.scrollHeight}px`;
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
        />
        <IconButton
          aria-label="Envoyer"
          variant="solid"
          size="sm"
          disabled={disabled || value.trim() === ""}
          onClick={send}
        >
          <ArrowUp size={16} />
        </IconButton>
      </div>
    </div>
  );
}
