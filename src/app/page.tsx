import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { startSession } from "@/app/actions";
import { btn } from "@/components/ui/button";
import MediaThumb from "@/components/ui/MediaThumb";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const [locations, orphanPrograms, activeSession] = await Promise.all([
    prisma.location.findMany({
      orderBy: { createdAt: "asc" },
      include: {
        programs: {
          orderBy: { createdAt: "desc" },
          include: {
            days: {
              orderBy: { dayIndex: "asc" },
              include: {
                _count: { select: { exercises: true } },
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
      where: { locationId: null },
      orderBy: { createdAt: "desc" },
      include: {
        days: {
          orderBy: { dayIndex: "asc" },
          include: {
            _count: { select: { exercises: true } },
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
      where: { completedAt: null },
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
  ]);

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

  const sessionTotalSets = activeSession
    ? activeSession.day.exercises.reduce((sum, e) => sum + e.sets, 0)
    : 0;
  const sessionDoneSets = activeSession ? activeSession.setLogs.length : 0;
  const sessionImage = activeSession
    ? (activeSession.day.exercises.find((e) => e.imageUrl)?.imageUrl ?? null)
    : null;

  return (
    <main className="flex flex-col gap-5">
      <header className="pt-2">
        <h1 className="text-2xl font-extrabold italic tracking-tight">
          Mon Coach Fitness 💪
        </h1>
        <p className="text-sm text-muted-2">
          Tes programmes, adaptés à ton équipement.
        </p>
      </header>

      {activeSession && (
        <Link
          href={`/workout/${activeSession.id}`}
          className="relative block overflow-hidden rounded-2xl border-[1.5px] border-accent/50"
        >
          <MediaThumb
            url={sessionImage}
            alt=""
            emoji="🏋️"
            className="absolute inset-0 h-full w-full"
            emojiClassName="text-5xl opacity-40"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-bg/95 via-bg/75 to-bg/30" />
          <div className="relative flex items-center gap-3 p-4">
            <div className="min-w-0 flex-1">
              <p className="overline-label text-accent">
                Séance en cours{sessionTotalSets > 0 && (
                  <span className="font-mono">
                    {" "}· {sessionDoneSets}/{sessionTotalSets} ✓
                  </span>
                )}
              </p>
              <p className="mt-1 truncate text-[16.5px] font-extrabold italic">
                {activeSession.day.program.name} — {activeSession.day.name}
              </p>
            </div>
            <span className={btn("primary", "md", "shrink-0")}>Reprendre →</span>
          </div>
        </Link>
      )}

      {!hasPrograms && (
        <div className="card p-6 text-center">
          <p className="text-4xl">🏋️</p>
          <h2 className="mt-3 text-lg font-extrabold italic">Aucun programme</h2>
          <p className="mt-1 text-sm text-muted-2">
            Crée ton premier programme : choisis ton équipement, l&apos;IA
            s&apos;occupe du reste.
          </p>
          <Link href="/programs/new" className={btn("primary", "lg", "mt-4")}>
            ✨ Créer un programme
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
            return (
            <div key={program.id} className="card overflow-hidden">
              <Link href={`/programs/${program.id}`} className="block">
                <div className="grid h-[104px] grid-cols-2 gap-px">
                  <MediaThumb
                    url={collage[0] ?? null}
                    alt=""
                    emoji="💪"
                    className="h-full w-full"
                    emojiClassName="text-3xl opacity-50"
                  />
                  <MediaThumb
                    url={collage[1] ?? null}
                    alt=""
                    emoji="🏋️"
                    className="h-full w-full"
                    emojiClassName="text-3xl opacity-50"
                  />
                </div>
                <div className="px-4 pt-3.5">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-[17px] font-extrabold italic leading-snug">
                      {program.name}
                    </h3>
                    <span className="text-muted-2">›</span>
                  </div>
                  {program.description && (
                    <p className="mt-1.5 line-clamp-2 text-[13px] leading-relaxed text-muted-2">
                      {program.description}
                    </p>
                  )}
                </div>
              </Link>
              <div className="flex flex-col gap-2 p-4 pt-2.5">
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
                      Démarrer
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
          className="rounded-full border-[1.5px] border-dashed border-[#33404f] p-3.5 text-center text-sm font-semibold text-muted-2"
        >
          ✨ Créer un nouveau programme
        </Link>
      )}
    </main>
  );
}
