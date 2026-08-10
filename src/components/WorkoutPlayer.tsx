"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { abandonSession, setSessionVariation } from "@/app/actions";

// Une « option » d'exercice : l'exercice de base (index 0) ou une variante,
// avec ses propres données d'historique (suggestion, dernières perfs, record).
type VariantView = {
  name: string;
  sets: number;
  reps: string;
  restSeconds: number;
  weightHint: string | null;
  equipment: string[];
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
};

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
      for (let i = 0; i < maxSets; i++) {
        const existing = initialLogs.find(
          (l) => l.exerciseId === ex.id && l.setIndex === i
        );
        map[`${ex.id}:${i}`] = {
          reps: existing?.reps != null ? String(existing.reps) : "",
          weightKg: existing?.weightKg != null ? String(existing.weightKg) : "",
          done: existing?.done ?? false,
        };
      }
    }
    return map;
  });
  const [restLeft, setRestLeft] = useState<number | null>(null);
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
    const isLastSet = setIndex === active.sets - 1;
    const isLastExercise = current === exercises.length - 1;
    if (!(isLastSet && isLastExercise)) startRest(active.restSeconds);
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
    if (nowDone) {
      const isLastSet = setIndex === active.sets - 1;
      const isLastExercise = current === exercises.length - 1;
      if (!(isLastSet && isLastExercise)) {
        startRest(active.restSeconds);
      }
    }
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
      const { weightKg, reps } = parseVoiceEntry(transcript);
      if (weightKg === null && reps === null) {
        setVoiceMessage(`« ${transcript} » — je n'ai pas compris de nombres.`);
        return;
      }
      const setIndex = firstOpenSetIndex();
      const key = `${exercise.id}:${setIndex}`;
      const nextState: SetState = {
        weightKg: weightKg !== null ? String(weightKg) : logs[key]?.weightKg ?? "",
        reps: reps !== null ? String(reps) : logs[key]?.reps ?? "",
        done: true,
      };
      setLogs((prev) => ({ ...prev, [key]: nextState }));
      saveLog(exercise.id, setIndex, nextState, activeVariationName);
      setVoiceMessage(
        `✓ Série ${setIndex + 1} : ${nextState.weightKg || "?"} kg × ${nextState.reps || "?"} reps`
      );
      const isLastSet = setIndex === active.sets - 1;
      const isLastExercise = current === exercises.length - 1;
      if (!(isLastSet && isLastExercise)) startRest(active.restSeconds);
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
    setCurrent(index);
    const o = activeOf(exercises[index]);
    speak(
      `${o.name}. ${o.sets} séries de ${o.reps}${o.weightHint ? `. ${o.weightHint}` : ""}.`
    );
  }

  async function finishSession() {
    if (restInterval.current) clearInterval(restInterval.current);
    setRestLeft(null);
    try {
      await fetch(`/api/sessions/${sessionId}/complete`, { method: "POST" });
    } catch {
      // le résumé s'affiche quand même, la séance restera « en cours »
    }
    speak("Bravo, séance terminée !");
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
    return (
      <main className="flex min-h-[70vh] flex-col items-center justify-center gap-4 text-center">
        <p className="text-6xl">🎉</p>
        <h1 className="text-2xl font-bold">Séance terminée !</h1>
        <p className="text-muted">
          {programName} — {dayName}
        </p>
        <div className="flex gap-3">
          <div className="rounded-2xl border border-border bg-surface px-5 py-4">
            <p className="text-2xl font-bold text-accent">{doneSets.length}</p>
            <p className="text-xs text-muted">séries faites</p>
          </div>
          <div className="rounded-2xl border border-border bg-surface px-5 py-4">
            <p className="text-2xl font-bold text-accent">
              {Math.round(volume)}
            </p>
            <p className="text-xs text-muted">kg soulevés (volume)</p>
          </div>
        </div>
        {prs.length > 0 && (
          <div className="w-full rounded-2xl border border-accent/40 bg-accent/10 p-4 text-left">
            <p className="text-sm font-semibold text-accent">
              ★ Nouveau record personnel !
            </p>
            {prs.map((pr) => (
              <p key={pr.name} className="mt-1 text-sm">
                {pr.name} : <span className="font-semibold">{pr.weight} kg</span>
                {pr.previous != null && (
                  <span className="text-muted"> (avant : {pr.previous} kg)</span>
                )}
              </p>
            ))}
          </div>
        )}

        {hasOpenrouterKey && (
          <div className="w-full">
            {feedback ? (
              <div className="rounded-2xl border border-border bg-surface p-4 text-left">
                <p className="text-sm font-semibold text-accent">
                  🤖 Analyse du coach
                </p>
                <p className="mt-2 whitespace-pre-line text-sm text-muted">
                  {feedback}
                </p>
              </div>
            ) : (
              <button
                onClick={loadFeedback}
                disabled={feedbackLoading}
                className="w-full rounded-xl border border-accent/50 bg-accent/10 py-3 text-sm font-semibold text-accent disabled:opacity-60"
              >
                {feedbackLoading
                  ? "🤖 Le coach analyse ta séance…"
                  : "🤖 Demander l'analyse du coach"}
              </button>
            )}
            {feedbackError && (
              <p className="mt-2 text-sm text-danger">{feedbackError}</p>
            )}
          </div>
        )}

        <div className="mt-4 flex flex-col gap-2">
          <Link
            href="/history"
            className="rounded-xl bg-accent px-6 py-3 font-semibold text-black"
          >
            Voir l&apos;historique
          </Link>
          <Link href="/" className="px-6 py-2 text-sm text-muted">
            Retour à l&apos;accueil
          </Link>
        </div>
      </main>
    );
  }

  const totalSets = exercises.reduce((acc, ex) => acc + activeOf(ex).sets, 0);
  const doneCount = Object.values(logs).filter((s) => s.done).length;

  return (
    <main className="flex flex-col gap-4 pb-6">
      <header className="sticky top-0 z-30 -mx-4 flex items-center gap-3 border-b border-border bg-bg/95 px-4 py-3 backdrop-blur md:-mx-6 md:px-6 lg:-mx-8 lg:px-8">
        <button
          onClick={() => {
            if (confirm("Abandonner la séance ? Les saisies seront perdues.")) {
              abandonSession(sessionId);
            }
          }}
          className="text-sm text-muted"
        >
          ✕
        </button>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{dayName}</p>
          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-2">
            <div
              className="h-full rounded-full bg-accent transition-all"
              style={{ width: `${(doneCount / Math.max(totalSets, 1)) * 100}%` }}
            />
          </div>
        </div>
        <span className="text-xs text-muted">
          {doneCount}/{totalSets}
        </span>
      </header>

      {/* Deux colonnes sur grand écran : fiche exercice à gauche, saisie à droite */}
      <div className="flex flex-col gap-4 lg:grid lg:grid-cols-2 lg:items-start lg:gap-6">
      <div className="flex flex-col gap-4">
      {restLeft !== null && (
        <div className="rounded-2xl border border-accent/40 bg-accent/10 p-4 text-center">
          <p className="text-xs font-semibold uppercase tracking-wide text-accent">
            Repos
          </p>
          <p className="my-1 text-5xl font-bold tabular-nums">
            {Math.floor(restLeft / 60)}:{String(restLeft % 60).padStart(2, "0")}
          </p>
          <div className="flex justify-center gap-2">
            <button
              onClick={() => setRestLeft((r) => (r !== null ? r + 30 : r))}
              className="rounded-lg border border-border px-4 py-2 text-sm"
            >
              +30 s
            </button>
            <button
              onClick={() => {
                if (restInterval.current) clearInterval(restInterval.current);
                setRestLeft(null);
              }}
              className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-black"
            >
              Passer
            </button>
          </div>
        </div>
      )}

      {!warmupDone && (
        <div className="rounded-2xl border border-orange-400/40 bg-orange-400/10 p-4 text-center">
          {warmupLeft === null ? (
            <>
              <p className="text-sm font-semibold text-orange-300">
                🔥 Échauffement avant de commencer ?
              </p>
              <div className="mt-3 flex flex-wrap justify-center gap-2">
                {[2, 5, 10].map((min) => (
                  <button
                    key={min}
                    onClick={() => startWarmup(min * 60)}
                    className="rounded-lg border border-orange-400/40 px-4 py-2.5 text-sm font-semibold text-orange-300"
                  >
                    {min} min
                  </button>
                ))}
                {hasOpenrouterKey && (
                  <button
                    onClick={loadAiWarmup}
                    disabled={aiWarmupLoading}
                    className="rounded-lg border border-orange-400/40 px-4 py-2.5 text-sm font-semibold text-orange-300 disabled:opacity-50"
                  >
                    {aiWarmupLoading ? "🤖 Génération…" : "🤖 Sur mesure"}
                  </button>
                )}
                <button
                  onClick={skipWarmup}
                  className="rounded-lg border border-border px-4 py-2.5 text-sm text-muted"
                >
                  Passer
                </button>
              </div>
              {aiWarmupError && (
                <p className="mt-2 text-xs text-danger">{aiWarmupError}</p>
              )}
            </>
          ) : (
            <>
              <p className="text-xs font-semibold uppercase tracking-wide text-orange-300">
                🔥 Échauffement
              </p>
              <p className="my-1 text-5xl font-bold tabular-nums">
                {Math.floor(warmupLeft / 60)}:
                {String(warmupLeft % 60).padStart(2, "0")}
              </p>
              {aiWarmup && (
                <ul className="mx-auto mb-2 max-w-xs text-left text-sm text-muted">
                  {aiWarmup.map((m) => (
                    <li key={m.name} className="flex justify-between gap-2">
                      <span>{m.name}</span>
                      <span className="shrink-0 tabular-nums">{m.seconds} s</span>
                    </li>
                  ))}
                </ul>
              )}
              <div className="flex justify-center gap-2">
                <button
                  onClick={() => setWarmupLeft((w) => (w !== null ? w + 30 : w))}
                  className="rounded-lg border border-border px-4 py-2 text-sm"
                >
                  +30 s
                </button>
                <button
                  onClick={skipWarmup}
                  className="rounded-lg bg-orange-400 px-4 py-2 text-sm font-semibold text-black"
                >
                  Terminer
                </button>
              </div>
            </>
          )}
        </div>
      )}

      <section className="overflow-hidden rounded-2xl border border-border bg-surface">
        {active.videoUrl ? (
          // Démo du mouvement en boucle, muette pour ne pas gêner la séance.
          <video
            key={active.videoUrl}
            src={active.videoUrl}
            poster={active.imageUrl ?? undefined}
            autoPlay
            muted
            loop
            playsInline
            controls
            className="aspect-video w-full bg-black object-contain"
          />
        ) : active.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={active.imageUrl}
            alt={active.name}
            className="aspect-[3/2] w-full object-cover"
          />
        ) : null}
        <div className="p-4">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs text-muted">
              Exercice {current + 1}/{exercises.length}
            </p>
            {hasOpenrouterKey && (
              <button
                onClick={() => setShowSubstitute((v) => !v)}
                className="shrink-0 rounded-lg border border-border px-2.5 py-1 text-xs text-muted"
              >
                🔄 Remplacer
              </button>
            )}
          </div>
          <h1 className="mt-0.5 text-xl font-bold">{active.name}</h1>
          {exercise.options.length > 1 && (
            <div className="mt-2">
              <div className="flex flex-wrap gap-1.5">
                {exercise.options.map((o, oi) => (
                  <button
                    key={oi}
                    onClick={() => chooseVariant(exercise.id, oi)}
                    className={`rounded-full border px-3 py-1.5 text-xs ${
                      oi === activeIndexOf(exercise)
                        ? "border-accent bg-accent/15 text-accent"
                        : "border-border text-muted"
                    }`}
                  >
                    {String.fromCharCode(65 + oi)} · {o.name}
                  </button>
                ))}
              </div>
              <p className="mt-1 text-xs text-muted">
                🔁 Rotation auto — ce passage :{" "}
                {String.fromCharCode(65 + exercise.autoIndex)}
              </p>
            </div>
          )}
          {showSubstitute && (
            <div className="mt-2 rounded-xl bg-surface-2 p-3">
              <p className="text-xs font-semibold text-muted">
                Pourquoi remplacer cet exercice ?
              </p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {[
                  "Machine occupée",
                  "Douleur",
                  "Trop dur",
                  "Trop facile",
                ].map((r) => (
                  <button
                    key={r}
                    onClick={() =>
                      setSubstituteReason(substituteReason === r ? "" : r)
                    }
                    className={`rounded-full border px-3 py-1.5 text-xs ${
                      substituteReason === r
                        ? "border-accent bg-accent/15 text-accent"
                        : "border-border text-muted"
                    }`}
                  >
                    {r}
                  </button>
                ))}
              </div>
              <input
                value={
                  ["Machine occupée", "Douleur", "Trop dur", "Trop facile"].includes(
                    substituteReason
                  )
                    ? ""
                    : substituteReason
                }
                onChange={(e) => setSubstituteReason(e.target.value)}
                placeholder="Ou précise ta raison…"
                className="mt-2 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-accent"
              />
              {substituteError && (
                <p className="mt-2 text-xs text-danger">{substituteError}</p>
              )}
              <button
                onClick={substituteExercise}
                disabled={substituting}
                className="mt-2 w-full rounded-lg bg-accent py-2.5 text-sm font-semibold text-black disabled:opacity-50"
              >
                {substituting
                  ? "🤖 Recherche d'une alternative…"
                  : "Remplacer par une alternative IA"}
              </button>
            </div>
          )}
          <p className="mt-1 text-accent">
            {active.sets} × {active.reps}
            <span className="text-muted">
              {" "}
              · repos {active.restSeconds}s
            </span>
          </p>
          {active.weightHint && (
            <p className="mt-1 text-sm text-muted">⚖️ {active.weightHint}</p>
          )}
          {active.suggestion && (
            <p className="mt-1 rounded-lg bg-accent/10 px-2 py-1.5 text-sm text-accent">
              📊 Dernière fois : {active.suggestion.lastWeight} kg —{" "}
              {active.suggestion.suggestion > active.suggestion.lastWeight
                ? `essaie ${active.suggestion.suggestion} kg 💪`
                : "consolide cette charge"}
            </p>
          )}
          {active.equipment.length > 0 && (
            <p className="mt-1 text-sm text-muted">
              🏋️ {active.equipment.join(", ")}
            </p>
          )}
          {active.notes && (
            <p className="mt-2 rounded-lg bg-surface-2 p-2 text-sm text-muted">
              💡 {active.notes}
            </p>
          )}
        </div>
      </section>
      </div>

      <div className="flex flex-col gap-4">
      <section className="flex flex-col gap-2">
        {Array.from({ length: active.sets }, (_, i) => {
          const key = `${exercise.id}:${i}`;
          const state = logs[key];
          const prev = active.previousLogs.find((l) => l.setIndex === i);
          return (
            <div
              key={key}
              className={`flex items-center gap-2 rounded-xl border p-2.5 ${
                state.done
                  ? "border-accent/40 bg-accent/10"
                  : "border-border bg-surface"
              }`}
            >
              <button
                onClick={() => toggleDone(i)}
                className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full border text-lg font-bold ${
                  state.done
                    ? "border-accent bg-accent text-black"
                    : "border-border text-muted"
                }`}
                aria-label={`Série ${i + 1} ${state.done ? "faite" : "à faire"}`}
              >
                {state.done ? "✓" : i + 1}
              </button>
              <label className="flex min-w-0 flex-1 flex-col text-xs text-muted">
                Poids (kg)
                <input
                  type="number"
                  inputMode="decimal"
                  value={state.weightKg}
                  placeholder={
                    prev?.weightKg != null ? String(prev.weightKg) : "—"
                  }
                  onChange={(e) =>
                    patchSet(exercise.id, i, { weightKg: e.target.value })
                  }
                  onBlur={() =>
                    saveLog(exercise.id, i, logs[key], activeVariationName)
                  }
                  className="mt-0.5 w-full rounded-lg border border-border bg-surface-2 px-2 py-2.5 text-base text-ink outline-none focus:border-accent"
                />
              </label>
              {exerciseDuration !== null ? (
                <div className="flex min-w-0 flex-1 flex-col text-xs text-muted">
                  Durée
                  {setTimer?.setIndex === i ? (
                    <button
                      onClick={stopSetTimer}
                      className="mt-0.5 w-full rounded-lg border border-accent bg-accent/15 px-2 py-2.5 text-base font-bold tabular-nums text-accent"
                    >
                      {Math.floor(setTimer.left / 60)}:
                      {String(setTimer.left % 60).padStart(2, "0")} ■ Stop
                    </button>
                  ) : state.done ? (
                    <p className="mt-0.5 w-full rounded-lg border border-border bg-surface-2 px-2 py-2.5 text-base text-ink">
                      {state.reps || exerciseDuration} s ✓
                    </p>
                  ) : (
                    <button
                      onClick={() => startSetTimer(i)}
                      disabled={setTimer !== null}
                      className="mt-0.5 w-full rounded-lg border border-accent/50 bg-accent/10 px-2 py-2.5 text-base font-semibold text-accent disabled:opacity-40"
                    >
                      ▶ {exerciseDuration} s
                    </button>
                  )}
                </div>
              ) : (
                <label className="flex min-w-0 flex-1 flex-col text-xs text-muted">
                  Reps
                  <input
                    type="number"
                    inputMode="numeric"
                    value={state.reps}
                    placeholder={prev?.reps != null ? String(prev.reps) : "—"}
                    onChange={(e) =>
                      patchSet(exercise.id, i, { reps: e.target.value })
                    }
                    onBlur={() =>
                    saveLog(exercise.id, i, logs[key], activeVariationName)
                  }
                    className="mt-0.5 w-full rounded-lg border border-border bg-surface-2 px-2 py-2.5 text-base text-ink outline-none focus:border-accent"
                  />
                </label>
              )}
            </div>
          );
        })}
      </section>

      {voiceInput && (
        <div className="flex flex-col items-center gap-1.5">
          <button
            onClick={startVoice}
            disabled={listening}
            className={`flex h-16 w-16 items-center justify-center rounded-full border text-2xl ${
              listening
                ? "recording border-accent bg-accent/20"
                : "border-border bg-surface"
            }`}
            aria-label="Dicter poids et répétitions"
          >
            🎤
          </button>
          <p className="text-center text-xs text-muted">
            {listening
              ? "Je t'écoute… dis par ex. « 80 kilos 10 répétitions »"
              : "Dicte ta série au lieu de la saisir"}
          </p>
          {voiceMessage && (
            <p className="text-center text-sm text-accent">{voiceMessage}</p>
          )}
        </div>
      )}

      <div className="flex gap-2">
        <button
          onClick={() => goTo(current - 1)}
          disabled={current === 0}
          className="flex-1 rounded-xl border border-border py-3.5 font-semibold disabled:opacity-30"
        >
          ← Précédent
        </button>
        {current < exercises.length - 1 ? (
          <button
            onClick={() => goTo(current + 1)}
            className="flex-1 rounded-xl bg-accent py-3.5 font-semibold text-black"
          >
            Suivant →
          </button>
        ) : (
          <button
            onClick={finishSession}
            className="flex-1 rounded-xl bg-accent py-3.5 font-semibold text-black"
          >
            🏁 Terminer
          </button>
        )}
      </div>

      {current < exercises.length - 1 && (
        <button onClick={finishSession} className="text-sm text-muted">
          Terminer la séance maintenant
        </button>
      )}
      </div>
      </div>
    </main>
  );
}
