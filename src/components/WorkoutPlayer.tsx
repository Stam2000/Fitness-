"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  BicepsFlexed,
  ChevronLeft,
  ChevronRight,
  Flag,
  Lightbulb,
  Repeat,
  Replace,
  Target,
  Weight,
} from "lucide-react";
import { abandonSession, setSessionVariation } from "@/app/actions";
import { blobToWavBase64 } from "@/lib/audio";
import { btn } from "@/components/ui/button";
import Chip from "@/components/ui/Chip";
import ExerciseHero from "@/components/workout/ExerciseHero";
import RestScreen from "@/components/workout/RestScreen";
import WarmupScreen from "@/components/workout/WarmupScreen";
import CompletionScreen from "@/components/workout/CompletionScreen";
import SubstituteSheet from "@/components/workout/SubstituteSheet";
import SetLogPanel from "@/components/workout/SetLogPanel";
import TimeBar from "@/components/workout/TimeBar";
import type { NextUpInfo } from "@/components/workout/NextUpCard";
import MusclePreviewSheet, {
  type MuscleChipInfo,
  type MuscleComboInfo,
} from "@/components/MusclePreviewSheet";
import { muscleComboKey, normalizeName } from "@/lib/normalize";
import { parseVoiceEntries, type VoiceSet } from "@/lib/voice-parse";

// Une « option » d'exercice : l'exercice de base (index 0) ou une variante,
// avec ses propres données d'historique (suggestion, dernières perfs, record).
type VariantView = {
  name: string;
  sets: number;
  reps: string;
  restSeconds: number;
  weightHint: string | null;
  equipment: string[];
  muscles: string[];
  // Temps cible IA pour boucler l'exercice (null = estimation locale).
  targetSeconds: number | null;
  // Temps cible IA d'exécution d'UNE série (null = estimation locale).
  setSeconds: number | null;
  notes: string | null;
  imageUrl: string | null;
  videoUrl: string | null;
  suggestion: { lastWeight: number; suggestion: number } | null;
  previousLogs: {
    setIndex: number;
    reps: number | null;
    weightKg: number | null;
  }[];
  historicalMax: number | null;
};

type ExerciseView = {
  id: string;
  options: VariantView[]; // index 0 = exercice de base
  activeIndex: number; // option active au chargement (override ou rotation)
  autoIndex: number; // option désignée par la rotation automatique
  // Temps de transition IA vers l'exercice suivant (null = 60 s).
  transitionSeconds: number | null;
};

// Temps cible d'un exercice : valeur IA, sinon estimation locale
// séries × (repos + ~45 s d'exécution).
function targetSecondsOf(option: VariantView): number {
  return (
    option.targetSeconds ?? option.sets * (option.restSeconds + 45)
  );
}

// Temps cible d'UNE série : valeur IA, sinon durée des reps « en secondes »,
// sinon dérivé du temps cible global (cible/séries − repos, plancher 20 s).
function setSecondsOf(option: VariantView): number {
  return (
    option.setSeconds ??
    parseDurationSeconds(option.reps) ??
    Math.max(
      20,
      Math.round(targetSecondsOf(option) / option.sets - option.restSeconds)
    )
  );
}

type LogEntry = {
  exerciseId: string;
  setIndex: number;
  reps: number | null;
  weightKg: number | null;
  done: boolean;
};

type SetState = { reps: string; weightKg: string; done: boolean };

// « 30 s », « 45-60 s », « 1 min », « 1:30 », « 60 secondes » → secondes ;
// sinon null (exercice à répétitions classique).
export function parseDurationSeconds(reps: string): number | null {
  const text = reps.trim().toLowerCase();
  const colon = text.match(/^(\d+):(\d{2})$/);
  if (colon) return parseInt(colon[1], 10) * 60 + parseInt(colon[2], 10);
  const range = text.match(
    /^(?:\d+\s*-\s*)?(\d+)\s*(s|sec|secs|secondes?|min|minutes?)\.?$/
  );
  if (!range) return null;
  const value = parseInt(range[1], 10);
  return range[2].startsWith("min") ? value * 60 : value;
}

