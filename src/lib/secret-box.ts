import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

/**
 * Chiffrement au repos des secrets stockés en base (clés API OpenRouter et
 * Kie.ai saisies dans Réglages) : AES-256-GCM, clé applicative lue dans
 * SETTINGS_ENCRYPTION_KEY (32 octets, encodés en base64 ou en hexadécimal).
 *
 * Format stocké : `enc:v1:<iv>:<tag>:<chiffré>` (base64url). Le préfixe
 * distingue une valeur chiffrée d'une valeur historique en clair, ce qui
 * permet une migration progressive (voir src/lib/settings.ts).
 *
 * Une fuite de la base seule (dump, sauvegarde, volume copié) ne livre plus
 * les clés : il faut aussi la variable d'environnement du conteneur.
 */

const PREFIX = "enc:v1:";
const IV_BYTES = 12; // taille recommandée pour GCM
// Données associées : lient le chiffré à son usage (un chiffré de cette
// application ne se déchiffre pas ailleurs avec la même clé).
const AAD = Buffer.from("fitness-app/settings/v1");

let cachedKey: Buffer | null | undefined;

function parseKey(raw: string): Buffer {
  const value = raw.trim();
  if (/^[0-9a-fA-F]{64}$/.test(value)) return Buffer.from(value, "hex");
  const b64 = Buffer.from(value, "base64");
  if (b64.length === 32) return b64;
  throw new Error(
    "SETTINGS_ENCRYPTION_KEY invalide : 32 octets attendus, en base64 " +
      "(openssl rand -base64 32) ou en hexadécimal (openssl rand -hex 32)."
  );
}

/** Clé applicative, ou null si SETTINGS_ENCRYPTION_KEY n'est pas définie. */
export function getEncryptionKey(): Buffer | null {
  if (cachedKey === undefined) {
    const raw = process.env.SETTINGS_ENCRYPTION_KEY;
    // Une clé présente mais malformée lève : mieux vaut un échec franc qu'un
    // stockage en clair silencieux.
    cachedKey = raw && raw.trim() ? parseKey(raw) : null;
  }
  return cachedKey;
}

export function isEncrypted(value: string | null | undefined): boolean {
  return typeof value === "string" && value.startsWith(PREFIX);
}

export function encryptSecret(plain: string): string {
  const key = getEncryptionKey();
  if (!key) {
    throw new Error(
      "SETTINGS_ENCRYPTION_KEY n'est pas définie : impossible d'enregistrer " +
        "une clé API en base. Définis cette variable ou passe la clé par " +
        "OPENROUTER_API_KEY / KIE_API_KEY."
    );
  }
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(AAD);
  const ciphertext = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return (
    PREFIX +
    [iv, tag, ciphertext].map((b) => b.toString("base64url")).join(":")
  );
}

/**
 * Déchiffre une valeur `enc:v1:…`. Lève si la clé est absente, différente de
 * celle du chiffrement, ou si la valeur a été altérée (tag GCM invalide).
 */
export function decryptSecret(stored: string): string {
  if (!isEncrypted(stored)) {
    throw new Error("Valeur non chiffrée.");
  }
  const key = getEncryptionKey();
  if (!key) {
    throw new Error(
      "SETTINGS_ENCRYPTION_KEY n'est pas définie : impossible de déchiffrer."
    );
  }
  const parts = stored.slice(PREFIX.length).split(":");
  if (parts.length !== 3) throw new Error("Valeur chiffrée malformée.");
  const [iv, tag, ciphertext] = parts.map((p) => Buffer.from(p, "base64url"));
  if (iv.length !== IV_BYTES || tag.length !== 16) {
    throw new Error("Valeur chiffrée malformée.");
  }
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAAD(AAD);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString(
    "utf8"
  );
}
