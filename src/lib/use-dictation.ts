"use client";

// Dictée d'un champ de texte libre.
//
// Deux chemins, comme la dictée de séance (WorkoutPlayer) : le modèle vocal
// via OpenRouter quand une clé existe, sinon la reconnaissance du navigateur.
//
// WorkoutPlayer n'est volontairement PAS réécrit par-dessus ce hook : sa
// dictée fait davantage que transcrire (elle interprète des séries chiffrées),
// sa fenêtre de 15 s est calibrée sur « soixante-deux kilos onze reps », et
// c'est le chemin critique d'une séance en cours. La convergence des deux est
// un chantier à part, à décider une fois ce hook éprouvé.

import { useCallback, useEffect, useRef, useState } from "react";
import { blobToWavBase64 } from "@/lib/audio";

export type DictationState = "idle" | "recording" | "transcribing";

// Une description de repas se dicte plus longuement qu'une série.
const MAX_MS = 30_000;
// En deçà, l'enregistrement ne contient que du silence.
const MIN_BLOB_BYTES = 1000;

type SpeechRecognitionLike = {
  lang: string;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  onresult: ((e: { results: { 0: { 0: { transcript: string } } } }) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
};

function speechRecognitionCtor(): (new () => SpeechRecognitionLike) | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: new () => SpeechRecognitionLike;
    webkitSpeechRecognition?: new () => SpeechRecognitionLike;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function useDictation(opts: {
  /** Reçoit le texte transcrit ; l'appelant décide où l'insérer. */
  onText: (text: string) => void;
  /** Sans clé OpenRouter, on passe directement à la dictée du navigateur. */
  hasAiKey: boolean;
}) {
  const { onText, hasAiKey } = opts;
  const [state, setState] = useState<DictationState>("idle");
  const [message, setMessage] = useState<string | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const autoStopRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  // onText change à chaque rendu du parent : le garder dans une ref évite de
  // recréer les callbacks (et donc d'interrompre un enregistrement en cours).
  // Mise à jour après rendu, jamais pendant : la ref n'est lue que dans des
  // callbacks asynchrones.
  const onTextRef = useRef(onText);
  useEffect(() => {
    onTextRef.current = onText;
  });

  const supported =
    typeof window !== "undefined" &&
    (Boolean(navigator.mediaDevices?.getUserMedia) ||
      speechRecognitionCtor() !== null);

  const clearAutoStop = useCallback(() => {
    if (autoStopRef.current) {
      clearTimeout(autoStopRef.current);
      autoStopRef.current = null;
    }
  }, []);

  const transcribe = useCallback(async (blob: Blob) => {
    setState("transcribing");
    setMessage("Transcription…");
    try {
      const wav = await blobToWavBase64(blob);
      const res = await fetch("/api/voice/transcribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ audio: wav }),
      });
      if (!res.ok) throw new Error("transcribe");
      const json = (await res.json()) as { text?: string };
      const text = (json.text ?? "").trim();
      if (!text) {
        setMessage("Je n'ai rien compris. Réessaie.");
      } else {
        onTextRef.current(text);
        setMessage(null);
      }
    } catch {
      setMessage("Transcription impossible. Écris à la main.");
    } finally {
      setState("idle");
    }
  }, []);

  const startBrowserDictation = useCallback(() => {
    const Ctor = speechRecognitionCtor();
    if (!Ctor) {
      setMessage("La dictée n'est pas disponible sur ce navigateur.");
      return;
    }
    const recognition = new Ctor();
    recognitionRef.current = recognition;
    recognition.lang = "fr-FR";
    recognition.interimResults = false;
    recognition.onresult = (e) => {
      const text = e.results[0][0].transcript.trim();
      if (text) onTextRef.current(text);
      setMessage(null);
    };
    recognition.onerror = () => setMessage("Je n'ai rien compris. Réessaie.");
    recognition.onend = () => {
      recognitionRef.current = null;
      setState("idle");
    };
    recognition.start();
    setState("recording");
    setMessage("J'écoute…");
  }, []);

  const stopRecording = useCallback(() => {
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== "inactive") recorder.stop();
  }, []);

  const startRecording = useCallback(async (): Promise<boolean> => {
    if (
      typeof MediaRecorder === "undefined" ||
      !navigator.mediaDevices?.getUserMedia
    ) {
      return false;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      recorderRef.current = recorder;
      chunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        recorderRef.current = null;
        clearAutoStop();
        const blob = new Blob(chunksRef.current, {
          type: recorder.mimeType || "audio/webm",
        });
        if (blob.size < MIN_BLOB_BYTES) {
          setState("idle");
          setMessage("Je n'ai rien entendu. Réessaie.");
          return;
        }
        void transcribe(blob);
      };
      recorder.start();
      setState("recording");
      setMessage("J'écoute… appuie à nouveau pour terminer.");
      autoStopRef.current = setTimeout(stopRecording, MAX_MS);
      return true;
    } catch {
      // micro refusé ou indisponible : repli sur la dictée du navigateur
      return false;
    }
  }, [clearAutoStop, stopRecording, transcribe]);

  /** Un appui démarre l'écoute, un second la termine. */
  const toggle = useCallback(async () => {
    if (recorderRef.current) {
      stopRecording();
      return;
    }
    if (state !== "idle") return;
    setMessage(null);
    if (hasAiKey && (await startRecording())) return;
    startBrowserDictation();
  }, [hasAiKey, startBrowserDictation, startRecording, state, stopRecording]);

  // Démontage en cours d'écoute (feuille refermée) : on coupe le micro.
  useEffect(() => {
    return () => {
      clearAutoStop();
      recognitionRef.current?.stop();
      const recorder = recorderRef.current;
      if (recorder && recorder.state !== "inactive") recorder.stop();
    };
  }, [clearAutoStop]);

  return { state, message, supported, toggle };
}
