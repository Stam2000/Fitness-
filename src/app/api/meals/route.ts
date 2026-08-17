import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { persistMediaBuffer } from "@/lib/media-store";
import { requireApiUser } from "@/lib/session";
import { toMealView } from "@/lib/meals";

const ACCEPTED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
// 6 Mo : le navigateur envoie normalement moins de 300 Ko (photo réduite par
// downscaleImage). La marge couvre un navigateur qui aurait sauté la
// réduction, tout en gardant le base64 (+33 %) sous ce qu'encaissent les
// relais d'OpenRouter à l'analyse.
const MAX_BYTES = 6 * 1024 * 1024;
const MAX_NOTE = 500;

// Téléverse la photo d'un repas et crée la ligne correspondante.
//
// L'analyse n'a délibérément PAS lieu ici : une estimation multimodale prend
// cinq à quinze secondes, trop pour tenir une connexion mobile ouverte. Le
// client enchaîne sur /api/meals/[id]/analyze, qui sert aussi de bouton
// « Relancer ». Une coupure réseau laisse ainsi un repas visible avec sa
// photo, jamais un cliché perdu.
export async function POST(req: NextRequest) {
  const user = await requireApiUser();
  if (user instanceof NextResponse) return user;

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
      { error: "Photo trop lourde (6 Mo maximum)." },
      { status: 400 }
    );
  }

  const eatenAtRaw = form.get("eatenAt");
  const eatenAt =
    typeof eatenAtRaw === "string" &&
    eatenAtRaw &&
    !isNaN(Date.parse(eatenAtRaw))
      ? new Date(eatenAtRaw)
      : new Date();
  const noteRaw = form.get("note");
  const note =
    typeof noteRaw === "string" && noteRaw.trim()
      ? noteRaw.trim().slice(0, MAX_NOTE)
      : null;

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const imageUrl = await persistMediaBuffer(buffer, file.type);
    const meal = await prisma.meal.create({
      data: { imageUrl, eatenAt, note, status: "pending", userId: user.id },
      include: { items: true },
    });
    return NextResponse.json({ meal: toMealView(meal) });
  } catch (e) {
    console.error("meals POST:", e);
    return NextResponse.json(
      { error: "Impossible d'enregistrer la photo. Réessaie." },
      { status: 500 }
    );
  }
}
