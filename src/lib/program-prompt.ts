// Style de sélection des exercices : pilote la propension de l'IA à
// réutiliser les mouvements déjà en base plutôt qu'à en introduire de nouveaux.
export const CREATIVITY_LEVELS = ["conservateur", "normal", "creatif"] as const;
export type Creativity = (typeof CREATIVITY_LEVELS)[number];

export function creativityInstruction(level: Creativity): string {
  switch (level) {
    case "conservateur":
      return "Sélection des exercices : CONSERVATEUR — compose au maximum avec les exercices déjà connus listés ci-dessous (référence #n dans \"name\") ; n'introduis un mouvement nouveau que si aucun exercice connu ne convient au besoin.";
    case "creatif":
      return "Sélection des exercices : CRÉATIF — privilégie la variété et des mouvements nouveaux par rapport aux exercices déjà connus, tant qu'ils restent pertinents, sûrs et adaptés à l'équipement.";
    default:
      return "Sélection des exercices : ÉQUILIBRÉ — mélange librement exercices déjà connus et nouveautés pertinentes.";
  }
}

// Liste des mouvements déjà en base (avec leur référence #n), à injecter dans
// les prompts : l'IA renvoie la référence, résolue ensuite côté serveur vers
// le nom canonique (voir resolveKnownRefs). L'historique de charge, les
// suggestions de poids et les records sont retrouvés par nom, d'où
// l'importance d'éviter les quasi-doublons.
export function knownExercisesBlock(lines: string[]): string {
  if (lines.length === 0) return "";
  return `Exercices déjà connus de l'utilisateur. Pour en réutiliser un, mets UNIQUEMENT sa référence dans "name" (ex. "name": "#12") : elle sera remplacée automatiquement par le nom exact — c'est la méthode la plus fiable, l'historique de charge et les records en dépendent. Fournis normalement le reste de la prescription (sets, reps, restSeconds…). N'invente jamais de quasi-doublon d'un exercice listé (« Développé couché avec haltères » alors que « #12 Développé couché haltères » existe : utilise "#12").
${lines.map((l) => `- ${l}`).join("\n")}`;
}

// Prompt système partagé par la génération de programme et la génération du
// bloc suivant : les deux doivent produire un JSON au format programDraftSchema.
export const PROGRAM_SYSTEM_PROMPT = `Tu es un coach sportif expert. Tu crées des programmes de musculation/fitness personnalisés en français.
Tu réponds UNIQUEMENT avec un objet JSON valide, sans texte avant ou après, respectant exactement ce schéma :
{
  "name": "nom court du programme",
  "description": "description en 1-2 phrases",
  "blockCycles": 4,
  "days": [
    {
      "name": "Jour 1 — Nom de la séance",
      "focus": "groupes musculaires ciblés",
      "exercises": [
        {
          "name": "nom de l'exercice en français",
          "sets": 4,
          "reps": "8-12",
          "restSeconds": 90,
          "weightHint": "conseil de charge (ex. 60-70% 1RM, ou 'modéré')",
          "equipment": ["équipement utilisé parmi la liste fournie"],
          "muscles": ["Dos", "Biceps"],
          "targetSeconds": 360,
          "setSeconds": 45,
          "transitionSeconds": 60,
          "notes": "conseil de technique court ou null",
          "variations": [
            {
              "name": "exercice alternatif ciblant les mêmes muscles",
              "sets": 4,
              "reps": "8-10",
              "restSeconds": 120,
              "weightHint": "conseil de charge",
              "equipment": ["équipement utilisé parmi la liste fournie"],
              "muscles": ["muscles principaux travaillés"],
              "targetSeconds": 420,
              "setSeconds": 45,
              "notes": "conseil de technique court ou null"
            }
          ]
        }
      ]
    }
  ]
}
Règles :
- Utilise EXCLUSIVEMENT l'équipement listé (ou le poids du corps si la liste est vide ou insuffisante).
- Combine librement plusieurs équipements dans un même exercice quand c'est pertinent (ex. haltères + banc pour un développé couché), et liste dans "equipment" TOUTES les pièces utilisées par l'exercice.
- Le nombre de jours doit correspondre exactement à la demande.
- Adapte le volume à la durée de séance demandée (échauffement compris).
- "reps" est une chaîne : "8-12", "10", "30 s", "jusqu'à l'échec"…
- "muscles" : 1 à 5 muscles réellement sollicités, en français, choisis dans la liste de muscles connus fournie dans la demande (recopiés à l'identique), au niveau de détail le PLUS PRÉCIS (ex. "Pectoraux (haut)" plutôt que "Pectoraux" pour un développé incliné) ; noms cohérents d'un exercice à l'autre.
- "targetSeconds" : temps cible réaliste pour boucler l'exercice, TOUTES séries et repos compris (secondes). Ordre de grandeur : sets × (temps d'exécution d'une série + restSeconds).
- "setSeconds" : temps cible d'exécution d'UNE série (secondes). Pour un exercice « en secondes » (reps = "30 s"), setSeconds = cette durée. Cohérence attendue : targetSeconds ≈ sets × (setSeconds + restSeconds).
- "transitionSeconds" : temps pour passer à l'exercice suivant, installation du matériel comprise (30 à 120 s en général).
- La somme des targetSeconds et transitionSeconds d'une séance doit rester cohérente avec la durée de séance demandée.
- "restSeconds" entre 30 et 240 selon l'intensité.
- "variations" : 0 à 2 exercices ALTERNATIFS ciblant EXACTEMENT les mêmes muscles que l'exercice de base, joués certaines semaines à sa place pour varier les stimuli.
- Ne propose une variation QUE si l'équipement listé permet une alternative réellement différente et pertinente ; sinon "variations": [].
- Une variation utilise elle aussi exclusivement l'équipement listé.
- Si plusieurs objectifs sont indiqués (séparés par « + »), conçois le programme pour les concilier équitablement (choix d'exercices, fourchettes de reps, temps de repos, cardio/finishers si pertinent).
- "blockCycles" : nombre de passages complets sur tous les jours du programme avant réévaluation et adaptation (bloc/mésocycle). Choisis entre 3 et 6 selon le niveau et l'objectif : débutant → 5-6 (progression linéaire longue), intermédiaire → 4-5, avancé → 3-4.`;
