"use client";

import { useState, type ReactNode } from "react";
import { CalendarDays, Dumbbell, TrendingUp } from "lucide-react";

const TABS = [
  { key: "activity", label: "Activité", icon: CalendarDays },
  { key: "sessions", label: "Séances", icon: Dumbbell },
  { key: "progress", label: "Progression", icon: TrendingUp },
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
      <div className="flex gap-0.5 rounded-full border border-card-border bg-surface p-1">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-full py-2.5 text-[12.5px] ${
              tab === t.key
                ? "bg-accent font-extrabold text-black"
                : "font-semibold text-muted-2"
            }`}
          >
            <t.icon size={14} /> {t.label}
          </button>
        ))}
      </div>
      {content}
    </div>
  );
}
