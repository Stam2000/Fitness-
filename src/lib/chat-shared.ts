// Types et libellés du chat partagés entre le serveur (outils, route, actions)
// et le client (panneau) — aucun import exécutable côté serveur ici.
import type { EditedProgramDraft } from "@/lib/ai-program-edit";
import type { ExerciseDraft, VariationDraft } from "@/lib/program-schema";

// Proposition de modification produite par un outil propose_* : affichée en
// carte dans le panneau, appliquée seulement après confirmation (voir
// applyChatProposal dans src/app/chat-actions.ts).
export type ChatProposal =
  | {
      kind: "program_edit";
      programId: string;
      programName: string;
      draft: EditedProgramDraft;
      changes: string[];
    }
  | {
      kind: "substitution";
      exerciseId: string;
      programId: string;
      dayName: string;
      oldName: string;
      replacement: ExerciseDraft;
    }
  | {
      kind: "variations";
      exerciseId: string;
      programId: string;
      exerciseName: string;
      variations: VariationDraft[];
    };

export type ChatToolTrace = {
  name: string;
  args: Record<string, unknown>;
  summary: string;
};

// Libellés affichés dans le panneau pendant/après l'exécution d'un outil.
export const TOOL_LABELS: Record<string, string> = {
  list_programs: "Liste des programmes",
  get_program: "Lecture du programme",
  get_progress: "Analyse de la progression",
  propose_program_edit: "Préparation d'une modification du programme",
  propose_substitution: "Recherche d'un exercice de remplacement",
  propose_variations: "Création de variantes",
};
