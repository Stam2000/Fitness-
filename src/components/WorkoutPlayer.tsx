"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { abandonSession } from "@/app/actions";

type ExerciseView = {
  id: string;
  name: string;
  sets: number;
  reps: string;
  restSeconds: number;
  weightHint: string | null;
  equipment: string[];
  notes: string | null;
  imageUrl: string | null;
};

type LogEntry = {
  exerciseId: string;
  setIndex: number;
  reps: number | null;
  weightKg: number | null;
  done: boolean;
};

type SetState = { reps: string; weightKg: string; done: boolean };

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
  previousLogs,
  voiceInput,
  voiceAnnounce,
  suggestions,
  historicalMax,
  hasOpenrouterKey,
}: {
  sessionId: string;
  programName: string;
  dayName: string;
  completed: boolean;
  exercises: ExerciseView[];
  initialLogs: LogEntry[];
  previousLogs: LogEntry[];
  voiceInput: boolean;
  voiceAnnounce: boolean;
  suggestions: Record<string, { lastWeight: number; suggestion: number }>;
  historicalMax: Record<string, number>;
  hasOpenrouterKey: boolean;
}) {
  const [current, setCurrent] = useState(() => {
    // Reprendre au premier exercice incomplet.
    for (let i = 0; i < exercises.length; i++) {
      const ex = exercises[i];
      const doneCount = initialLogs.filter(
        (l) => l.exerciseId === ex.id && l.done
      ).length;
      if (doneCount < ex.sets) return i;
    }
    return 0;
  });
  const [logs, setLogs] = useState<Record<string, SetState>>(() => {
    const map: Record<string, SetState> = {};
    for (const ex of exercises) {
      for (let i = 0; i < ex.sets; i++) {
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
  const [finished, setFinished] = useState(completed);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [feedbackLoading, setFeedbackLoading] = useState(false);
  const [feedbackError, setFeedbackError] = useState<string | null>(null);
  const [listening, setListening] = useState(false);
  const [voiceMessage, setVoiceMessage] = useState<string | null>(null);
  const restInterval = useRef<ReturnType<typeof setInterval> | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null);

  const exercise = exercises[current];

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
    (exerciseId: string, setIndex: number, state: SetState) => {
      fetch(`/api/sessions/${sessionId}/logs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          exerciseId,
          setIndex,
          reps: state.reps === "" ? null : parseInt(state.reps, 10),
          weightKg: state.weightKg === "" ? null : parseFloat(state.weightKg),
          done: state.done,
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
      recognitionRef.current?.abort?.();
    };
  }, []);

  function patchSet(
    exerciseId: string,
    setIndex: number,
    patch: Partial<SetState>,
    save = false
  ) {
    setLogs((prev) => {
      const key = `${exerciseId}:${setIndex}`;
      const next = { ...prev, [key]: { ...prev[key], ...patch } };
      if (save) saveLog(exerciseId, setIndex, next[key]);
      return next;
    });
  }

  function toggleDone(setIndex: number) {
    const key = `${exercise.id}:${setIndex}`;
    const state = logs[key];
    const nowDone = !state.done;
    patchSet(exercise.id, setIndex, { done: nowDone }, true);
    if (nowDone) {
      const isLastSet = setIndex === exercise.sets - 1;
      const isLastExercise = current === exercises.length - 1;
      if (!(isLastSet && isLastExercise)) {
        startRest(exercise.restSeconds);
      }
    }
  }

  function firstOpenSetIndex(): number {
    for (let i = 0; i < exercise.sets; i++) {
      if (!logs[`${exercise.id}:${i}`]?.done) return i;
    }
    return exercise.sets - 1;
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
      saveLog(exercise.id, setIndex, nextState);
      setVoiceMessage(
        `✓ Série ${setIndex + 1} : ${nextState.weightKg || "?"} kg × ${nextState.reps || "?"} reps`
      );
      const isLastSet = setIndex === exercise.sets - 1;
      const isLastExercise = current === exercises.length - 1;
      if (!(isLastSet && isLastExercise)) startRest(exercise.restSeconds);
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
    const ex = exercises[index];
    speak(
      `${ex.name}. ${ex.sets} séries de ${ex.reps}${ex.weightHint ? `. ${ex.weightHint}` : ""}.`
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
    // Records personnels battus pendant cette séance.
    const prs = exercises
      .map((ex) => {
        const sessionMax = Array.from({ length: ex.sets }, (_, i) =>
          logs[`${ex.id}:${i}`]
        )
          .filter((s) => s?.done)
          .reduce((acc, s) => {
            const w = parseFloat(s.weightKg);
            return isNaN(w) ? acc : Math.max(acc, w);
          }, 0);
        const previous = historicalMax[ex.id];
        return sessionMax > 0 && (previous == null || sessionMax > previous)
          ? { name: ex.name, weight: sessionMax, previous: previous ?? null }
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

  const totalSets = exercises.reduce((acc, ex) => acc + ex.sets, 0);
  const doneCount = Object.values(logs).filter((s) => s.done).length;

  return (
    <main className="flex flex-col gap-4 pb-6">
      <header className="sticky top-0 z-30 -mx-4 flex items-center gap-3 border-b border-border bg-bg/95 px-4 py-3 backdrop-blur">
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

      <section className="overflow-hidden rounded-2xl border border-border bg-surface">
        {exercise.imageUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={exercise.imageUrl}
            alt={exercise.name}
            className="aspect-[3/2] w-full object-cover"
          />
        )}
        <div className="p-4">
          <p className="text-xs text-muted">
            Exercice {current + 1}/{exercises.length}
          </p>
          <h1 className="mt-0.5 text-xl font-bold">{exercise.name}</h1>
          <p className="mt-1 text-accent">
            {exercise.sets} × {exercise.reps}
            <span className="text-muted">
              {" "}
              · repos {exercise.restSeconds}s
            </span>
          </p>
          {exercise.weightHint && (
            <p className="mt-1 text-sm text-muted">⚖️ {exercise.weightHint}</p>
          )}
          {suggestions[exercise.id] && (
            <p className="mt-1 rounded-lg bg-accent/10 px-2 py-1.5 text-sm text-accent">
              📊 Dernière fois : {suggestions[exercise.id].lastWeight} kg —{" "}
              {suggestions[exercise.id].suggestion >
              suggestions[exercise.id].lastWeight
                ? `essaie ${suggestions[exercise.id].suggestion} kg 💪`
                : "consolide cette charge"}
            </p>
          )}
          {exercise.equipment.length > 0 && (
            <p className="mt-1 text-sm text-muted">
              🏋️ {exercise.equipment.join(", ")}
            </p>
          )}
          {exercise.notes && (
            <p className="mt-2 rounded-lg bg-surface-2 p-2 text-sm text-muted">
              💡 {exercise.notes}
            </p>
          )}
        </div>
      </section>

      <section className="flex flex-col gap-2">
        {Array.from({ length: exercise.sets }, (_, i) => {
          const key = `${exercise.id}:${i}`;
          const state = logs[key];
          const prev = previousLogs.find(
            (l) => l.exerciseId === exercise.id && l.setIndex === i
          );
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
                  onBlur={() => saveLog(exercise.id, i, logs[key])}
                  className="mt-0.5 w-full rounded-lg border border-border bg-surface-2 px-2 py-2.5 text-base text-ink outline-none focus:border-accent"
                />
              </label>
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
                  onBlur={() => saveLog(exercise.id, i, logs[key])}
                  className="mt-0.5 w-full rounded-lg border border-border bg-surface-2 px-2 py-2.5 text-base text-ink outline-none focus:border-accent"
                />
              </label>
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
    </main>
  );
}
