"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { abandonSession, setSessionVariation } from "@/app/actions";
import { btn } from "@/components/ui/button";
import Chip from "@/components/ui/Chip";
import ExerciseHero from "@/components/workout/ExerciseHero";
import RestScreen from "@/components/workout/RestScreen";
import WarmupScreen from "@/components/workout/WarmupScreen";
import CompletionScreen from "@/components/workout/CompletionScreen";
import SubstituteSheet from "@/components/workout/SubstituteSheet";
import SetRow from "@/components/workout/SetRow";
import TimeBar from "@/components/workout/TimeBar";
import type { NextUpInfo } from "@/components/workout/NextUpCard";

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

// « 80 kilos 10 répétitions », « 10 reps à 82,5 kg », « 12 fois 20 kilos »…
export function parseVoiceEntry(transcript: string): {
  weightKg: number | null;
  reps: number | null;
} {
  const text = transcript
    .toLowerCase()
    .replace(/,/g, ".")
    .replace(/virgule/g, ".");

  let weightKg: number | null = null;
  let reps: number | null = null;

  const weightMatch = text.match(/(\d+(?:\.\d+)?)\s*(?:kilos?|kg)/);
  if (weightMatch) weightKg = parseFloat(weightMatch[1]);

  const repsMatch = text.match(
    /(\d+)\s*(?:reps?|rép(?:é|e)titions?|fois)/
  );
  if (repsMatch) reps = parseInt(repsMatch[1], 10);

  if (weightKg === null || reps === null) {
    const numbers = (text.match(/\d+(?:\.\d+)?/g) ?? [])
      .map(Number)
      .filter(
        (n) => n !== weightKg && n !== reps
      );
    if (weightKg === null && reps === null) {
      if (numbers.length >= 2) {
        // Sans unités : le plus grand nombre est le poids.
        const [a, b] = numbers;
        weightKg = Math.max(a, b);
        reps = Math.min(a, b);
      } else if (numbers.length === 1) {
        reps = Math.round(numbers[0]);
      }
    } else if (weightKg === null && numbers.length > 0) {
      weightKg = numbers[0];
    } else if (reps === null && numbers.length > 0) {
      reps = Math.round(numbers[0]);
    }
  }

  return { weightKg, reps };
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

  // Double bip court (fin de chrono), indépendant des annonces vocales.
  const beep = useCallback(() => {
    try {
      type AudioWindow = Window & { webkitAudioContext?: typeof AudioContext };
      const w = window as AudioWindow;
      const Ctx = window.AudioContext ?? w.webkitAudioContext;
      if (!Ctx) return;
      const ctx = new Ctx();
      [0, 0.25].forEach((delay) => {
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
          return prev - 1;
        });
      }, 1000);
    },
    [speak]
  );

  useEffect(() => {
    return () => {
      if (restInterval.current) clearInterval(restInterval.current);
      if (warmupInterval.current) clearInterval(warmupInterval.current);
      if (setTimerInterval.current) clearInterval(setTimerInterval.current);
      recognitionRef.current?.abort?.();
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
    if (nowDone) startRestAfterSet(setIndex);
  }

  function firstOpenSetIndex(): number {
    for (let i = 0; i < active.sets; i++) {
      if (!logs[`${exercise.id}:${i}`]?.done) return i;
    }
    return active.sets - 1;
  }

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
  // sinon ou en cas d'échec, l'analyseur local parseVoiceEntry.
  async function interpretTranscript(
    transcript: string
  ): Promise<{ weightKg: number | null; reps: number | null }> {
    if (!hasOpenrouterKey) return parseVoiceEntry(transcript);
    try {
      const res = await fetch("/api/voice/parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transcript,
          exercise: active.name,
          targetReps: active.reps,
        }),
      });
      if (!res.ok) return parseVoiceEntry(transcript);
      const json = (await res.json()) as {
        weightKg?: number | null;
        reps?: number | null;
      };
      const weightKg = json.weightKg ?? null;
      const reps = json.reps ?? null;
      if (weightKg === null && reps === null) return parseVoiceEntry(transcript);
      return { weightKg, reps };
    } catch {
      return parseVoiceEntry(transcript);
    }
  }

  async function applyVoiceTranscript(transcript: string) {
    setVoiceMessage(`🤖 « ${transcript} » — interprétation…`);
    const { weightKg, reps } = await interpretTranscript(transcript);
    if (weightKg === null && reps === null) {
      setVoiceMessage(`« ${transcript} » — je n'ai pas compris de nombres.`);
      return;
    }
    // La dictée ne fait que remplir les champs de la série en cours :
    // pas de validation ni de repos — l'utilisateur coche lui-même.
    const setIndex = firstOpenSetIndex();
    const key = `${exercise.id}:${setIndex}`;
    setLogs((prev) => {
      const cur = prev[key];
      const nextState: SetState = {
        weightKg: weightKg !== null ? String(weightKg) : cur?.weightKg ?? "",
        reps: reps !== null ? String(reps) : cur?.reps ?? "",
        done: cur?.done ?? false,
      };
      saveLog(exercise.id, setIndex, nextState, activeVariationName);
      setVoiceMessage(
        `Série ${setIndex + 1} remplie : ${nextState.weightKg || "?"} kg × ${nextState.reps || "?"} reps — coche-la quand c'est fait.`
      );
      return { ...prev, [key]: nextState };
    });
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
  const setElapsed =
    setClock.key === currentSetKey
      ? setClock.base +
        (setClock.anchorMs != null && nowMs != null
          ? Math.max(0, Math.floor((nowMs - setClock.anchorMs) / 1000))
          : 0)
      : 0;
  const setRemaining = setSecondsOf(active) - setElapsed;

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
          <span className="text-sm">💪</span>
          {active.muscles.map((m) => (
            <span
              key={m}
              className="rounded-full bg-surface-2 px-3 py-1.5 text-[12.5px] font-semibold text-muted-2"
            >
              {m}
            </span>
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
              >
                🔄{exercise.options.length > 1 ? "" : " Remplacer"}
              </Chip>
            )}
          </div>
          {exercise.options.length > 1 && (
            <p className="mt-1.5 text-xs text-muted">
              🔁 Rotation auto — ce passage :{" "}
              {String.fromCharCode(65 + exercise.autoIndex)}
            </p>
          )}
        </div>
      )}

      {active.suggestion ? (
        <div className="rounded-xl bg-accent/10 px-3.5 py-2.5">
          <p className="text-sm font-extrabold text-accent">
            🎯 Objectif : {active.sets} × {active.reps} @{" "}
            {active.suggestion.suggestion} kg
          </p>
          <p className="mt-0.5 text-xs font-semibold text-accent/80">
            Dernière fois : {active.suggestion.lastWeight} kg —{" "}
            {active.suggestion.suggestion > active.suggestion.lastWeight
              ? "toutes les séries au max, on charge +2,5 kg 💪"
              : "consolide cette charge"}
          </p>
        </div>
      ) : (
        active.weightHint && (
          <p className="text-sm text-muted-2">⚖️ {active.weightHint}</p>
        )
      )}
      {active.notes && (
        <p className="rounded-xl bg-surface-2 px-3.5 py-2.5 text-[13px] leading-relaxed text-muted-2">
          💡 {active.notes}
        </p>
      )}
      </div>

      <div className="flex flex-col gap-4">
      <section className="flex flex-col gap-2">
        {Array.from({ length: active.sets }, (_, i) => {
          const key = `${exercise.id}:${i}`;
          return (
            <SetRow
              key={key}
              index={i}
              state={logs[key]}
              prev={active.previousLogs.find((l) => l.setIndex === i)}
              isCurrent={i === currentSetIdx && !logs[key].done}
              duration={exerciseDuration}
              timerLeft={setTimer?.setIndex === i ? setTimer.left : null}
              timerBusy={setTimer !== null}
              onToggle={() => toggleDone(i)}
              onWeightChange={(v) =>
                patchSet(exercise.id, i, { weightKg: v })
              }
              onRepsChange={(v) => patchSet(exercise.id, i, { reps: v })}
              onBlurSave={() =>
                saveLog(exercise.id, i, logs[key], activeVariationName)
              }
              onStartTimer={() => startSetTimer(i)}
              onStopTimer={stopSetTimer}
            />
          );
        })}
      </section>

      {voiceInput && (
        <div className="flex flex-col items-center gap-2 py-1">
          <button
            onClick={startVoice}
            disabled={listening}
            className={`flex h-[72px] w-[72px] items-center justify-center rounded-full border-2 text-[28px] ${
              listening
                ? "recording border-accent bg-accent/20"
                : "border-accent/50 bg-accent/10"
            }`}
            aria-label="Dicter poids et répétitions"
          >
            🎤
          </button>
          <p className="text-center text-[13px] text-muted-2">
            {listening
              ? "Je t'écoute… dis par ex. « 80 kilos 10 répétitions »"
              : "« 62 kilos, 11 répétitions »"}
          </p>
          {voiceMessage && (
            <p className="text-center text-sm font-semibold text-accent">
              {voiceMessage}
            </p>
          )}
        </div>
      )}

      <div className="flex gap-2">
        <button
          onClick={() => goTo(current - 1)}
          disabled={current === 0}
          className={btn("outline", "lg", "flex-1 text-muted-2")}
        >
          ← Précédent
        </button>
        {current < exercises.length - 1 ? (
          <button
            onClick={() => goTo(current + 1)}
            className={btn("primary", "lg", "flex-1")}
          >
            Suivant →
          </button>
        ) : (
          <button
            onClick={finishSession}
            className={btn("primary", "lg", "flex-1")}
          >
            🏁 Terminer
          </button>
        )}
      </div>

      {current < exercises.length - 1 && (
        <button
          onClick={finishSession}
          className="text-sm font-semibold text-muted"
        >
          Terminer la séance maintenant
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
    </main>
  );
}
