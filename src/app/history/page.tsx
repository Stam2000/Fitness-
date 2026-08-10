import { prisma } from "@/lib/prisma";
import { getExerciseProgress } from "@/lib/progress";
import { getActivityStats } from "@/lib/activity";
import HistoryTabs from "@/components/HistoryTabs";
import ProgressCharts from "@/components/ProgressCharts";
import ActivityCalendar from "@/components/ActivityCalendar";

export const dynamic = "force-dynamic";

function formatDate(d: Date) {
  const today = new Date();
  if (d.toDateString() === today.toDateString()) return "Aujourd'hui";
  return new Intl.DateTimeFormat("fr-FR", {
    weekday: "short",
    day: "numeric",
    month: "long",
  }).format(d);
}

export default async function HistoryPage() {
  const [sessions, progress, activity] = await Promise.all([
    prisma.workoutSession.findMany({
      where: { completedAt: { not: null } },
      orderBy: { completedAt: "desc" },
      take: 50,
      include: {
        setLogs: { orderBy: { setIndex: "asc" } },
        day: {
          include: {
            program: true,
            exercises: { orderBy: { order: "asc" } },
          },
        },
      },
    }),
    getExerciseProgress(),
    getActivityStats(),
  ]);

  const sessionList = (
    <div className="grid gap-3 md:grid-cols-2 md:items-start">
      {sessions.length === 0 && (
        <div className="card p-6 text-center md:col-span-2">
          <p className="text-4xl">📈</p>
          <p className="mt-3 text-sm text-muted-2">
            Aucune séance terminée pour l&apos;instant. Lance ta première
            séance depuis l&apos;accueil !
          </p>
        </div>
      )}

      {sessions.map((session) => {
        const doneLogs = session.setLogs.filter((l) => l.done);
        const volume = doneLogs.reduce(
          (acc, l) => acc + (l.weightKg ?? 0) * (l.reps ?? 0),
          0
        );
        const durationMin = session.completedAt
          ? Math.max(
              1,
              Math.round(
                (session.completedAt.getTime() - session.startedAt.getTime()) /
                  60000
              )
            )
          : null;
        return (
          <details key={session.id} className="card">
            <summary className="cursor-pointer list-none p-4">
              <div className="flex items-center gap-3">
                <div className="min-w-0 flex-1">
                  <p className="overline-label text-accent">
                    {session.completedAt ? formatDate(session.completedAt) : ""}
                  </p>
                  <p className="mt-1 truncate text-[15px] font-bold">
                    {session.day.program.name} — {session.day.name}
                  </p>
                  <p className="mt-0.5 font-mono text-[12.5px] text-muted-2">
                    {[
                      `${doneLogs.length} série${doneLogs.length > 1 ? "s" : ""}`,
                      durationMin ? `${durationMin} min` : null,
                      volume > 0
                        ? `${Math.round(volume).toLocaleString("fr-FR")} kg`
                        : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                </div>
                <span className="shrink-0 text-muted-2">›</span>
              </div>
            </summary>
            <div className="flex flex-col gap-2 border-t border-card-border p-4">
              {session.day.exercises.flatMap((ex) => {
                const exLogs = session.setLogs.filter(
                  (l) => l.exerciseId === ex.id
                );
                if (exLogs.length === 0) return [];
                // Les séries sont affichées sous le mouvement réellement
                // exécuté (variante ou exercice de base).
                const byMove = new Map<string, typeof exLogs>();
                for (const l of exLogs) {
                  const move = l.variationName ?? ex.name;
                  if (!byMove.has(move)) byMove.set(move, []);
                  byMove.get(move)!.push(l);
                }
                return Array.from(byMove, ([move, moveLogs]) => (
                  <div key={`${ex.id}:${move}`}>
                    <p className="text-sm font-medium">
                      {move}
                      {move !== ex.name && (
                        <span className="ml-1.5 text-xs text-muted">
                          🔁 variante
                        </span>
                      )}
                    </p>
                    <p className="text-xs text-muted">
                      {moveLogs
                        .map((l) =>
                          l.done
                            ? `${l.weightKg ?? "—"} kg × ${l.reps ?? "—"}`
                            : "passée"
                        )
                        .join(" · ")}
                    </p>
                  </div>
                ));
              })}
              {session.aiFeedback && (
                <div className="mt-1 rounded-[14px] bg-surface-2 p-3">
                  <p className="text-xs font-extrabold text-accent">
                    🤖 Analyse du coach
                  </p>
                  <p className="mt-1 whitespace-pre-line text-xs text-muted-2">
                    {session.aiFeedback}
                  </p>
                </div>
              )}
            </div>
          </details>
        );
      })}
    </div>
  );

  return (
    <main className="flex flex-col gap-4">
      <header className="pt-2">
        <h1 className="text-2xl font-extrabold italic tracking-tight">
          Suivi 🗓️
        </h1>
        <p className="text-sm text-muted-2">
          Ton activité, tes séances, ta progression.
        </p>
      </header>
      <HistoryTabs
        activity={<ActivityCalendar stats={activity} />}
        sessions={sessionList}
        progress={<ProgressCharts exercises={progress} />}
      />
    </main>
  );
}
