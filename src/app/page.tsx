import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { startSession } from "@/app/actions";

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
              include: { _count: { select: { exercises: true } } },
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
          include: { _count: { select: { exercises: true } } },
        },
      },
    }),
    prisma.workoutSession.findFirst({
      where: { completedAt: null },
      orderBy: { startedAt: "desc" },
      include: { day: { include: { program: true } } },
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

  return (
    <main className="flex flex-col gap-5">
      <header className="pt-2">
        <h1 className="text-2xl font-bold">Mon Coach Fitness 💪</h1>
        <p className="text-sm text-muted">
          Tes programmes, adaptés à ton équipement.
        </p>
      </header>

      {activeSession && (
        <Link
          href={`/workout/${activeSession.id}`}
          className="block rounded-2xl border border-accent/40 bg-accent/10 p-4"
        >
          <p className="text-xs font-semibold uppercase tracking-wide text-accent">
            Séance en cours
          </p>
          <p className="mt-1 font-semibold">
            {activeSession.day.program.name} — {activeSession.day.name}
          </p>
          <p className="mt-1 text-sm text-muted">Appuie pour reprendre →</p>
        </Link>
      )}

      {!hasPrograms && (
        <div className="rounded-2xl border border-border bg-surface p-6 text-center">
          <p className="text-4xl">🏋️</p>
          <h2 className="mt-3 text-lg font-semibold">Aucun programme</h2>
          <p className="mt-1 text-sm text-muted">
            Crée ton premier programme : choisis ton équipement, l&apos;IA
            s&apos;occupe du reste.
          </p>
          <Link
            href="/programs/new"
            className="mt-4 inline-block rounded-xl bg-accent px-5 py-3 font-semibold text-black"
          >
            ✨ Créer un programme
          </Link>
        </div>
      )}

      {groups.map((group) => (
        <section key={group.key} className="flex flex-col gap-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">
            {group.label}
          </h2>
          {group.programs.map((program) => (
            <div
              key={program.id}
              className="rounded-2xl border border-border bg-surface p-4"
            >
              <Link href={`/programs/${program.id}`} className="block">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="font-semibold">{program.name}</h3>
                  <span className="text-muted">›</span>
                </div>
                {program.description && (
                  <p className="mt-1 line-clamp-2 text-sm text-muted">
                    {program.description}
                  </p>
                )}
              </Link>
              <div className="mt-3 flex flex-col gap-2">
                {program.days.map((day) => (
                  <form
                    key={day.id}
                    action={startSession.bind(null, day.id)}
                    className="flex items-center justify-between gap-2 rounded-xl bg-surface-2 p-2 pl-3"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{day.name}</p>
                      <p className="text-xs text-muted">
                        {day._count.exercises} exercice
                        {day._count.exercises > 1 ? "s" : ""}
                      </p>
                    </div>
                    <button
                      type="submit"
                      className="shrink-0 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-black"
                    >
                      Démarrer
                    </button>
                  </form>
                ))}
              </div>
            </div>
          ))}
        </section>
      ))}

      {hasPrograms && (
        <Link
          href="/programs/new"
          className="rounded-xl border border-dashed border-border p-4 text-center text-sm font-medium text-muted"
        >
          ✨ Créer un nouveau programme
        </Link>
      )}
    </main>
  );
}
