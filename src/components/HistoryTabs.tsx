"use client";

import { useState, type ReactNode } from "react";

const TABS = [
  { key: "activity", label: "🗓️ Activité" },
  { key: "sessions", label: "Séances" },
  { key: "progress", label: "📈 Progression" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

export default function HistoryTabs({
  activity,
  sessions,
  progress,
}: {
  activity: ReactNode;
  sessions: ReactNode;
  progress: ReactNode;
}) {
  const [tab, setTab] = useState<TabKey>("activity");
  const content = { activity, sessions, progress }[tab];
  return (
    <div className="flex flex-col gap-4">
      <div className="flex rounded-xl border border-border bg-surface p-1">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex-1 rounded-lg py-2.5 text-xs font-semibold ${
              tab === t.key ? "bg-accent text-black" : "text-muted"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      {content}
    </div>
  );
}
