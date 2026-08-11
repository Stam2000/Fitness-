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
    }
  | {
      // Saisie / correction des séries réalisées d'un exercice, dans une
      // séance en cours ou déjà terminée. Les valeurs sont déjà résolues
      // (fusion avec l'existant) : l'application les écrit telles quelles.
      kind: "set_logs";
      sessionId: string;
      sessionLabel: string;
      exerciseId: string;
      exerciseName: string;
      sets: {
        setIndex: number;
        reps: number | null;
        weightKg: number | null;
        done: boolean;
        variationName: string | null;
      }[];
      changes: string[];
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
  list_sessions: "Liste des séances",
  get_session_logs: "Lecture des séries d'une séance",
  propose_set_logs: "Préparation d'une correction de séries",
  propose_program_edit: "Préparation d'une modification du programme",
  propose_substitution: "Recherche d'un exercice de remplacement",
  propose_variations: "Création de variantes",
};
