import { createHash } from "crypto";
import { mkdir, readFile, unlink, writeFile } from "fs/promises";
import path from "path";

// Répertoire persistant des médias rapatriés (les URLs Kie.ai expirent au
// bout de quelques jours). En Docker/Coolify : monter un volume sur ce
// dossier (par défaut /app/data/media) ou le surcharger via MEDIA_DIR.
const MEDIA_DIR =
  process.env.MEDIA_DIR ?? path.join(process.cwd(), "data", "media");

const EXT_BY_TYPE: Record<string, string> = {
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/webp": ".webp",
  "image/gif": ".gif",
  "video/mp4": ".mp4",
  "video/webm": ".webm",
};

export const TYPE_BY_EXT: Record<string, string> = Object.fromEntries(
  Object.entries(EXT_BY_TYPE).map(([type, ext]) => [ext, type])
);

// Télécharge un média distant (URL Kie.ai à durée de vie limitée) et l'écrit
// dans le dossier persistant. Renvoie l'URL locale « /api/media/<fichier> »,
// ou l'URL d'origine si le rapatriement échoue — jamais bloquant : mieux vaut
// une URL temporaire qu'une génération perdue.
export async function persistMediaUrl(remoteUrl: string): Promise<string> {
  if (!/^https?:\/\//i.test(remoteUrl)) return remoteUrl; // déjà local
  try {
    const res = await fetch(remoteUrl);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const buffer = Buffer.from(await res.arrayBuffer());
    const type = res.headers.get("content-type")?.split(";")[0].trim() ?? "";
    const urlExt = path.extname(new URL(remoteUrl).pathname).toLowerCase();
    const ext =
      EXT_BY_TYPE[type] ??
      (/^\.[a-z0-9]{2,5}$/.test(urlExt) ? urlExt : ".bin");
    // Nom déterministe dérivé de l'URL source : re-rapatrier ne duplique pas.
    const name =
      createHash("sha256").update(remoteUrl).digest("hex").slice(0, 24) + ext;
    await mkdir(MEDIA_DIR, { recursive: true });
    await writeFile(path.join(MEDIA_DIR, name), buffer);
    return `/api/media/${name}`;
  } catch (e) {
    console.error("persistMediaUrl:", remoteUrl, e);
    return remoteUrl;
  }
}

// Chemin disque d'un fichier média servi par /api/media/[file].
// null si le nom est suspect (traversée de répertoire).
export function mediaFilePath(fileName: string): string | null {
  if (!/^[a-zA-Z0-9._-]+$/.test(fileName) || fileName.includes("..")) {
    return null;
  }
  return path.join(MEDIA_DIR, fileName);
}

// Crée le dossier média au besoin et renvoie son chemin (utilisé aussi par
// le téléchargement yt-dlp qui écrit directement dedans).
export async function ensureMediaDir(): Promise<string> {
  await mkdir(MEDIA_DIR, { recursive: true });
  return MEDIA_DIR;
}

// Écrit un fichier uploadé (photo de suivi…) dans le dossier persistant.
// Nom dérivé du contenu : re-uploader la même photo ne duplique pas.
export async function persistMediaBuffer(
  buffer: Buffer,
  contentType: string
): Promise<string> {
  const ext = EXT_BY_TYPE[contentType] ?? ".bin";
  const name = createHash("sha256").update(buffer).digest("hex").slice(0, 24) + ext;
  await mkdir(MEDIA_DIR, { recursive: true });
  await writeFile(path.join(MEDIA_DIR, name), buffer);
  return `/api/media/${name}`;
}

// Relit un fichier local pour le renvoyer à un modèle multimodal (analyse
// d'une photo de repas). /api/media est protégé par la session : le modèle ne
// peut pas suivre l'URL, l'image doit repartir en base64 dans la requête.
// null si l'URL n'est pas locale, si le nom est suspect ou si le fichier a
// disparu — l'appelant en fait un message clair.
export async function readLocalMedia(
  localUrl: string
): Promise<{ buffer: Buffer; contentType: string } | null> {
  if (!localUrl.startsWith("/api/media/")) return null;
  const fileName = localUrl.slice("/api/media/".length);
  const filePath = mediaFilePath(fileName);
  if (!filePath) return null;
  try {
    const buffer = await readFile(filePath);
    const ext = path.extname(fileName).toLowerCase();
    return {
      buffer,
      contentType: TYPE_BY_EXT[ext] ?? "application/octet-stream",
    };
  } catch {
    return null;
  }
}

// Supprime le fichier d'une URL locale « /api/media/<fichier> », en douceur
// (jamais d'erreur : le fichier peut être partagé ou déjà absent).
export async function deleteLocalMedia(localUrl: string): Promise<void> {
  if (!localUrl.startsWith("/api/media/")) return;
  const filePath = mediaFilePath(localUrl.slice("/api/media/".length));
  if (!filePath) return;
  try {
    await unlink(filePath);
  } catch {
    // déjà supprimé ou inaccessible : sans conséquence
  }
}
