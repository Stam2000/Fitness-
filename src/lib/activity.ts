import { prisma } from "@/lib/prisma";

export type ActivityDay = {
  date: string; // AAAA-MM-JJ (heure locale du serveur)
  sessions: number;
  minutes: number;
  volume: number;
  labels: string[]; // « Programme — Jour »
};

export type ActivityStats = {
  days: ActivityDay[];
  totalSessions: number;
  totalMinutes: number;
  totalVolume: number;
  currentStreakWeeks: number;
  bestStreakWeeks: number;
  thisWeekSessions: number;
  daysSinceLast: number | null;
  weeklyCounts: { weekStart: string; count: number }[];
  focusBreakdown: { label: string; count: number }[];
};

export function dateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

// Semaine commençant le lundi.
export function startOfWeek(d: Date): Date {
  const copy = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const offset = (copy.getDay() + 6) % 7;
  copy.setDate(copy.getDate() - offset);
  return copy;
}

function addWeeks(d: Date, n: number): Date {
  const copy = new Date(d);
  copy.setDate(copy.getDate() + n * 7);
  return copy;
}

export async function getActivityStats(userId: string): Promise<ActivityStats> {
  const sessions = await prisma.workoutSession.findMany({
    where: { userId, completedAt: { not: null } },
    orderBy: { completedAt: "asc" },
    include: {
      setLogs: { where: { done: true } },
      day: { include: { program: { select: { name: true } } } },
    },
  });

  const byDay = new Map<string, ActivityDay>();
  const weekSet = new Set<string>();
  const focusCount = new Map<string, number>();
  let totalMinutes = 0;
  let totalVolume = 0;

  for (const session of sessions) {
    const end = session.completedAt!;
    const key = dateKey(end);
    const minutes = Math.max(
      1,
      Math.round((end.getTime() - session.startedAt.getTime()) / 60000)
    );
    const volume = session.setLogs.reduce(
      (acc, l) => acc + (l.weightKg ?? 0) * (l.reps ?? 0),
      0
    );
    totalMinutes += minutes;
    totalVolume += volume;

    const entry = byDay.get(key) ?? {
      date: key,
      sessions: 0,
      minutes: 0,
      volume: 0,
      labels: [],
    };
    entry.sessions += 1;
    entry.minutes += minutes;
    entry.volume += volume;
    entry.labels.push(`${session.day.program.name} — ${session.day.name}`);
    byDay.set(key, entry);

    weekSet.add(dateKey(startOfWeek(end)));

    const focus = session.day.focus?.trim() || session.day.name;
    focusCount.set(focus, (focusCount.get(focus) ?? 0) + 1);
  }

  const now = new Date();
  const thisWeekStart = startOfWeek(now);
  const thisWeekKey = dateKey(thisWeekStart);

  // Streak en semaines consécutives : la semaine en cours ne casse pas la
  // série tant qu'elle n'est pas terminée.
  let currentStreakWeeks = 0;
  let cursor = weekSet.has(thisWeekKey)
    ? thisWeekStart
    : addWeeks(thisWeekStart, -1);
  while (weekSet.has(dateKey(cursor))) {
    currentStreakWeeks += 1;
    cursor = addWeeks(cursor, -1);
  }

  const sortedWeeks = [...weekSet].sort();
  let bestStreakWeeks = 0;
  let run = 0;
  let previous: Date | null = null;
  for (const wk of sortedWeeks) {
    const [y, m, d] = wk.split("-").map(Number);
    const current = new Date(y, m - 1, d);
    run =
      previous && dateKey(addWeeks(previous, 1)) === wk ? run + 1 : 1;
    bestStreakWeeks = Math.max(bestStreakWeeks, run);
    previous = current;
  }

  const weeklyCounts: { weekStart: string; count: number }[] = [];
  for (let i = 11; i >= 0; i--) {
    const ws = addWeeks(thisWeekStart, -i);
    const key = dateKey(ws);
    const count = [...byDay.values()].filter((day) => {
      const [y, m, d] = day.date.split("-").map(Number);
      return dateKey(startOfWeek(new Date(y, m - 1, d))) === key;
    }).reduce((acc, day) => acc + day.sessions, 0);
    weeklyCounts.push({ weekStart: key, count });
  }

  const lastSession = sessions[sessions.length - 1];
  const daysSinceLast = lastSession
    ? Math.floor(
        (new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime() -
          new Date(
            lastSession.completedAt!.getFullYear(),
            lastSession.completedAt!.getMonth(),
            lastSession.completedAt!.getDate()
          ).getTime()) /
          86400000
      )
    : null;

  return {
    days: [...byDay.values()].sort((a, b) => a.date.localeCompare(b.date)),
    totalSessions: sessions.length,
    totalMinutes,
    totalVolume,
    currentStreakWeeks,
    bestStreakWeeks,
    thisWeekSessions: weeklyCounts[weeklyCounts.length - 1]?.count ?? 0,
    daysSinceLast,
    weeklyCounts,
    focusBreakdown: [...focusCount.entries()]
      .map(([label, count]) => ({ label, count }))
      .sort((a, b) => b.count - a.count),
  };
}
