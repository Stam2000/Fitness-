import { prisma } from "@/lib/prisma";
import {
  decryptSecret,
  encryptSecret,
  getEncryptionKey,
  isEncrypted,
} from "@/lib/secret-box";

export type ResolvedSettings = {
  openrouterApiKey: string | null;
  openrouterModel: string;
  pinnedModels: string[];
  kieApiKey: string | null;
  voiceModel: string;
  visionModel: string;
};

type SecretField = "openrouterApiKey" | "kieApiKey";
const SECRET_FIELDS: SecretField[] = ["openrouterApiKey", "kieApiKey"];

let warnedPlaintext = false;

/**
 * Lit une clé API stockée en base. Les valeurs chiffrées (`enc:v1:…`) sont
 * déchiffrées ; une valeur historique en clair est rendue telle quelle (et
 * chiffrée en place par `getSettings` dès que SETTINGS_ENCRYPTION_KEY est
 * disponible). Une valeur indéchiffrable (clé absente ou changée) est traitée
 * comme absente — la variable d'environnement prend alors le relais.
 */
function readSecret(field: SecretField, stored: string | null): string | null {
  if (!stored) return null;
  if (!isEncrypted(stored)) {
    if (!getEncryptionKey() && !warnedPlaintext) {
      warnedPlaintext = true;
      console.warn(
        "[settings] Clé API stockée EN CLAIR en base : définis " +
          "SETTINGS_ENCRYPTION_KEY pour qu'elle soit chiffrée automatiquement."
      );
    }
    return stored;
  }
  try {
    return decryptSecret(stored);
  } catch (e) {
    // Jamais la valeur elle-même dans les logs.
    console.error(
      `[settings] ${field} illisible (SETTINGS_ENCRYPTION_KEY absente ou ` +
        `différente de celle du chiffrement) : ${(e as Error).message}`
    );
    return null;
  }
}

/**
 * Migration progressive : chiffre en place les clés encore stockées en clair.
 * Idempotent ; sans clé de chiffrement, ne fait rien. Une concurrence entre
 * deux requêtes est sans danger (les deux écrivent un chiffré valide de la
 * même valeur ; la condition `equals` évite d'écraser une clé changée entre-temps).
 */
async function encryptLegacySecrets(s: Record<SecretField, string | null>) {
  if (!getEncryptionKey()) return;
  for (const field of SECRET_FIELDS) {
    const value = s[field];
    if (!value || isEncrypted(value)) continue;
    try {
      await prisma.settings.updateMany({
        where: { id: 1, [field]: { equals: value } },
        data: { [field]: encryptSecret(value) },
      });
      console.info(`[settings] ${field} chiffrée en base.`);
    } catch (e) {
      console.error(
        `[settings] Chiffrement de ${field} impossible : ${(e as Error).message}`
      );
    }
  }
}

// Réglages GLOBAUX de l'instance : clés API et choix des modèles. C'est le
// budget de l'administrateur qui est consommé, lui seul peut les modifier
// (voir saveSettings dans src/app/actions.ts) — mais tous les comptes en
// bénéficient, d'où une lecture non filtrée.
//
// Les clés saisies dans Réglages (DB) priment sur les variables d'environnement.
export async function getSettings(): Promise<ResolvedSettings> {
  const s = await prisma.settings.upsert({
    where: { id: 1 },
    update: {},
    create: { id: 1 },
  });
  await encryptLegacySecrets(s);
  return {
    openrouterApiKey:
      readSecret("openrouterApiKey", s.openrouterApiKey) ||
      process.env.OPENROUTER_API_KEY ||
      null,
    openrouterModel: s.openrouterModel,
    pinnedModels: s.pinnedModels,
    kieApiKey:
      readSecret("kieApiKey", s.kieApiKey) || process.env.KIE_API_KEY || null,
    voiceModel: s.voiceModel,
    visionModel: s.visionModel,
  };
}

export type UserPreferences = {
  voiceInput: boolean;
  voiceAnnounce: boolean;
};

// Préférences de dictée, propres à chaque compte. À défaut de ligne
// UserSettings, on retombe sur les colonnes historiques de Settings : les
// réglages d'avant l'arrivée des comptes restent ainsi en vigueur.
export async function getUserPreferences(
  userId: string
): Promise<UserPreferences> {
  const [prefs, legacy] = await Promise.all([
    prisma.userSettings.findUnique({ where: { userId } }),
    prisma.settings.findUnique({ where: { id: 1 } }),
  ]);
  return {
    voiceInput: prefs?.voiceInput ?? legacy?.voiceInput ?? true,
    voiceAnnounce: prefs?.voiceAnnounce ?? legacy?.voiceAnnounce ?? true,
  };
}
