import type { ReactNode } from "react";

// Mini-rendu du sous-ensemble de mise en forme autorisé par le system prompt
// de l'assistant : paragraphes, listes « - », **gras**, `code`. Aucune
// dépendance markdown.
function renderInline(text: string): ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
      return (
        <strong key={i} className="font-semibold text-ink">
          {part.slice(2, -2)}
        </strong>
      );
    }
    if (part.startsWith("`") && part.endsWith("`") && part.length > 2) {
      return (
        <code
          key={i}
          className="rounded bg-surface-2 px-1 py-0.5 font-mono text-[0.85em]"
        >
          {part.slice(1, -1)}
        </code>
      );
    }
    return part;
  });
}

export default function RenderText({ text }: { text: string }) {
  const lines = text.split("\n");
  const blocks: ReactNode[] = [];
  let bullets: string[] = [];

  const flushBullets = (key: number) => {
    if (bullets.length === 0) return;
    blocks.push(
      <ul key={`ul-${key}`} className="my-1 space-y-1 pl-4">
        {bullets.map((b, i) => (
          <li key={i} className="list-disc marker:text-muted-2">
            {renderInline(b)}
          </li>
        ))}
      </ul>
    );
    bullets = [];
  };

  lines.forEach((line, i) => {
    const bullet = line.match(/^\s*-\s+(.*)$/);
    if (bullet) {
      bullets.push(bullet[1]);
      return;
    }
    flushBullets(i);
    if (line.trim() === "") return;
    blocks.push(
      <p key={`p-${i}`} className="whitespace-pre-wrap">
        {renderInline(line)}
      </p>
    );
  });
  flushBullets(lines.length);

  return <div className="space-y-2">{blocks}</div>;
}
