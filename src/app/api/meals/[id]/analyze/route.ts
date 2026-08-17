import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { readLocalMedia } from "@/lib/media-store";
import { requireApiUser } from "@/lib/session";
import { getSettings } from "@/lib/settings";
import { AiError } from "@/lib/openrouter";
import { analyzeMealImage } from "@/lib/meal-analysis";
import { toMealView } from "@/lib/meals";

// Estime le contenu d'un repas déjà téléversé. Sert aussi bien à la première
// analyse qu'au bouton « Relancer » — même chemin, donc même comportement.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await requireApiUser();
  if (user instanceof NextResponse) return user;
  const { id } = await params;

  // Repas d'un autre compte : 404, jamais 403 (convention du dépôt).
  const meal = await prisma.meal.findFirst({
    where: { id, userId: user.id },
  });
  if (!meal) {
    return NextResponse.json({ error: "Repas introuvable" }, { status: 404 });
  }

  const settings = await getSettings();
  if (!settings.openrouterApiKey) {
    return NextResponse.json(
      { error: "Aucune clé OpenRouter configurée (Réglages)." },
      { status: 400 }
    );
  }
  if (!meal.imageUrl) {
    return NextResponse.json(
      { error: "Ce repas n'a pas de photo à analyser." },
      { status: 400 }
    );
  }
  const media = await readLocalMedia(meal.imageUrl);
  if (!media) {
    return NextResponse.json(
      { error: "Photo introuvable sur le serveur." },
      { status: 400 }
    );
  }

  try {
    const analysis = await analyzeMealImage({
      apiKey: settings.openrouterApiKey,
      model: settings.visionModel,
      imageBase64: media.buffer.toString("base64"),
      contentType: media.contentType,
      note: meal.note,
      eatenAt: meal.eatenAt,
    });

    // Les lignes précédentes sont remplacées, réponses comprises : elles
    // décrivaient une autre estimation, les reporter serait leur prêter un
    // sens qu'elles n'ont plus. L'interface prévient avant de relancer.
    const [, , updated] = await prisma.$transaction([
      prisma.mealItem.deleteMany({ where: { mealId: meal.id } }),
      prisma.mealItem.createMany({
        data: analysis.items.map((item, order) => ({
          mealId: meal.id,
          order,
          name: item.name,
          quantityLabel: item.quantityLabel,
          grams: item.grams,
          kcal: item.kcal,
          proteinG: item.proteinG,
          carbsG: item.carbsG,
          fatG: item.fatG,
          kind: item.kind,
          question: item.question,
          // Une hypothèse ne compte pas tant qu'elle n'a pas reçu de réponse.
          included: item.kind === "detected",
        })),
      }),
      prisma.meal.update({
        where: { id: meal.id },
        data: {
          status: "ready",
          error: null,
          title: analysis.title,
          comment: analysis.comment,
          model: settings.visionModel,
        },
        include: { items: { orderBy: { order: "asc" } } },
      }),
    ]);

    return NextResponse.json({ meal: toMealView(updated) });
  } catch (e) {
    // Jamais de repas laissé en « pending » après une requête terminée :
    // l'écran doit pouvoir proposer une relance et dire pourquoi.
    const aiError = e instanceof AiError;
    if (!aiError) console.error("meal analyze:", e);
    const message = aiError
      ? (e as AiError).userMessage
      : "Analyse impossible pour le moment. Réessaie.";
    await prisma.meal
      .update({
        where: { id: meal.id },
        data: { status: "failed", error: message },
      })
      .catch(() => {});
    return NextResponse.json(
      { error: message },
      { status: aiError ? (e as AiError).status : 502 }
    );
  }
}
