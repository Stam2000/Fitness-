import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { deleteLocalMedia } from "@/lib/media-store";
import { requireApiUser } from "@/lib/session";

// Supprime une vidéo de mouvement : la ligne, le fichier local, et le
// fichier partiel laissé par un téléchargement interrompu le cas échéant.
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await requireApiUser();
  if (user instanceof NextResponse) return user;
  const { id } = await params;
  const video = await prisma.movementVideo
    .delete({ where: { id } })
    .catch(() => null);
  if (!video) {
    return NextResponse.json({ error: "Vidéo introuvable" }, { status: 404 });
  }
  await deleteLocalMedia(`/api/media/yt-${id}.mp4`);
  await deleteLocalMedia(`/api/media/yt-${id}.mp4.part`);
  return NextResponse.json({ ok: true });
}
