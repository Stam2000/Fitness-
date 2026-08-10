const KIE_BASE = "https://api.kie.ai/api/v1";

export type KieTaskState = "waiting" | "queuing" | "generating" | "success" | "fail";

export function buildEquipmentImagePrompt(
  equipmentName: string,
  category: string
): string {
  return `Product illustration of fitness equipment: "${equipmentName}" (category: ${category}). Single piece of gym equipment centered on a dark navy background (#0b0f14), modern flat illustration style with lime green (#a3e635) accents, subtle soft shadow, no people, no text, no watermark.`;
}

export function buildExerciseImagePrompt(
  exerciseName: string,
  equipment: string[]
): string {
  const withEquipment =
    equipment.length > 0 ? ` using ${equipment.join(" and ")}` : "";
  return `Clean fitness illustration of the exercise "${exerciseName}"${withEquipment}. An athletic person demonstrating perfect form at the key moment of the movement, side view, modern flat illustration style with a dark navy background (#0b0f14) and lime green (#a3e635) accents, gym setting, no text, no watermark.`;
}

// Prompt vidéo de secours quand aucune clé OpenRouter n'est configurée pour
// générer un prompt détaillé du mouvement.
export function buildExerciseVideoPrompt(
  exerciseName: string,
  equipment: string[]
): string {
  const withEquipment =
    equipment.length > 0 ? ` using ${equipment.join(" and ")}` : "";
  return `Fitness demonstration video of the exercise "${exerciseName}"${withEquipment}. An athletic coach performs 2-3 slow, controlled repetitions with perfect textbook form in a modern gym, filmed from a stable side angle that clearly shows the full range of motion, soft even lighting, no text, no watermark.`;
}

export async function createVideoTask(
  prompt: string,
  apiKey: string,
  options?: { aspectRatio?: "16:9" | "9:16" | "1:1"; duration?: number }
): Promise<string> {
  const res = await fetch(`${KIE_BASE}/jobs/createTask`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "bytedance/seedance-2-5",
      input: {
        prompt,
        aspect_ratio: options?.aspectRatio ?? "16:9",
        resolution: "720p",
        duration: options?.duration ?? 8,
        generate_audio: false,
      },
    }),
  });
  const json = await res.json().catch(() => null);
  if (!res.ok || !json || json.code !== 200 || !json.data?.taskId) {
    throw new Error(
      `Kie.ai createTask a échoué (${res.status}): ${json?.msg ?? json?.message ?? "réponse inattendue"}`
    );
  }
  return json.data.taskId as string;
}

export async function createImageTask(
  prompt: string,
  apiKey: string,
  aspectRatio: "3:2" | "1:1" = "3:2"
): Promise<string> {
  const res = await fetch(`${KIE_BASE}/jobs/createTask`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-image-2-text-to-image",
      input: {
        prompt,
        aspect_ratio: aspectRatio,
      },
    }),
  });
  const json = await res.json().catch(() => null);
  if (!res.ok || !json || json.code !== 200 || !json.data?.taskId) {
    throw new Error(
      `Kie.ai createTask a échoué (${res.status}): ${json?.msg ?? json?.message ?? "réponse inattendue"}`
    );
  }
  return json.data.taskId as string;
}

// Le format de résultat (resultJson.resultUrls) est le même pour toutes les
// tâches Kie.ai, images comme vidéos.
export async function getImageTaskResult(
  taskId: string,
  apiKey: string
): Promise<{ state: KieTaskState; url?: string; error?: string }> {
  const res = await fetch(
    `${KIE_BASE}/jobs/recordInfo?taskId=${encodeURIComponent(taskId)}`,
    { headers: { Authorization: `Bearer ${apiKey}` }, cache: "no-store" }
  );
  const json = await res.json().catch(() => null);
  if (!res.ok || !json || json.code !== 200) {
    throw new Error(`Kie.ai recordInfo a échoué (${res.status})`);
  }

  const data = json.data ?? {};
  const state = (data.state ?? "waiting") as KieTaskState;

  if (state === "fail") {
    return { state, error: data.failMsg ?? data.failCode ?? "échec de génération" };
  }
  if (state !== "success") {
    return { state };
  }

  let urls: string[] = [];
  try {
    const result =
      typeof data.resultJson === "string"
        ? JSON.parse(data.resultJson)
        : data.resultJson ?? {};
    urls = result?.resultUrls ?? result?.result_urls ?? [];
  } catch {
    urls = [];
  }
  if (urls.length === 0) {
    return { state: "fail", error: "aucun média dans le résultat" };
  }
  return { state: "success", url: urls[0] };
}

export const getVideoTaskResult = getImageTaskResult;
