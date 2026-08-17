// Réduction d'une photo avant envoi au modèle multimodal.
// Client uniquement (Canvas / createImageBitmap), jumeau de src/lib/audio.ts
// qui joue le même rôle pour le micro.

// Au-delà de ~1024 px, un modèle de vision ne distingue rien de plus dans une
// assiette : il découpe l'image en tuiles et facture chacune d'elles.
const MAX_SIDE = 1024;
const QUALITY = 0.82;
// En dessous, le ré-encodage ne gagne rien et coûte une passe de canvas.
const SKIP_BELOW_BYTES = 400 * 1024;

/**
 * Réduit une photo à `maxSide` px sur son plus grand côté et la ré-encode en
 * JPEG. Deux gains : l'envoi passe de plusieurs mégaoctets à ~200 Ko sur un
 * réseau mobile, et le coût en tokens de l'analyse chute d'autant.
 *
 * L'orientation EXIF est appliquée au décodage : sans elle, une photo prise
 * en portrait arrive couchée sur le canvas et le modèle décrit une assiette
 * de travers. Le ré-encodage efface au passage les métadonnées, dont la
 * position GPS — une photo de repas n'a pas à porter le domicile de qui la
 * prend.
 *
 * Jette si le navigateur ne sait pas décoder le fichier (HEIC hors Safari) :
 * un message clair vaut mieux qu'un envoi que le serveur refusera.
 */
export async function downscaleImage(
  file: File,
  maxSide = MAX_SIDE,
  quality = QUALITY
): Promise<File> {
  const bitmap = await decode(file);
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));

  // Déjà petite, déjà en JPEG, déjà légère : rien à gagner.
  if (scale === 1 && file.type === "image/jpeg" && file.size < SKIP_BELOW_BYTES) {
    close(bitmap);
    return file;
  }

  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    close(bitmap);
    throw new Error("Impossible de préparer la photo sur ce navigateur.");
  }
  ctx.drawImage(bitmap, 0, 0, width, height);
  close(bitmap);

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", quality)
  );
  if (!blob) throw new Error("Impossible de préparer la photo sur ce navigateur.");
  return new File([blob], "repas.jpg", { type: "image/jpeg" });
}

type Decoded = ImageBitmap | HTMLImageElement;

function close(bitmap: Decoded) {
  if ("close" in bitmap) bitmap.close();
}

async function decode(file: File): Promise<Decoded> {
  // createImageBitmap redresse l'image selon l'EXIF quand on le lui demande.
  if (typeof createImageBitmap === "function") {
    try {
      return await createImageBitmap(file, { imageOrientation: "from-image" });
    } catch {
      // Safari a longtemps ignoré l'option : on retombe sur <img>, qui
      // applique l'orientation nativement.
    }
  }
  return await decodeWithImgTag(file);
}

function decodeWithImgTag(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(
        new Error(
          "Ce navigateur ne sait pas lire cette photo (format HEIC ?). Sur iPhone : Réglages > Appareil photo > Formats > « Le plus compatible »."
        )
      );
    };
    img.src = url;
  });
}
