"use client";

import { useState, type ReactNode } from "react";

export default function HistoryTabs({
  sessions,
  progress,
}: {
  sessions: ReactNode;
  progress: ReactNode;
}) {
  const [tab, setTab] = useState<"sessions" | "progress">("sessions");
  return (
    <div className="flex flex-col gap-4">
      <div className="flex rounded-xl border border-border bg-surface p-1">
        <button
          onClick={() => setTab("sessions")}
          className={`flex-1 rounded-lg py-2.5 text-sm font-semibold ${
            tab === "sessions" ? "bg-accent text-black" : "text-muted"
          }`}
        >
          Séances
        </button>
        <button
          onClick={() => setTab("progress")}
          className={`flex-1 rounded-lg py-2.5 text-sm font-semibold ${
            tab === "progress" ? "bg-accent text-black" : "text-muted"
          }`}
        >
          📈 Progression
        </button>
      </div>
      {tab === "sessions" ? sessions : progress}
    </div>
  );
}
