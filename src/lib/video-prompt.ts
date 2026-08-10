import { buildExerciseVideoPrompt } from "@/lib/kie";
import type { ResolvedSettings } from "@/lib/settings";

// Génère, via le modèle OpenRouter configuré, un prompt vidéo détaillé qui
// décrit l'exécution correcte du mouvement (position de départ, phases,
// tempo, points techniques, cadrage) pour Seedance. Sans clé OpenRouter ou en
// cas d'erreur, on retombe sur le prompt générique construit localement.
export async function generateExerciseVideoPrompt(
  exercise: { name: string; equipment: string[]; notes: string | null },
  settings: ResolvedSettings
): Promise<string> {
  const fallback = buildExerciseVideoPrompt(exercise.name, exercise.equipment);
  if (!settings.openrouterApiKey) return fallback;

  const userPrompt = `Écris un prompt en ANGLAIS pour un modèle de génération de vidéo IA (Seedance). La vidéo doit montrer un coach sportif démontrant l'exercice « ${exercise.name} » avec une technique parfaite.

Équipement utilisé : ${exercise.equipment.length > 0 ? exercise.equipment.join(", ") : "poids du corps uniquement"}
${exercise.notes ? `Conseil technique du programme : ${exercise.notes}` : ""}

Le prompt doit décrire précisément, en un paragraphe de 80 à 150 mots :
- la position de départ (posture, prise, placement des pieds/mains) ;
- les phases du mouvement (excentrique/concentrique) avec un tempo lent et contrôlé, 2 à 3 répétitions ;
- les points techniques clés visibles (dos neutre, amplitude complète, etc.) ;
- le cadrage : plan de profil stable montrant tout le corps et l'amplitude, salle de sport moderne, éclairage doux ;
- pas de texte incrusté, pas de watermark.

Réponds UNIQUEMENT avec le prompt en anglais, sans introduction ni guillemets.`;

  try {
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${settings.openrouterApiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://github.com/Stam2000/fitness-",
        "X-Title": "Mon Coach Fitness",
      },
      body: JSON.stringify({
        model: settings.openrouterModel,
        messages: [
          {
            role: "system",
            content:
              "Tu es un coach sportif expert et un spécialiste des prompts pour modèles vidéo IA.",
          },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.7,
      }),
    });
    if (!res.ok) return fallback;
    const json = await res.json();
    const content: string | undefined = json?.choices?.[0]?.message?.content;
    const cleaned = content?.trim().replace(/^["«\s]+|["»\s]+$/g, "");
    // Un prompt trop court est suspect (refus, réponse vide…) : repli.
    return cleaned && cleaned.length >= 40 ? cleaned : fallback;
  } catch {
    return fallback;
  }
}