export default function WorkoutPlayer({
  sessionId,
  programName,
  dayName,
  completed,
  exercises,
  initialLogs,
  voiceInput,
  voiceAnnounce,
  hasOpenrouterKey,
  startedAtMs = null,
  completedAtMs = null,
  initialExerciseSeconds = {},
  muscleInfoByName = {},
  muscleComboByKey = {},
}: {
  sessionId: string;
  programName: string;
  dayName: string;
  completed: boolean;
  exercises: ExerciseView[];
  initialLogs: LogEntry[];
  voiceInput: boolean;
  voiceAnnounce: boolean;
  hasOpenrouterKey: boolean;
  startedAtMs?: number | null;
  completedAtMs?: number | null;
  initialExerciseSeconds?: Record<string, number>;
  // Catalogue Muscle indexé par nom normalisé, pour le popup de prévisualisation.
  muscleInfoByName?: Record<string, MuscleChipInfo>;
  // Combinaisons de muscles indexées par clé canonique (muscleComboKey).
  muscleComboByKey?: Record<string, MuscleComboInfo>;
}) {
  // Option affichée pour chaque exercice (bascule manuelle possible).
  const [variantIdx, setVariantIdx] = useState<Record<string, number>>(() =>
    Object.fromEntries(exercises.map((ex) => [ex.id, ex.activeIndex]))
  );
  const [current, setCurrent] = useState(() => {
    // Reprendre au premier exercice incomplet.
    for (let i = 0; i < exercises.length; i++) {
      const ex = exercises[i];
      const doneCount = initialLogs.filter(
        (l) => l.exerciseId === ex.id && l.done
      ).length;
      if (doneCount < ex.options[ex.activeIndex].sets) return i;
    }
    return 0;
  });
  const [logs, setLogs] = useState<Record<string, SetState>>(() => {
    const map: Record<string, SetState> = {};
    for (const ex of exercises) {
      // Autant de clés que la plus généreuse des options, pour que la
      // bascule vers une variante à plus de séries ne casse rien.
      const maxSets = Math.max(...ex.options.map((o) => o.sets));
      // Prescription : le poids suggéré (double progression) préremplit les
      // séries vierges de l'option active. Init seulement — un changement de
      // variante en cours de séance n'écrase pas une saisie.
      const suggested = completed
        ? null
        : ex.options[ex.activeIndex].suggestion?.suggestion ?? null;
      for (let i = 0; i < maxSets; i++) {
        const existing = initialLogs.find(
          (l) => l.exerciseId === ex.id && l.setIndex === i
        );
        map[`${ex.id}:${i}`] = {
          reps: existing?.reps != null ? String(existing.reps) : "",
          weightKg:
            existing?.weightKg != null
              ? String(existing.weightKg)
              : suggested != null
                ? String(suggested)
                : "",
          done: existing?.done ?? false,
        };
      }
    }
    return map;
  });
  const [restLeft, setRestLeft] = useState<number | null>(null);
  // Série tout juste validée : mise en avant dans la saisie pendant le repos.
  const [justDone, setJustDone] = useState<{
    exerciseId: string;
    setIndex: number;
  } | null>(null);
  // Nature du décompte en cours : repos entre séries ou transition
  // vers l'exercice suivant (après la dernière série d'un exercice).
  const [restKind, setRestKind] = useState<"rest" | "transition">("rest");
  // Échauffement proposé tant qu'aucune série n'est faite.
  const [warmupDone, setWarmupDone] = useState(() =>
    initialLogs.some((l) => l.done)
  );
  const [warmupLeft, setWarmupLeft] = useState<number | null>(null);
  // Chrono d'une série d'exercice « en secondes » (planche, gainage…).
  const [setTimer, setSetTimer] = useState<{
    setIndex: number;
    left: number;
    target: number;
  } | null>(null);
  const [finished, setFinished] = useState(completed);
  // Instant de fin (séance terminée dans cette session de navigation).
  const [finishedAtMs, setFinishedAtMs] = useState<number | null>(null);
  // Temps passé par exercice (secondes), repos entre séries inclus.
  const [exerciseSeconds, setExerciseSeconds] = useState<Record<string, number>>(
    initialExerciseSeconds
  );
  // Pause manuelle du chrono d'exercice (bouton ⏸ de la barre de temps).
  const [exercisePaused, setExercisePaused] = useState(false);
  // Horloge murale pour le temps de séance affiché (mise à jour chaque seconde).
  const [nowMs, setNowMs] = useState<number | null>(null);
  // Chrono de la série en cours, ancré sur l'horloge murale pour rester
  // juste malgré le throttling des timers (page en arrière-plan) : `base` =
  // secondes gelées (pauses), `anchorMs` = début du run en cours (null =
  // gelé). La clé exercice:série change quand on avance → remise à zéro.
  const [setClock, setSetClock] = useState<{
    key: string;
    base: number;
    anchorMs: number | null;
  }>({ key: "", base: 0, anchorMs: null });
  const [showSubstitute, setShowSubstitute] = useState(false);
  // Popup de prévisualisation des muscles travaillés par l'exercice courant.
  const [showMuscles, setShowMuscles] = useState(false);
  const [substituteReason, setSubstituteReason] = useState("");
  const [substituting, setSubstituting] = useState(false);
  const [substituteError, setSubstituteError] = useState<string | null>(null);
  const [aiWarmup, setAiWarmup] = useState<
    { name: string; seconds: number }[] | null
  >(null);
  const [aiWarmupLoading, setAiWarmupLoading] = useState(false);
  const [aiWarmupError, setAiWarmupError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [feedbackLoading, setFeedbackLoading] = useState(false);
  const [feedbackError, setFeedbackError] = useState<string | null>(null);
  const [listening, setListening] = useState(false);
  const [voiceMessage, setVoiceMessage] = useState<string | null>(null);
  const restInterval = useRef<ReturnType<typeof setInterval> | null>(null);
  const warmupInterval = useRef<ReturnType<typeof setInterval> | null>(null);
  const setTimerInterval = useRef<ReturnType<typeof setInterval> | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null);
  // Dictée audio directe : enregistreur micro et arrêt automatique.
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const autoStopRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Dernière série (clé exercice:série) déjà signalée en dépassement.
  const overtimeBeepedRef = useRef<string | null>(null);

  const exercise = exercises[current];
  // Option active d'un exercice, clampée si les variantes ont changé.
  const activeIndexOf = useCallback(
    (ex: ExerciseView) =>
      Math.min(variantIdx[ex.id] ?? ex.activeIndex, ex.options.length - 1),
    [variantIdx]
  );
  const activeOf = useCallback(
    (ex: ExerciseView) => ex.options[activeIndexOf(ex)],
    [activeIndexOf]
  );
  const active = activeOf(exercise);
  // Nom sous lequel journaliser les séries (null = exercice de base).
  const activeVariationName =
    activeIndexOf(exercise) === 0 ? null : active.name;
  const exerciseDuration = parseDurationSeconds(active.reps);
  // Série « en cours » = première non cochée de l'exercice courant
  // (firstOpenSetIndex est déclarée plus bas ; hissée par le moteur JS).
  const currentSetIdx = firstOpenSetIndex();
  const currentSetKey = `${exercise.id}:${currentSetIdx}`;
  const resting = restLeft !== null;
  // Temps écoulé / restant de la série en cours (voir effet setClock).
  const setElapsed =
    setClock.key === currentSetKey
      ? setClock.base +
        (setClock.anchorMs != null && nowMs != null
          ? Math.max(0, Math.floor((nowMs - setClock.anchorMs) / 1000))
          : 0)
      : 0;
  const setRemaining = setSecondsOf(active) - setElapsed;

  // Bips courts (fin de chrono, compte à rebours), indépendants des
  // annonces vocales. `times` bips espacés de 250 ms (défaut : double bip).
  const beep = useCallback((times = 2) => {
    try {
      type AudioWindow = Window & { webkitAudioContext?: typeof AudioContext };
      const w = window as AudioWindow;
      const Ctx = window.AudioContext ?? w.webkitAudioContext;
      if (!Ctx) return;
      const ctx = new Ctx();
      Array.from({ length: times }, (_, i) => i * 0.25).forEach((delay) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.frequency.value = 880;
        gain.gain.setValueAtTime(0.2, ctx.currentTime + delay);
        gain.gain.exponentialRampToValueAtTime(
          0.001,
          ctx.currentTime + delay + 0.18
        );
        osc.start(ctx.currentTime + delay);
        osc.stop(ctx.currentTime + delay + 0.2);
      });
      // Ferme le contexte après le dernier bip : Chrome limite le nombre
      // d'AudioContext ouverts (les bips finiraient par se taire), et un
      // contexte qui traîne peut retenir le focus audio au détriment de la
      // musique (Spotify/Audible) qui joue en parallèle.
      setTimeout(
        () => {
          void ctx.close().catch(() => {});
        },
        (times * 0.25 + 0.3) * 1000
      );
    } catch {
      // audio indisponible : tant pis pour le bip
    }
  }, []);

  const speak = useCallback(
    (text: string) => {
      if (!voiceAnnounce || typeof window === "undefined") return;
      if (!window.speechSynthesis) return;
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = "fr-FR";
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(utterance);
    },
    [voiceAnnounce]
  );

  const saveLog = useCallback(
    (
      exerciseId: string,
      setIndex: number,
      state: SetState,
      variationName: string | null
    ) => {
      fetch(`/api/sessions/${sessionId}/logs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          exerciseId,
          setIndex,
          reps: state.reps === "" ? null : parseInt(state.reps, 10),
          weightKg: state.weightKg === "" ? null : parseFloat(state.weightKg),
          done: state.done,
          variationName,
        }),
      }).catch(() => {
        // hors-ligne : la valeur reste dans l'état local
      });
    },
    [sessionId]
  );

  const startRest = useCallback(
    (seconds: number) => {
      if (seconds <= 0) return;
      if (restInterval.current) clearInterval(restInterval.current);
      setRestLeft(seconds);
      restInterval.current = setInterval(() => {
        setRestLeft((prev) => {
          if (prev === null) return null;
          if (prev <= 1) {
            if (restInterval.current) clearInterval(restInterval.current);
            speak("Repos terminé, c'est reparti !");
            return null;
          }
          const next = prev - 1;
          // Compte à rebours sonore avant la fin du repos : bip à 3, 2, 1.
          if (next <= 3) beep(1);
          return next;
        });
      }, 1000);
    },
    [speak, beep]
  );

  useEffect(() => {
    return () => {
      if (restInterval.current) clearInterval(restInterval.current);
      if (warmupInterval.current) clearInterval(warmupInterval.current);
      if (setTimerInterval.current) clearInterval(setTimerInterval.current);
      if (autoStopRef.current) clearTimeout(autoStopRef.current);
      recognitionRef.current?.abort?.();
      const recorder = mediaRecorderRef.current;
      if (recorder && recorder.state !== "inactive") recorder.stop();
    };
  }, []);

  // Chrono automatique par exercice : s'accumule sur l'exercice courant tant
  // que la séance est active (échauffement exclu, repos entre séries inclus,
  // pause manuelle possible).
  const currentExerciseId = exercise.id;
  useEffect(() => {
    if (finished || !warmupDone || exercisePaused) return;
    const tick = setInterval(() => {
      setExerciseSeconds((prev) => ({
        ...prev,
        [currentExerciseId]: (prev[currentExerciseId] ?? 0) + 1,
      }));
    }, 1000);
    return () => clearInterval(tick);
  }, [finished, warmupDone, exercisePaused, currentExerciseId]);

  // Horloge du temps de séance affiché dans la barre de temps.
  useEffect(() => {
    if (finished) return;
    const update = () => setNowMs(Date.now());
    const first = setTimeout(update, 0);
    const clock = setInterval(update, 1000);
    return () => {
      clearTimeout(first);
      clearInterval(clock);
    };
  }, [finished]);

  // Chrono de la série en cours : actif seulement en vue exercice (pas
  // pendant l'échauffement ni le repos) et hors pause. À l'activation on
  // ancre le run sur l'horloge murale ; à la désactivation (pause, repos,
  // navigation) on gèle l'écoulé dans `base`. L'affichage se rafraîchit via
  // l'horloge `nowMs`, donc aucune dérive si les timers sont throttlés.
  useEffect(() => {
    if (finished || !warmupDone || resting || exercisePaused) return;
    const start = setTimeout(() => {
      setSetClock((prev) =>
        prev.key === currentSetKey
          ? prev.anchorMs != null
            ? prev
            : { ...prev, anchorMs: Date.now() }
          : { key: currentSetKey, base: 0, anchorMs: Date.now() }
      );
    }, 0);
    return () => {
      clearTimeout(start);
      setSetClock((prev) =>
        prev.anchorMs != null
          ? {
              key: prev.key,
              base:
                prev.base +
                Math.max(0, Math.floor((Date.now() - prev.anchorMs) / 1000)),
              anchorMs: null,
            }
          : prev
      );
    };
  }, [finished, warmupDone, resting, exercisePaused, currentSetKey]);

  // Persistance : carte complète envoyée en arrière-plan (changement
  // d'exercice, fin de séance, et toutes les 30 s par sécurité).
  const exerciseSecondsRef = useRef(exerciseSeconds);
  useEffect(() => {
    exerciseSecondsRef.current = exerciseSeconds;
  }, [exerciseSeconds]);
  const saveExerciseSeconds = useCallback(() => {
    fetch(`/api/sessions/${sessionId}/exercise-time`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ seconds: exerciseSecondsRef.current }),
    }).catch(() => {
      // hors-ligne : les valeurs restent dans l'état local
    });
  }, [sessionId]);
  useEffect(() => {
    if (finished) return;
    const save = setInterval(saveExerciseSeconds, 30_000);
    return () => clearInterval(save);
  }, [finished, saveExerciseSeconds]);

  // Après une série cochée : repos normal, ou transition (temps IA) si
  // c'était la dernière série de l'exercice. Rien après la toute dernière.
  function startRestAfterSet(setIndex: number) {
    setJustDone({ exerciseId: exercise.id, setIndex });
    const isLastSet = setIndex === active.sets - 1;
    const isLastExercise = current === exercises.length - 1;
    if (isLastSet && isLastExercise) return;
    if (isLastSet) {
      setRestKind("transition");
      startRest(exercise.transitionSeconds ?? 60);
    } else {
      setRestKind("rest");
      startRest(active.restSeconds);
    }
  }

  function startWarmup(seconds: number) {
    if (warmupInterval.current) clearInterval(warmupInterval.current);
    setWarmupLeft(seconds);
    warmupInterval.current = setInterval(() => {
      setWarmupLeft((prev) => {
        if (prev === null) return null;
        if (prev <= 1) {
          if (warmupInterval.current) clearInterval(warmupInterval.current);
          beep();
          speak("Échauffement terminé, au travail !");
          setWarmupDone(true);
          return null;
        }
        return prev - 1;
      });
    }, 1000);
  }

  function skipWarmup() {
    if (warmupInterval.current) clearInterval(warmupInterval.current);
    setWarmupLeft(null);
    setWarmupDone(true);
  }

  function completeTimedSet(setIndex: number, seconds: number) {
    const key = `${exercise.id}:${setIndex}`;
    setLogs((prev) => {
      const nextState: SetState = {
        weightKg: prev[key]?.weightKg ?? "",
        reps: String(seconds),
        done: true,
      };
      saveLog(exercise.id, setIndex, nextState, activeVariationName);
      return { ...prev, [key]: nextState };
    });
    startRestAfterSet(setIndex);
  }

  function startSetTimer(setIndex: number) {
    if (exerciseDuration === null) return;
    if (setTimerInterval.current) clearInterval(setTimerInterval.current);
    setSetTimer({ setIndex, left: exerciseDuration, target: exerciseDuration });
    setTimerInterval.current = setInterval(() => {
      setSetTimer((prev) => {
        if (prev === null) return null;
        if (prev.left <= 1) {
          if (setTimerInterval.current)
            clearInterval(setTimerInterval.current);
          beep();
          speak("Série terminée !");
          completeTimedSet(prev.setIndex, prev.target);
          return null;
        }
        return { ...prev, left: prev.left - 1 };
      });
    }, 1000);
  }

  // Arrêt anticipé : on enregistre le temps réellement tenu.
  function stopSetTimer() {
    if (setTimerInterval.current) clearInterval(setTimerInterval.current);
    setSetTimer((prev) => {
      if (prev !== null) {
        completeTimedSet(prev.setIndex, Math.max(1, prev.target - prev.left));
      }
      return null;
    });
  }

  function patchSet(
    exerciseId: string,
    setIndex: number,
    patch: Partial<SetState>,
    save = false
  ) {
    setLogs((prev) => {
      const key = `${exerciseId}:${setIndex}`;
      const next = { ...prev, [key]: { ...prev[key], ...patch } };
      if (save) saveLog(exerciseId, setIndex, next[key], activeVariationName);
      return next;
    });
  }

  function toggleDone(setIndex: number) {
    const key = `${exercise.id}:${setIndex}`;
    const state = logs[key];
    const nowDone = !state.done;
    patchSet(exercise.id, setIndex, { done: nowDone }, true);
    // Cocher une série depuis l'écran de repos ne relance pas le décompte.
    if (nowDone && restLeft === null) startRestAfterSet(setIndex);
  }

  function firstOpenSetIndex(): number {
    for (let i = 0; i < active.sets; i++) {
      if (!logs[`${exercise.id}:${i}`]?.done) return i;
    }
    return active.sets - 1;
  }

  // Temps cible de la série écoulé : les séries intermédiaires sont validées
  // automatiquement (série → repos → série suivante). La dernière série de
  // l'exercice reste manuelle — triple bip, décompte négatif — pour laisser
  // le temps de remplir poids et répétitions avant de passer à la suite.
  // Les exercices « en secondes » gardent leur propre chrono dédié.
  const setOverdue = setRemaining <= 0;
  const autoAdvance =
    setOverdue &&
    currentSetIdx < active.sets - 1 &&
    exerciseDuration === null &&
    setTimer === null;
  useEffect(() => {
    if (finished || !warmupDone || resting || exercisePaused) return;
    if (!setOverdue) return;
    if (overtimeBeepedRef.current === currentSetKey) return;
    const fire = setTimeout(() => {
      overtimeBeepedRef.current = currentSetKey;
      if (!autoAdvance) {
        beep(3);
        return;
      }
      beep(2);
      speak("Temps écoulé, série validée. Repos.");
      patchSet(exercise.id, currentSetIdx, { done: true }, true);
      startRestAfterSet(currentSetIdx);
    }, 0);
    return () => clearTimeout(fire);
  });

  // Bascule manuelle de variante : état local immédiat + persistance sur la
  // séance pour survivre aux rechargements.
  function chooseVariant(exerciseId: string, idx: number) {
    setVariantIdx((prev) => ({ ...prev, [exerciseId]: idx }));
    setSessionVariation(sessionId, exerciseId, idx).catch(() => {
      // hors-ligne : le choix reste appliqué localement
    });
  }

  // Interprète la phrase dictée : modèle OpenRouter si une clé est
  // configurée (plus précis — nombres en toutes lettres, tournures libres),
  // sinon ou en cas d'échec, l'analyseur local parseVoiceEntries.
  async function interpretTranscript(
    transcript: string
  ): Promise<{ sets: VoiceSet[]; allSets: boolean }> {
    if (!hasOpenrouterKey) return parseVoiceEntries(transcript);
    try {
      const res = await fetch("/api/voice/parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transcript,
          exercise: active.name,
          targetReps: active.reps,
          setCount: active.sets,
          currentSet: firstOpenSetIndex() + 1,
        }),
      });
      if (!res.ok) return parseVoiceEntries(transcript);
      const json = (await res.json()) as {
        sets?: VoiceSet[];
        allSets?: boolean;
      };
      const sets = json.sets ?? [];
      if (sets.length === 0) return parseVoiceEntries(transcript);
      return { sets, allSets: Boolean(json.allSets) };
    } catch {
      return parseVoiceEntries(transcript);
    }
  }

  // La dictée ne fait que remplir les champs : pas de validation ni de repos
  // — l'utilisateur coche lui-même. Une série dictée sans position va dans la
  // série en cours ; plusieurs séries remplissent l'exercice depuis le début
  // (ou aux positions explicitement annoncées).
  function applyVoiceSets(entries: VoiceSet[], allSets: boolean) {
    if (entries.length === 0) return;
    const total = active.sets;
    const targets: { index: number; weightKg: number | null; reps: number | null }[] =
      [];
    if (allSets && entries.length === 1) {
      for (let i = 0; i < total; i++) targets.push({ index: i, ...entries[0] });
    } else {
      const explicit = entries.some((e) => e.set != null);
      const start =
        entries.length === 1 && !explicit ? firstOpenSetIndex() : 0;
      entries.forEach((entry, i) => {
        const index = entry.set != null ? entry.set - 1 : start + i;
        if (index >= 0 && index < total) {
          targets.push({ index, weightKg: entry.weightKg, reps: entry.reps });
        }
      });
    }
    if (targets.length === 0) {
      setVoiceMessage(
        `Cet exercice n'a que ${total} série${total > 1 ? "s" : ""}.`
      );
      return;
    }

    const patch: Record<string, SetState> = {};
    for (const target of targets) {
      const key = `${exercise.id}:${target.index}`;
      const cur = patch[key] ?? logs[key];
      const nextState: SetState = {
        weightKg:
          target.weightKg !== null ? String(target.weightKg) : cur?.weightKg ?? "",
        reps: target.reps !== null ? String(target.reps) : cur?.reps ?? "",
        done: cur?.done ?? false,
      };
      patch[key] = nextState;
      saveLog(exercise.id, target.index, nextState, activeVariationName);
    }
    setLogs((prev) => ({ ...prev, ...patch }));

    const numbers = targets.map((t) => t.index + 1);
    const first = patch[`${exercise.id}:${targets[0].index}`];
    setVoiceMessage(
      targets.length === 1
        ? `Série ${numbers[0]} remplie : ${first.weightKg || "?"} kg × ${first.reps || "?"} reps — coche-la quand c'est fait.`
        : `${targets.length} séries remplies (${numbers.join(", ")}) — coche celles qui sont faites.`
    );
  }

  async function applyVoiceTranscript(transcript: string) {
    setVoiceMessage(`« ${transcript} » — interprétation…`);
    const { sets, allSets } = await interpretTranscript(transcript);
    if (sets.length === 0) {
      setVoiceMessage(`« ${transcript} » — je n'ai pas compris de nombres.`);
      return;
    }
    applyVoiceSets(sets, allSets);
  }

  // ---------- Dictée audio directe (modèle vocal via OpenRouter) ----------

  async function processAudioBlob(blob: Blob) {
    setVoiceMessage("Interprétation de l'audio…");
    try {
      const wav = await blobToWavBase64(blob);
      const res = await fetch("/api/voice/parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          audio: wav,
          exercise: active.name,
          targetReps: active.reps,
          setCount: active.sets,
          currentSet: firstOpenSetIndex() + 1,
        }),
      });
      if (!res.ok) throw new Error("voice-parse");
      const json = (await res.json()) as {
        sets?: VoiceSet[];
        allSets?: boolean;
      };
      const sets = json.sets ?? [];
      if (sets.length === 0) {
        setVoiceMessage("Je n'ai pas compris de nombres. Réessaie.");
        return;
      }
      applyVoiceSets(sets, Boolean(json.allSets));
    } catch {
      setVoiceMessage(
        "Interprétation impossible (modèle vocal). Réessaie ou saisis à la main."
      );
    }
  }

  async function startAudioRecording(): Promise<boolean> {
    if (
      typeof MediaRecorder === "undefined" ||
      !navigator.mediaDevices?.getUserMedia
    ) {
      return false;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;
      audioChunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        mediaRecorderRef.current = null;
        if (autoStopRef.current) {
          clearTimeout(autoStopRef.current);
          autoStopRef.current = null;
        }
        setListening(false);
        const blob = new Blob(audioChunksRef.current, {
          type: recorder.mimeType || "audio/webm",
        });
        if (blob.size < 1000) {
          setVoiceMessage("Je n'ai rien entendu. Réessaie.");
          return;
        }
        void processAudioBlob(blob);
      };
      recorder.start();
      setListening(true);
      setVoiceMessage("J'écoute… appuie à nouveau pour terminer.");
      // Garde-fou : arrêt automatique après 15 s.
      autoStopRef.current = setTimeout(() => stopAudioRecording(), 15_000);
      return true;
    } catch {
      // micro refusé ou indisponible : repli sur la dictée du navigateur
      return false;
    }
  }

  function stopAudioRecording() {
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== "inactive") recorder.stop();
  }

  // Un appui démarre l'écoute (modèle vocal si clé, sinon navigateur) ;
  // un second appui termine l'enregistrement.
  async function onMicTap() {
    if (mediaRecorderRef.current) {
      stopAudioRecording();
      return;
    }
    if (listening) return; // reconnaissance navigateur en cours
    if (hasOpenrouterKey) {
      const ok = await startAudioRecording();
      if (ok) return;
    }
    startVoice();
  }

  function startVoice() {
    const SpeechRecognition =
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).SpeechRecognition ||
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setVoiceMessage(
        "La reconnaissance vocale n'est pas disponible sur ce navigateur."
      );
      return;
    }
    const recognition = new SpeechRecognition();
    recognitionRef.current = recognition;
    recognition.lang = "fr-FR";
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    setListening(true);
    setVoiceMessage(null);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    recognition.onresult = (event: any) => {
      const transcript: string = event.results[0][0].transcript;
      void applyVoiceTranscript(transcript);
    };
    recognition.onerror = () => {
      setVoiceMessage("Je n'ai rien entendu. Réessaie.");
      setListening(false);
    };
    recognition.onend = () => setListening(false);
    recognition.start();
  }

  function goTo(index: number) {
    if (index < 0 || index >= exercises.length) return;
    saveExerciseSeconds();
    setExercisePaused(false);
    setVoiceMessage(null);
    setCurrent(index);
    const o = activeOf(exercises[index]);
    speak(
      `${o.name}. ${o.sets} séries de ${o.reps}${o.weightHint ? `. ${o.weightHint}` : ""}.`
    );
  }

  async function finishSession() {
    if (restInterval.current) clearInterval(restInterval.current);
    setRestLeft(null);
    saveExerciseSeconds();
    try {
      await fetch(`/api/sessions/${sessionId}/complete`, { method: "POST" });
    } catch {
      // le résumé s'affiche quand même, la séance restera « en cours »
    }
    speak("Bravo, séance terminée !");
    setFinishedAtMs(Date.now());
    setFinished(true);
  }

  async function loadAiWarmup() {
    setAiWarmupLoading(true);
    setAiWarmupError(null);
    try {
      const res = await fetch(`/api/sessions/${sessionId}/warmup`, {
        method: "POST",
      });
      const json = await res.json();
      if (!res.ok) {
        setAiWarmupError(json.error ?? "Erreur");
        return;
      }
      setAiWarmup(json.moves);
      const total = json.moves.reduce(
        (acc: number, m: { seconds: number }) => acc + m.seconds,
        0
      );
      startWarmup(total);
      speak(
        `Échauffement personnalisé : ${json.moves
          .map((m: { name: string; seconds: number }) => `${m.name}, ${m.seconds} secondes`)
          .join(". ")}`
      );
    } catch {
      setAiWarmupError("Erreur réseau. Réessaie.");
    } finally {
      setAiWarmupLoading(false);
    }
  }

  async function substituteExercise() {
    setSubstituting(true);
    setSubstituteError(null);
    try {
      const res = await fetch(`/api/exercises/${exercise.id}/substitute`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reason: substituteReason.trim() || undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setSubstituteError(json.error ?? "Erreur");
        return;
      }
      // Recharge la séance : l'exercice, ses cibles et le nombre de
      // séries peuvent avoir changé.
      window.location.reload();
    } catch {
      setSubstituteError("Erreur réseau. Réessaie.");
    } finally {
      setSubstituting(false);
    }
  }

  async function loadFeedback() {
    setFeedbackLoading(true);
    setFeedbackError(null);
    try {
      const res = await fetch(`/api/sessions/${sessionId}/feedback`, {
        method: "POST",
      });
      const json = await res.json();
      if (!res.ok) {
        setFeedbackError(json.error ?? "Erreur");
        return;
      }
      setFeedback(json.feedback);
    } catch {
      setFeedbackError("Erreur réseau. Réessaie.");
    } finally {
      setFeedbackLoading(false);
    }
  }

  // ---------- Résumé ----------
  if (finished) {
    const allStates = Object.entries(logs);
    const doneSets = allStates.filter(([, s]) => s.done);
    const volume = doneSets.reduce((acc, [, s]) => {
      const w = parseFloat(s.weightKg);
      const r = parseInt(s.reps, 10);
      return acc + (isNaN(w) || isNaN(r) ? 0 : w * r);
    }, 0);
    // Records personnels battus pendant cette séance (sur l'option jouée).
    const prs = exercises
      .map((ex) => {
        const o = activeOf(ex);
        const sessionMax = Array.from({ length: o.sets }, (_, i) =>
          logs[`${ex.id}:${i}`]
        )
          .filter((s) => s?.done)
          .reduce((acc, s) => {
            const w = parseFloat(s.weightKg);
            return isNaN(w) ? acc : Math.max(acc, w);
          }, 0);
        const previous = o.historicalMax;
        return sessionMax > 0 && (previous == null || sessionMax > previous)
          ? { name: o.name, weight: sessionMax, previous: previous ?? null }
          : null;
      })
      .filter(Boolean) as {
      name: string;
      weight: number;
      previous: number | null;
    }[];
    const endMs = finishedAtMs ?? completedAtMs;
    const durationMin =
      startedAtMs != null && endMs != null
        ? Math.max(1, Math.round((endMs - startedAtMs) / 60000))
        : null;
    const exerciseTimes = exercises
      .map((ex) => ({
        name: activeOf(ex).name,
        seconds: exerciseSeconds[ex.id] ?? 0,
      }))
      .filter((t) => t.seconds > 0);
    return (
      <CompletionScreen
        programName={programName}
        dayName={dayName}
        durationMin={durationMin}
        doneSetsCount={doneSets.length}
        volume={volume}
        exerciseTimes={exerciseTimes}
        prs={prs}
        hasOpenrouterKey={hasOpenrouterKey}
        feedback={feedback}
        feedbackLoading={feedbackLoading}
        feedbackError={feedbackError}
        onLoadFeedback={loadFeedback}
      />
    );
  }

  const totalSets = exercises.reduce((acc, ex) => acc + activeOf(ex).sets, 0);
  const doneCount = Object.values(logs).filter((s) => s.done).length;

  function abandon() {
    if (confirm("Abandonner la séance ? Les saisies seront perdues.")) {
      abandonSession(sessionId);
    }
  }

  // Bloc de saisie de l'exercice courant, partagé entre la vue exercice et
  // l'écran de repos (c'est pendant la pause qu'on saisit ce qu'on vient de
  // faire). `compact` = version resserrée du repos.
  function renderLogPanel(compact: boolean) {
    const stateAt = (i: number) =>
      logs[`${exercise.id}:${i}`] ?? { reps: "", weightKg: "", done: false };
    return (
      <SetLogPanel
        setCount={active.sets}
        stateAt={stateAt}
        prevAt={(i) => active.previousLogs.find((l) => l.setIndex === i)}
        currentSetIdx={currentSetIdx}
        justDoneIdx={
          compact && justDone?.exerciseId === exercise.id
            ? justDone.setIndex
            : null
        }
        duration={exerciseDuration}
        timerSetIndex={setTimer?.setIndex ?? null}
        timerLeft={setTimer?.left ?? null}
        compact={compact}
        disableTimer={compact}
        voice={
          voiceInput
            ? {
                listening,
                message: voiceMessage,
                onTap: () => void onMicTap(),
              }
            : null
        }
        onToggle={toggleDone}
        onWeightChange={(i, v) => patchSet(exercise.id, i, { weightKg: v })}
        onRepsChange={(i, v) => patchSet(exercise.id, i, { reps: v })}
        onBlurSave={(i) =>
          saveLog(exercise.id, i, stateAt(i), activeVariationName)
        }
        onStartTimer={startSetTimer}
        onStopTimer={stopSetTimer}
      />
    );
  }

  // ---------- Échauffement plein écran ----------
  if (!warmupDone) {
    const warmupNextUp: NextUpInfo = {
      overline: `Ensuite · Exercice ${current + 1}/${exercises.length}`,
      imageUrl: active.imageUrl,
      title: active.name,
      targetLine: `${active.sets} × ${active.reps} · repos ${active.restSeconds} s`,
    };
    return (
      <WarmupScreen
        warmupLeft={warmupLeft}
        aiWarmup={aiWarmup}
        aiWarmupLoading={aiWarmupLoading}
        aiWarmupError={aiWarmupError}
        hasOpenrouterKey={hasOpenrouterKey}
        dayName={dayName}
        doneCount={doneCount}
        totalSets={totalSets}
        nextUp={warmupNextUp}
        onAbandon={abandon}
        onStart={startWarmup}
        onLoadAi={loadAiWarmup}
        onExtend={() => setWarmupLeft((w) => (w !== null ? w + 30 : w))}
        onFinish={skipWarmup}
      />
    );
  }

  // ---------- Repos plein écran ----------
  if (restLeft !== null) {
    // Prochaine étape : première série ouverte de l'exercice courant,
    // sinon l'exercice suivant.
    let openIdx = -1;
    for (let i = 0; i < active.sets; i++) {
      if (!logs[`${exercise.id}:${i}`]?.done) {
        openIdx = i;
        break;
      }
    }
    let lastLine: string | null = null;
    for (let i = active.sets - 1; i >= 0; i--) {
      const s = logs[`${exercise.id}:${i}`];
      if (s?.done) {
        lastLine = s.weightKg
          ? `dernière série : ${s.weightKg} kg × ${s.reps || "—"}`
          : s.reps
            ? `dernière série : ${s.reps} reps`
            : null;
        break;
      }
    }
    const nextExists = current < exercises.length - 1;
    const next = nextExists ? activeOf(exercises[current + 1]) : null;
    const restNextUp: NextUpInfo =
      openIdx !== -1
        ? {
            overline: `Ensuite · Série ${openIdx + 1}/${active.sets}`,
            imageUrl: active.imageUrl,
            title: active.name,
            targetLine: `objectif ${active.reps}`,
            lastLine,
          }
        : next
          ? {
              overline: `Ensuite · Exercice ${current + 2}/${exercises.length}`,
              imageUrl: next.imageUrl,
              title: next.name,
              targetLine: `${next.sets} × ${next.reps} · repos ${next.restSeconds} s`,
              lastLine,
            }
          : {
              overline: "Ensuite",
              imageUrl: active.imageUrl,
              title: active.name,
              targetLine: `objectif ${active.reps}`,
              lastLine,
            };
    return (
      <RestScreen
        restLeft={restLeft}
        kind={restKind}
        dayName={dayName}
        doneCount={doneCount}
        totalSets={totalSets}
        nextUp={restNextUp}
        logPanel={renderLogPanel(true)}
        logTitle={active.name}
        onAbandon={abandon}
        onExtend={() => setRestLeft((r) => (r !== null ? r + 30 : r))}
        onSkip={() => {
          if (restInterval.current) clearInterval(restInterval.current);
          setRestLeft(null);
        }}
        onFinishNow={finishSession}
      />
    );
  }

  // ---------- Vue exercice ----------
  const sessionSeconds =
    startedAtMs != null && nowMs != null
      ? Math.max(0, Math.floor((nowMs - startedAtMs) / 1000))
      : null;

  return (
    <main className="flex flex-col gap-4 pb-6">
      {/* Deux colonnes sur grand écran : fiche exercice à gauche, saisie à droite */}
      <div className="flex flex-col gap-4 lg:grid lg:grid-cols-2 lg:items-start lg:gap-6">
      <div className="flex flex-col gap-3">
      <ExerciseHero
        option={active}
        currentIndex={current + 1}
        totalExercises={exercises.length}
        doneCount={doneCount}
        totalSets={totalSets}
        onAbandon={abandon}
      />

      <TimeBar
        sessionSeconds={sessionSeconds}
        label={`Série ${currentSetIdx + 1}/${active.sets}`}
        remainingSeconds={setRemaining}
        paused={exercisePaused}
        onTogglePause={() => setExercisePaused((p) => !p)}
      />

      {active.muscles.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <BicepsFlexed size={15} className="text-muted" />
          {active.muscles.map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setShowMuscles(true)}
              aria-label={`Voir le groupe musculaire ${m}`}
              className="rounded-full bg-surface-2 px-3 py-1.5 text-[12.5px] font-semibold text-muted-2 transition-colors hover:bg-surface-2/70"
            >
              {m}
            </button>
          ))}
        </div>
      )}

      {(exercise.options.length > 1 || hasOpenrouterKey) && (
        <div>
          <div className="flex flex-wrap gap-1.5">
            {exercise.options.length > 1 &&
              exercise.options.map((o, oi) => (
                <Chip
                  key={oi}
                  active={oi === activeIndexOf(exercise)}
                  onClick={() => chooseVariant(exercise.id, oi)}
                  className="max-w-full"
                >
                  <span className="truncate">
                    {String.fromCharCode(65 + oi)} · {o.name}
                  </span>
                </Chip>
              ))}
            {hasOpenrouterKey && (
              <Chip
                onClick={() => setShowSubstitute(true)}
                aria-label="Remplacer cet exercice"
                title="Remplacer cet exercice"
              >
                <Replace size={16} />
              </Chip>
            )}
          </div>
          {exercise.options.length > 1 && (
            <p className="mt-1.5 flex items-center gap-1.5 text-xs text-muted">
              <Repeat size={12} /> Rotation auto — ce passage :{" "}
              {String.fromCharCode(65 + exercise.autoIndex)}
            </p>
          )}
        </div>
      )}

      {active.suggestion ? (
        <div className="rounded-xl bg-accent/10 px-3.5 py-2.5">
          <p className="flex items-center gap-1.5 text-sm font-extrabold text-accent">
            <Target size={15} className="shrink-0" />
            {active.sets} × {active.reps} @ {active.suggestion.suggestion} kg
          </p>
          <p className="mt-0.5 text-xs font-semibold text-accent/80">
            Dernière fois : {active.suggestion.lastWeight} kg —{" "}
            {active.suggestion.suggestion > active.suggestion.lastWeight
              ? "toutes les séries au max, on charge +2,5 kg"
              : "consolide cette charge"}
          </p>
        </div>
      ) : (
        active.weightHint && (
          <p className="flex items-start gap-1.5 text-sm text-muted-2">
            <Weight size={15} className="mt-0.5 shrink-0" />
            {active.weightHint}
          </p>
        )
      )}
      {active.notes && (
        <p className="flex items-start gap-2 rounded-xl bg-surface-2 px-3.5 py-2.5 text-[13px] leading-relaxed text-muted-2">
          <Lightbulb size={15} className="mt-0.5 shrink-0" />
          <span>{active.notes}</span>
        </p>
      )}
      </div>

      <div className="flex flex-col gap-4">
      {renderLogPanel(false)}

      <div className="flex gap-2">
        <button
          onClick={() => goTo(current - 1)}
          disabled={current === 0}
          aria-label="Exercice précédent"
          title="Exercice précédent"
          className={btn("outline", "lg", "flex-1 text-muted-2")}
        >
          <ChevronLeft size={22} />
        </button>
        {current < exercises.length - 1 ? (
          <button
            onClick={() => goTo(current + 1)}
            aria-label="Exercice suivant"
            title="Exercice suivant"
            className={btn("primary", "lg", "flex-[2]")}
          >
            <ChevronRight size={22} />
          </button>
        ) : (
          <button
            onClick={finishSession}
            className={btn("primary", "lg", "flex-[2]")}
          >
            <Flag size={19} /> Terminer
          </button>
        )}
      </div>

      {current < exercises.length - 1 && (
        <button
          onClick={finishSession}
          className="inline-flex items-center justify-center gap-1.5 text-sm font-semibold text-muted"
        >
          <Flag size={14} /> Terminer maintenant
        </button>
      )}
      </div>
      </div>

      <SubstituteSheet
        open={showSubstitute}
        reason={substituteReason}
        busy={substituting}
        error={substituteError}
        onClose={() => setShowSubstitute(false)}
        onReason={setSubstituteReason}
        onSubmit={substituteExercise}
      />

      <MusclePreviewSheet
        open={showMuscles}
        onClose={() => setShowMuscles(false)}
        muscles={active.muscles.map(
          (m) =>
            muscleInfoByName[normalizeName(m)] ?? {
              name: m,
              id: null,
              imageUrl: null,
              imageTaskId: null,
            }
        )}
        combo={muscleComboByKey[muscleComboKey(active.muscles)] ?? null}
      />
    </main>
  );
}
