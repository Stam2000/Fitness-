// Client OpenRouter minimal partagé par les routes IA et l'assistant.

// Erreur portant un message destiné à l'utilisateur (et un statut HTTP
// suggéré) : les routes la traduisent en réponse JSON, les outils du chat en
// message d'erreur pour le modèle.
export class AiError extends Error {
  constructor(
    public userMessage: string,
    public status: number = 502
  ) {
    super(userMessage);
  }
}

export function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenced ? fenced[1] : text;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    throw new Error("Pas de JSON dans la réponse");
  }
  return JSON.parse(candidate.slice(start, end + 1));
}

export function openrouterHeaders(apiKey: string): Record<string, string> {
  return {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
    "HTTP-Referer": "https://github.com/Stam2000/fitness-",
    "X-Title": "Mon Coach Fitness",
  };
}

export type ChatCompletionOptions = {
  apiKey: string;
  model: string;
  messages: unknown[];
  temperature?: number;
  tools?: unknown[];
  stream?: boolean;
  signal?: AbortSignal;
};

// Appel brut : renvoie la Response (utile en streaming). Ne jette que sur
// erreur réseau ; le statut HTTP est à vérifier côté appelant.
export async function chatCompletion(
  opts: ChatCompletionOptions
): Promise<Response> {
  return fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: openrouterHeaders(opts.apiKey),
    body: JSON.stringify({
      model: opts.model,
      messages: opts.messages,
      ...(opts.temperature != null ? { temperature: opts.temperature } : {}),
      ...(opts.tools ? { tools: opts.tools } : {}),
      ...(opts.stream ? { stream: true } : {}),
    }),
    signal: opts.signal,
  });
}

// Appel non-streaming : renvoie directement le texte de la réponse du modèle,
// avec les mêmes messages d'erreur que les routes IA historiques.
export async function chatCompletionText(
  opts: Omit<ChatCompletionOptions, "stream" | "tools">
): Promise<string> {
  const res = await chatCompletion(opts);
  if (!res.ok) {
    throw new AiError(`Erreur OpenRouter (${res.status})`);
  }
  const json = await res.json();
  const content: string | undefined = json?.choices?.[0]?.message?.content;
  if (!content) {
    throw new AiError("Réponse vide du modèle.");
  }
  return content;
}
