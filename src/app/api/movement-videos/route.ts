import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { normalizeName } from "@/lib/normalize";
import {
  downloadMovementVideo,
  fetchYouTubeTitle,
  parseYouTubeUrl,
} from "@/lib/youtube";

const createSchema = z.object({
  name: z.string().min(1).max(200),
  url: z.string().min(8).max(500),
});

// Liste les vidéos d'un mouvement (par nom, insensible casse/accents).
export async function GET(req: NextRequest) {
  const name = req.nextUrl.searchParams.get("name");
  if (!name?.trim()) {
    return NextResponse.json({ error: "Nom manquant" }, { status: 400 });
  }
  const videos = await prisma.movementVideo.findMany({
    where: { movementKey: normalizeName(name) },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json({ videos });
}

// Ajoute une vidéo YouTube à un mouvement : la ligne est créée tout de suite
// (statut « downloading ») et le téléchargement se poursuit en arrière-plan.
export async function POST(req: NextRequest) {
  const body = createSchema.safeParse(await req.json().catch(() => ({})));
  if (!body.success) {
    return NextResponse.json({ error: "Requête invalide" }, { status: 400 });
  }
  const sourceUrl = parseYouTubeUrl(body.data.url);
  if (!sourceUrl) {
    return NextResponse.json(
      { error: "Lien YouTube non reconnu (watch, youtu.be ou shorts)." },
      { status: 400 }
    );
  }

  const name = body.data.name.trim();
  const title = await fetchYouTubeTitle(sourceUrl);
  const video = await prisma.movementVideo.create({
    data: {
      movementName: name,
      movementKey: normalizeName(name),
      sourceUrl,
      title,
    },
  });
  void downloadMovementVideo(video.id, sourceUrl);
  return NextResponse.json({ video });
}
