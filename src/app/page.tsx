import Link from "next/link";
import {
  Check,
  ChevronRight,
  Dumbbell,
  Flag,
  Play,
  Sparkles,
} from "lucide-react";
import { prisma } from "@/lib/prisma";
import { startSession } from "@/app/actions";
import { requireUser } from "@/lib/session";
import { getSettings } from "@/lib/settings";
import { btn } from "@/components/ui/button";
import MediaThumb from "@/components/ui/MediaThumb";
import MealQuickCapture from "@/components/meals/MealQuickCapture";
import {
  dayRange,
  dayTotals,
  openQuestions,
  toIsoDay,
  toMealView,
} from "@/lib/meals";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const user = await requireUser();
  const todayKey = toIsoDay(new Date());
  const today = dayRange(todayKey);
  const [locations, orphanPrograms, activeSession, todayMeals, goal, settings] =
    await Promise.all([
      prisma.location.findMany({
        where: { userId: user.id },
        orderBy: { createdAt: "asc" },
        include: {
          programs: {
            // Les blocs archivés (remplacés par leur suite) n'encombrent pas
            // l'accueil ; ils restent accessibles depuis leur successeur.
            where: { archivedAt: null },
            orderBy: { createdAt: "desc" },
            include: {
              days: {
                orderBy: { dayIndex: "asc" },
                include: {
                  _count: {
                    select: {
                      exercises: true,
                      sessions: {
                        where: { userId: user.id, completedAt: { not: null } },
                      },
                    },
                  },
                  exercises: {
                    where: { imageUrl: { not: null } },
                    orderBy: { order: "asc" },
                    select: { imageUrl: true },
                    take: 2,
                  },
                },
              },
            },
          },
        },
      }),
      prisma.program.findMany({
        where: { locationId: null, archivedAt: null, userId: user.id },
        orderBy: { createdAt: "desc" },
        include: {
          days: {
            orderBy: { dayIndex: "asc" },
            include: {
              _count: {
                select: {
                  exercises: true,
                  sessions: {
                    where: { userId: user.id, completedAt: { not: null } },
                  },
                },
              },
              exercises: {
                where: { imageUrl: { not: null } },
                orderBy: { order: "asc" },
                select: { imageUrl: true },
                take: 2,
              },
            },
          },
        },
      }),
      prisma.workoutSession.findFirst({
        // Une séance dont le jour a disparu (programme supprimé entre-temps)
        // reste dans l'historique mais ne se reprend plus.
        where: { userId: user.id, completedAt: null, dayId: { not: null } },
        orderBy: { startedAt: "desc" },
        include: {
          day: {
            include: {
              program: true,
              exercises: {
                orderBy: { order: "asc" },
                select: { sets: true, imageUrl: true },
              },
            },
          },
          setLogs: { where: { done: true }, select: { id: true } },
        },
      }),
      prisma.meal.findMany({
        where: {
          userId: user.id,
          eatenAt: { gte: today.start, lt: today.end },
        },
        orderBy: { eatenAt: "asc" },
        include: { items: { orderBy: { order: "asc" } } },
      }),
      prisma.nutritionGoal.findUnique({ where: { userId: user.id } }),
      getSettings(),
    ]);

  const mealViews = todayMeals.map(toMealView);
  const mealTotalsToday = dayTotals(mealViews);
  const openQuestionCount = mealViews.reduce(
    (n, m) => n + openQuestions(m.items).length,
    0
  );

  const groups = [
    ...locations
      .filter((l) => l.programs.length > 0)
      .map((l) => ({
        key: l.id,
        label: `${l.icon ?? ""} ${l.name}`.trim(),
        programs: l.programs,
      })),
    ...(orphanPrograms.length > 0
      ? [{ key: "none", label: "Sans contexte", programs: orphanPrograms }]
      : []),
  ];
  const hasPrograms = groups.length > 0;

  const activeDay = activeSession?.day ?? null;
  const sessionTotalSets = activeDay
    ? activeDay.exercises.reduce((sum, e) => sum + e.sets, 0)
    : 0;
  const sessionDoneSets = activeSession ? activeSession.setLogs.length : 0;
  const sessionImage =
    activeDay?.exercises.find((e) => e.imageUrl)?.imageUrl ?? null;

  return (
    <main className="flex flex-col gap-5">
      <header className="pt-2">
        <h1 className="text-2xl font-extrabold italic tracking-tight">
          Mon Coach Fitness
        </h1>
        <p className="text-sm text-muted-2">
          Tes programmes, adaptés à ton équipement.
        </p>
      </header>

      {activeSession && activeDay && (
        <Link
          href={`/workout/${activeSession.id}`}
          className="relative block overflow-hidden rounded-2xl border-[1.5px] border-accent/50"
        >
          <MediaThumb
            url={sessionImage}
            alt=""
            className="absolute inset-0 h-full w-full"
            iconSize={44}
          />
          <div className="absolute inset-0 bg-gradient-to-r from-bg/95 via-bg/75 to-bg/30" />
          <div className="relative flex items-center gap-3 p-4">
            <div className="min-w-0 flex-1">
              <p className="overline-label text-accent">
                Séance en cours{sessionTotalSets > 0 && (
                  <span className="font-mono">
                    {" "}· {sessionDoneSets}/{sessionTotalSets}{" "}
                    <Check size={11} strokeWidth={3} className="inline" />
                  </span>
                )}
              </p>
              <p className="mt-1 truncate text-[16.5px] font-extrabold italic">
                {activeDay.program.name} — {activeDay.name}
              </p>
            </div>
            <span className={btn("primary", "md", "shrink-0")}>
              <Play size={17} fill="currentColor" /> Reprendre
            </span>
          </div>
        </Link>
      )}

      {/* Suivi calorique : la fonctionnalité la plus fréquente de la journée,
          donc à portée d'un seul appui depuis l'accueil. */}
      <MealQuickCapture
        dayKey={todayKey}
        totals={mealTotalsToday}
        targetKcal={goal?.dailyCalories ?? null}
        targetProteinG={goal?.dailyProteinG ?? null}
        mealCount={mealViews.length}
        pendingCount={openQuestionCount}
        hasAiKey={Boolean(settings.openrouterApiKey)}
      />

      {!hasPrograms && (
        <div className="card p-6 text-center">
          <Dumbbell size={40} strokeWidth={1.5} className="mx-auto text-muted" />
          <h2 className="mt-3 text-lg font-extrabold italic">Aucun programme</h2>
          <p className="mt-1 text-sm text-muted-2">
            Crée ton premier programme : choisis ton équipement, l&apos;IA
            s&apos;occupe du reste.
          </p>
          <Link href="/programs/new" className={btn("primary", "lg", "mt-4")}>
            <Sparkles size={19} /> Créer
          </Link>
        </div>
      )}

      {groups.map((group) => (
        <section key={group.key} className="flex flex-col gap-3">
          <h2 className="overline-label">{group.label}</h2>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {group.programs.map((program) => {
            const collage = program.days
              .flatMap((d) => d.exercises.map((e) => e.imageUrl))
              .filter((u): u is string => Boolean(u))
              .slice(0, 2);
            // Cycles complets = min des séances terminées par jour ; le bloc
            // est fini quand chaque jour a bouclé blockCycles passages.
            const completedCycles =
              program.days.length > 0
                ? Math.min(...program.days.map((d) => d._count.sessions))
                : 0;
            const blockDone =
              program.blockCycles != null &&
              completedCycles >= program.blockCycles;
            return (
            <div key={program.id} className="card overflow-hidden">
              <Link href={`/programs/${program.id}`} className="block">
                <div className="grid h-[104px] grid-cols-2 gap-px">
                  <MediaThumb
                    url={collage[0] ?? null}
                    alt=""
                    className="h-full w-full"
                  />
                  <MediaThumb
                    url={collage[1] ?? null}
                    alt=""
                    className="h-full w-full"
                  />
                </div>
                <div className="px-4 pt-3.5">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-[17px] font-extrabold italic leading-snug">
                      {program.name}
                    </h3>
                    <ChevronRight size={17} className="shrink-0 text-muted-2" />
                  </div>
                  {program.description && (
                    <p className="mt-1.5 line-clamp-2 text-[13px] leading-relaxed text-muted-2">
                      {program.description}
                    </p>
                  )}
                </div>
              </Link>
              <div className="flex flex-col gap-2 p-4 pt-2.5">
                {blockDone && (
                  <Link
                    href={`/programs/${program.id}/next-block`}
                    className="flex items-center gap-2.5 rounded-2xl border-[1.5px] border-accent/50 bg-accent/10 p-3 text-sm font-bold text-accent"
                  >
                    <Flag size={17} className="shrink-0" />
                    <span className="min-w-0 flex-1">
                      Bloc {program.blockNumber} terminé — générer la suite
                    </span>
                    <ChevronRight size={17} className="shrink-0" />
                  </Link>
                )}
                {program.days.map((day) => (
                  <form
                    key={day.id}
                    action={startSession.bind(null, day.id)}
                    className="flex items-center gap-2.5 rounded-full bg-surface-2 p-2 pl-4"
                  >
                    <p className="min-w-0 flex-1 truncate text-[14.5px] font-bold">
                      {day.name}{" "}
                      <span className="text-[12.5px] font-semibold text-muted-2">
                        · {day._count.exercises} exo
                        {day._count.exercises > 1 ? "s" : ""}
                      </span>
                    </p>
                    <button type="submit" className={btn("primary", "md", "shrink-0")}>
                      <Play size={17} fill="currentColor" /> Démarrer
                    </button>
                  </form>
                ))}
              </div>
            </div>
            );
          })}
          </div>
        </section>
      ))}

      {hasPrograms && (
        <Link
          href="/programs/new"
          className="flex items-center justify-center gap-2 rounded-full border-[1.5px] border-dashed border-[#33404f] p-3.5 text-sm font-semibold text-muted-2"
        >
          <Sparkles size={17} /> Nouveau programme
        </Link>
      )}
    </main>
  );
}
