import { prisma } from "@/lib/prisma";
import { getExerciseProgress } from "@/lib/progress";
import { getActivityStats } from "@/lib/activity";
import HistoryTabs from "@/components/HistoryTabs";
import ProgressCharts from "@/components/ProgressCharts";
import ActivityCalendar from "@/components/ActivityCalendar";

export const dynamic = "force-dynamic";

function formatDate(d: Date) {
  return new Intl.DateTimeFormat("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
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
        <div className="rounded-2xl border border-border bg-surface p-6 text-center md:col-span-2">
          <p className="text-4xl">📈</p>
          <p className="mt-3 text-sm text-muted">
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
          <details
            key={session.id}
            className="rounded-2xl border border-border bg-surface"
          >
            <summary className="cursor-pointer list-none p-4">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate font-semibold">
                    {session.day.program.name} — {session.day.name}
                  </p>
                  <p className="mt-0.5 text-xs text-muted">
                    {session.completedAt ? formatDate(session.completedAt) : ""}
                  </p>
                </div>
                <div className="shrink-0 text-right text-xs text-muted">
                  <p className="text-sm font-semibold text-accent">
                    {doneLogs.length} série{doneLogs.length > 1 ? "s" : ""}
                  </p>
                  {volume > 0 && <p>{Math.round(volume)} kg de volume</p>}
                  {durationMin && <p>{durationMin} min</p>}
                </div>
              </div>
            </summary>
            <div className="flex flex-col gap-2 border-t border-border p-4">
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
                <div className="mt-1 rounded-xl bg-surface-2 p-3">
                  <p className="text-xs font-semibold text-accent">
                    🤖 Analyse du coach
                  </p>
                  <p className="mt-1 whitespace-pre-line text-xs text-muted">
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
        <h1 className="text-2xl font-bold">Mon suivi</h1>
        <p className="text-sm text-muted">
          {sessions.length} séance{sessions.length > 1 ? "s" : ""} terminée
          {sessions.length > 1 ? "s" : ""}
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
