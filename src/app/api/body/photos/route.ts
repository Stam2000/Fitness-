import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { persistMediaBuffer } from "@/lib/media-store";

const ACCEPTED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_BYTES = 20 * 1024 * 1024; // 20 Mo — photos de téléphone récentes

// Ajoute une photo de suivi physique : fichier écrit dans le volume média
// local, ligne ProgressPhoto créée avec la date choisie.
export async function POST(req: NextRequest) {
  const form = await req.formData().catch(() => null);
  const file = form?.get("photo");
  if (!form || !(file instanceof File)) {
    return NextResponse.json({ error: "Photo manquante" }, { status: 400 });
  }
  if (!ACCEPTED_TYPES.has(file.type)) {
    return NextResponse.json(
      { error: "Format non pris en charge (JPEG, PNG ou WebP)." },
      { status: 400 }
    );
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: "Photo trop lourde (20 Mo maximum)." },
      { status: 400 }
    );
  }

  const dateRaw = form.get("date");
  const date =
    typeof dateRaw === "string" && dateRaw && !isNaN(Date.parse(dateRaw))
      ? new Date(dateRaw)
      : new Date();
  const noteRaw = form.get("note");
  const note =
    typeof noteRaw === "string" && noteRaw.trim()
      ? noteRaw.trim().slice(0, 300)
      : null;

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const imageUrl = await persistMediaBuffer(buffer, file.type);
    const photo = await prisma.progressPhoto.create({
      data: { imageUrl, date, note },
    });
    return NextResponse.json({ photo });
  } catch (e) {
    console.error("body photo POST:", e);
    return NextResponse.json(
      { error: "Impossible d'enregistrer la photo. Réessaie." },
      { status: 500 }
    );
  }
}
