import { Bot, ChevronDown, ClipboardList, Footprints, History, Shuffle, Timer, TrendingUp } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { getExerciseProgress } from "@/lib/progress";
import { getActivityStats } from "@/lib/activity";
import { formatDistance, formatDuration } from "@/lib/cardio";
import {
  describeSessionPlan,
  sessionPlanExercises,
} from "@/lib/program-versions";
import HistoryTabs from "@/components/HistoryTabs";
import ProgressCharts from "@/components/ProgressCharts";
import ActivityCalendar from "@/components/ActivityCalendar";
import SessionLogEditor from "@/components/SessionLogEditor";

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
  const user = await requireUser();
  const [sessions, progress, activity, cardio] = await Promise.all([
    // Le jour n'est chargé qu'en repli : ce qui est affiché vient du plan figé
    // de la séance (`planSnapshot`). C'est toute la différence — modifier un
    // programme ne réécrit plus les séances déjà enregistrées.
    prisma.workoutSession.findMany({
      where: { userId: user.id, completedAt: { not: null } },
      orderBy: { completedAt: "desc" },
      take: 50,
      include: {
        setLogs: { orderBy: { setIndex: "asc" } },
        programVersion: { select: { versionNumber: true } },
        day: {
          include: {
            program: true,
            exercises: { orderBy: { order: "asc" } },
          },
        },
      },
    }),
    getExerciseProgress(user.id),
    getActivityStats(user.id),
    prisma.cardioSession.findMany({
      where: { userId: user.id },
      orderBy: { performedAt: "desc" },
      take: 50,
    }),
  ]);

  const sessionList = (
    <div className="grid gap-3 md:grid-cols-2 md:items-start">
      {sessions.length === 0 && cardio.length === 0 && (
        <div className="card p-6 text-center md:col-span-2">
          <TrendingUp size={40} strokeWidth={1.5} className="mx-auto text-muted" />
          <p className="mt-3 text-sm text-muted-2">
            Aucune séance terminée pour l&apos;instant. Lance ta première
            séance depuis l&apos;accueil !
          </p>
        </div>
      )}

      {cardio.map((c) => (
        <div key={c.id} className="card p-4">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="flex items-center gap-1.5 truncate font-extrabold">
                <Footprints size={15} className="text-accent" /> Tapis de course
              </p>
              <p className="mt-0.5 text-[12px] text-muted-2">
                {formatDate(c.performedAt)}
              </p>
              <p className="mt-1 text-[13px] text-muted-2">
                {c.speedKmh} km/h
                {c.inclinePct > 0 ? ` · pente ${c.inclinePct} %` : ""} ·{" "}
                {formatDuration(c.minutes)} · {formatDistance(c.distanceKm)}
                {c.steps != null &&
                  ` · ${c.steps.toLocaleString("fr-FR")} pas`}
              </p>
            </div>
            <p className="shrink-0 font-mono text-[15px] font-bold text-accent">
              {c.calories} kcal
            </p>
          </div>
        </div>
      ))}

      {sessions.map((session) => {
        const plan = describeSessionPlan(session);
        const planExercises = sessionPlanExercises(session);
        const doneLogs = session.setLogs.filter((l) => l.done);
        // Une série peut porter sur un exercice absent du plan figé (retiré du
        // programme pendant la séance). Elle reste affichée, sous le nom
        // qu'elle a conservé — c'est à cela que sert `exerciseName`.
        const planIds = new Set(planExercises.map((e) => e.id));
        const loggedExercises = [
          ...planExercises.map((e) => ({
            id: e.id,
            name: e.name,
            sets: e.sets,
          })),
          ...session.setLogs
            .filter((l) => !planIds.has(l.exerciseId))
            .filter(
              (l, i, all) =>
                all.findIndex((o) => o.exerciseId === l.exerciseId) === i
            )
            .map((l) => ({ id: l.exerciseId, name: l.exerciseName, sets: 0 })),
        ];
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
                    {plan.programName} — {plan.dayName}
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
                    {session.programVersion && (
                      <span className="ml-1.5 inline-flex items-baseline gap-1 text-muted">
                        <History size={11} className="self-center" />v
                        {session.programVersion.versionNumber}
                      </span>
                    )}
                  </p>
                </div>
                <ChevronDown size={17} className="shrink-0 text-muted-2" />
              </div>
            </summary>
            <div className="flex flex-col gap-2 border-t border-card-border p-4">
              {loggedExercises.flatMap((ex) => {
                const exLogs = session.setLogs.filter(
                  (l) => l.exerciseId === ex.id
                );
                if (exLogs.length === 0) return [];
                // Temps passé sur cet exercice (chrono automatique en séance).
                const exSecondsMap =
                  session.exerciseSeconds &&
                  typeof session.exerciseSeconds === "object" &&
                  !Array.isArray(session.exerciseSeconds)
                    ? (session.exerciseSeconds as Record<string, number>)
                    : {};
                const exSeconds = exSecondsMap[ex.id];
                // Les séries sont affichées sous le mouvement réellement
                // exécuté (variante ou exercice de base).
                const byMove = new Map<string, typeof exLogs>();
                for (const l of exLogs) {
                  const move = l.variationName ?? ex.name;
                  if (!byMove.has(move)) byMove.set(move, []);
                  byMove.get(move)!.push(l);
                }
                return Array.from(byMove, ([move, moveLogs], mi) => (
                  <div key={`${ex.id}:${move}`}>
                    <p className="text-sm font-medium">
                      {move}
                      {move !== ex.name && (
                        <span className="ml-1.5 inline-flex items-baseline gap-1 text-xs text-muted">
                          <Shuffle size={11} className="self-center" /> variante
                        </span>
                      )}
                      {mi === 0 && exSeconds != null && exSeconds > 0 && (
                        <span className="ml-1.5 inline-flex items-baseline gap-1 font-mono text-xs text-muted">
                          <Timer size={11} className="self-center" />
                          {Math.floor(exSeconds / 60)}:
                          {String(exSeconds % 60).padStart(2, "0")}
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
              {/* Correction après coup : charge ou répétitions mal saisies,
                  série oubliée ou enregistrée en double. */}
              <SessionLogEditor
                sessionId={session.id}
                label={`${plan.programName} — ${plan.dayName}${
                  session.completedAt ? ` · ${formatDate(session.completedAt)}` : ""
                }`}
                exercises={loggedExercises.map((ex) => {
                  const exLogs = session.setLogs.filter(
                    (l) => l.exerciseId === ex.id
                  );
                  // Les séries prescrites sans log apparaissent quand même :
                  // c'est ainsi qu'on rattrape une série oubliée.
                  const maxIndex = Math.max(
                    ex.sets - 1,
                    ...exLogs.map((l) => l.setIndex)
                  );
                  return {
                    id: ex.id,
                    name: ex.name,
                    sets: Array.from({ length: maxIndex + 1 }, (_, i) => {
                      const log = exLogs.find((l) => l.setIndex === i);
                      return {
                        setIndex: i,
                        reps: log?.reps ?? null,
                        weightKg: log?.weightKg ?? null,
                        done: log?.done ?? false,
                        variationName: log?.variationName ?? null,
                      };
                    }),
                  };
                })}
              />

              {/* Le plan tel qu'il était ce jour-là, exercices non joués
                  compris : c'est la mémoire de la séance, indépendante de ce
                  qu'est devenu le programme depuis. */}
              {planExercises.length > 0 && (
                <details className="mt-1 rounded-[14px] bg-surface-2 p-3">
                  <summary className="flex cursor-pointer list-none items-center gap-1.5 text-xs font-extrabold text-muted-2">
                    <ClipboardList size={13} /> Plan prescrit ce jour-là
                    {session.programVersion && (
                      <span className="font-mono font-normal text-muted">
                        v{session.programVersion.versionNumber}
                      </span>
                    )}
                  </summary>
                  <ul className="mt-2 flex flex-col gap-1">
                    {planExercises.map((ex) => (
                      <li
                        key={ex.id}
                        className="flex items-baseline justify-between gap-3 text-xs"
                      >
                        <span className="min-w-0 truncate text-muted-2">
                          {ex.name}
                        </span>
                        <span className="shrink-0 font-mono text-muted">
                          {ex.sets} × {ex.reps} · {ex.restSeconds} s
                        </span>
                      </li>
                    ))}
                  </ul>
                </details>
              )}

              {session.aiFeedback && (
                <div className="mt-1 rounded-[14px] bg-surface-2 p-3">
                  <p className="flex items-center gap-1.5 text-xs font-extrabold text-accent">
                    <Bot size={13} /> Analyse du coach
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
          Suivi
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
