import { execFile } from "child_process";
import { promisify } from "util";
import { stat } from "fs/promises";
import path from "path";
import { prisma } from "@/lib/prisma";
import { ensureMediaDir } from "@/lib/media-store";

const run = promisify(execFile);

// Normalise une URL YouTube (watch, youtu.be, shorts) vers sa forme
// canonique ; null si ce n'est pas une vidéo YouTube.
export function parseYouTubeUrl(raw: string): string | null {
  try {
    const url = new URL(raw.trim());
    const host = url.hostname.replace(/^(www\.|m\.)/, "");
    if (host === "youtu.be") {
      const id = url.pathname.slice(1).split("/")[0];
      return /^[\w-]{6,}$/.test(id)
        ? `https://www.youtube.com/watch?v=${id}`
        : null;
    }
    if (host === "youtube.com" || host === "music.youtube.com") {
      const v = url.searchParams.get("v");
      if (url.pathname === "/watch" && v && /^[\w-]{6,}$/.test(v)) {
        return `https://www.youtube.com/watch?v=${v}`;
      }
      const shorts = url.pathname.match(/^\/shorts\/([\w-]{6,})/);
      if (shorts) return `https://www.youtube.com/watch?v=${shorts[1]}`;
    }
    return null;
  } catch {
    return null;
  }
}

// Titre de la vidéo via l'endpoint oEmbed public (sans clé API) — best
// effort : null en cas d'échec, le téléchargement n'en dépend pas.
export async function fetchYouTubeTitle(url: string): Promise<string | null> {
  try {
    const res = await fetch(
      `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`,
      { signal: AbortSignal.timeout(5000) }
    );
    if (!res.ok) return null;
    const json = await res.json();
    return typeof json?.title === "string" ? json.title.slice(0, 200) : null;
  } catch {
    return null;
  }
}

// Défi anti-robot de YouTube (« Sign in to confirm you're not a bot ») :
// fréquent depuis une IP de serveur, se contourne avec des cookies de
// session ou un client de lecture moins contrôlé.
const BOT_CHECK = /sign in to confirm|not a bot/i;

// Fichier de cookies YouTube (export au format Netscape) : chemin
// YTDLP_COOKIES s'il est défini, sinon <média>/cookies/cookies.txt — un
// sous-dossier du volume média, jamais servi par /api/media/[file] (la
// route refuse les noms contenant « / »). null si aucun fichier présent.
async function findCookiesFile(mediaDir: string): Promise<string | null> {
  const candidates = [
    process.env.YTDLP_COOKIES?.trim() || null,
    path.join(mediaDir, "cookies", "cookies.txt"),
  ].filter((p): p is string => p !== null);
  for (const candidate of candidates) {
    try {
      await stat(candidate);
      return candidate;
    } catch {
      // absent : candidat suivant
    }
  }
  return null;
}

// Télécharge la vidéo en arrière-plan avec yt-dlp (≤ 720p, mp4 fusionné par
// ffmpeg) directement dans le volume média, puis passe la ligne
// MovementVideo à ready/failed. À appeler en fire & forget.
export async function downloadMovementVideo(
  videoId: string,
  sourceUrl: string
): Promise<void> {
  const fileName = `yt-${videoId}.mp4`;
  try {
    const dir = await ensureMediaDir();
    const target = path.join(dir, fileName);
    const cookies = await findCookiesFile(dir);
    const args = [
      "--no-playlist",
      "--no-progress",
      "-f",
      "bv*[ext=mp4][height<=720]+ba[ext=m4a]/b[ext=mp4][height<=720]/b[height<=720]/b",
      "--merge-output-format",
      "mp4",
      ...(cookies ? ["--cookies", cookies] : []),
      "-o",
      target,
      sourceUrl,
    ];
    const opts = { timeout: 15 * 60 * 1000, maxBuffer: 10 * 1024 * 1024 };
    try {
      await run("yt-dlp", args, opts);
    } catch (e) {
      // Défi anti-robot : second essai via le client « android_vr », que
      // YouTube ne soumet pas à cette vérification (qualité moindre, ~360p,
      // mais suffisante pour une vidéo de démonstration).
      if (!(e instanceof Error) || !BOT_CHECK.test(e.message)) throw e;
      await run(
        "yt-dlp",
        ["--extractor-args", "youtube:player_client=android_vr", ...args],
        opts
      );
    }
    await stat(target); // le fichier doit exister à la fin
    await prisma.movementVideo.update({
      where: { id: videoId },
      data: {
        status: "ready",
        videoUrl: `/api/media/${fileName}`,
        error: null,
      },
    });
  } catch (e) {
    // Extrait la ligne ERROR de yt-dlp si présente (message exploitable).
    const raw = e instanceof Error ? e.message : "échec du téléchargement";
    let message =
      raw
        .split("\n")
        .filter((l) => l.includes("ERROR"))
        .pop() ?? raw;
    if (BOT_CHECK.test(message)) {
      message =
        "YouTube exige une vérification anti-robot depuis ce serveur. " +
        "Dépose un export de cookies YouTube (format Netscape) dans " +
        "data/media/cookies/cookies.txt — ou pointe YTDLP_COOKIES vers ce " +
        "fichier — puis réessaie.";
    }
    await prisma.movementVideo
      .update({
        where: { id: videoId },
        data: { status: "failed", error: message.slice(0, 300) },
      })
      .catch(() => {
        // ligne supprimée entre-temps : rien à signaler
      });
  }
}
