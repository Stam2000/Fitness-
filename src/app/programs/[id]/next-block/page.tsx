import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getSettings } from "@/lib/settings";
import { getCompletedCycles } from "@/lib/progress";
import { requireUser } from "@/lib/session";
import NextBlockFlow from "@/components/NextBlockFlow";

export const dynamic = "force-dynamic";

export default async function NextBlockPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireUser();
  const [program, settings, completedCycles] = await Promise.all([
    prisma.program.findFirst({
      where: { id, userId: user.id },
      select: {
        id: true,
        name: true,
        blockNumber: true,
        blockCycles: true,
        nextProgram: { select: { id: true } },
      },
    }),
    getSettings(),
    getCompletedCycles(id, user.id),
  ]);
  if (!program) notFound();
  // Bloc déjà remplacé : on file directement à son successeur.
  if (program.nextProgram) redirect(`/programs/${program.nextProgram.id}`);

  return (
    <NextBlockFlow
      programId={program.id}
      programName={program.name}
      blockNumber={program.blockNumber}
      blockCycles={program.blockCycles}
      completedCycles={completedCycles}
      hasOpenrouterKey={Boolean(settings.openrouterApiKey)}
    />
  );
}
