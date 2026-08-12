"use server";

import { timingSafeEqual } from "crypto";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireActionAdmin } from "@/lib/session";

// État renvoyé aux formulaires (useActionState). null = pas encore soumis.
export type AuthFormState = { error: string | null };

// Better Auth lève une APIError dont le message utile est dans `body.message`.
function authErrorMessage(e: unknown, fallback: string): string {
  const body = (e as { body?: { message?: string } })?.body;
  if (body?.message) return body.message;
  if (e instanceof Error && e.message) return e.message;
  return fallback;
}

function readCredentials(formData: FormData) {
  return {
    name: String(formData.get("name") ?? "").trim(),
    email: String(formData.get("email") ?? "").trim().toLowerCase(),
    password: String(formData.get("password") ?? ""),
  };
}

// ---------- Première installation ----------

// Comparaison à durée constante : le jeton de /setup protège l'adoption de
// toutes les données déjà présentes en base, il ne doit pas fuiter caractère
// par caractère via le temps de réponse.
export async function setupTokenIsValid(token: string): Promise<boolean> {
  const expected = process.env.SETUP_TOKEN ?? "";
  if (!expected || !token) return false;
  const a = Buffer.from(token);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Crée le tout premier compte (administrateur) et lui rattache l'intégralité
 * des données déjà présentes en base — celles créées avant l'existence des
 * comptes. C'est la seule opération qui écrit dans la colonne `userId` des
 * lignes orphelines ; elle est jouée une fois, en transaction.
 */
export async function completeSetup(
  _prev: AuthFormState,
  formData: FormData
): Promise<AuthFormState> {
  const { name, email, password } = readCredentials(formData);
  const token = String(formData.get("token") ?? "");

  if (!(await setupTokenIsValid(token))) {
    return { error: "Jeton d'installation invalide." };
  }
  // Verrou définitif : dès qu'un compte existe, plus personne ne peut
  // réclamer les données historiques, même avec le bon jeton.
  if ((await prisma.user.count()) > 0) {
    return { error: "L'installation a déjà été effectuée." };
  }
  if (!name || !email || password.length < 8) {
    return { error: "Nom, e-mail et mot de passe (8 caractères minimum) requis." };
  }

  let userId: string;
  try {
    const result = await auth.api.signUpEmail({
      body: { name, email, password },
      headers: await headers(),
    });
    userId = result.user.id;
  } catch (e) {
    return { error: authErrorMessage(e, "Création du compte impossible.") };
  }

  await prisma.$transaction([
    prisma.user.update({ where: { id: userId }, data: { role: "admin" } }),
    // Adoption des données historiques. Chaque ligne sans propriétaire est
    // rattachée au compte fondateur ; rien n'est supprimé ni recréé.
    // ProgramDay, Exercise, ExerciseVariation et SetLog suivent leur parent.
    prisma.location.updateMany({ where: { userId: null }, data: { userId } }),
    prisma.program.updateMany({ where: { userId: null }, data: { userId } }),
    prisma.workoutSession.updateMany({ where: { userId: null }, data: { userId } }),
    prisma.bodyMeasurement.updateMany({ where: { userId: null }, data: { userId } }),
    prisma.progressPhoto.updateMany({ where: { userId: null }, data: { userId } }),
    prisma.chatConversation.updateMany({ where: { userId: null }, data: { userId } }),
  ]);

  revalidatePath("/", "layout");
  redirect("/");
}

// ---------- Connexion ----------

export async function signInWithPassword(
  _prev: AuthFormState,
  formData: FormData
): Promise<AuthFormState> {
  const { email, password } = readCredentials(formData);
  if (!email || !password) {
    return { error: "E-mail et mot de passe requis." };
  }
  try {
    await auth.api.signInEmail({
      body: { email, password },
      headers: await headers(),
    });
  } catch (e) {
    return { error: authErrorMessage(e, "E-mail ou mot de passe incorrect.") };
  }
  revalidatePath("/", "layout");
  redirect("/");
}

// ---------- Inscription sur invitation ----------

/**
 * Inscription : le code est consommé d'abord, en une seule instruction SQL
 * conditionnelle — deux personnes qui soumettent le dernier jeton disponible
 * au même instant ne peuvent pas passer toutes les deux. Si la création du
 * compte échoue ensuite, la place est rendue.
 */
export async function registerWithInvite(
  _prev: AuthFormState,
  formData: FormData
): Promise<AuthFormState> {
  const { name, email, password } = readCredentials(formData);
  const code = String(formData.get("code") ?? "").trim().toUpperCase();

  if (!name || !email || password.length < 8) {
    return { error: "Nom, e-mail et mot de passe (8 caractères minimum) requis." };
  }
  if (!code) return { error: "Code d'invitation requis." };
  // Tant qu'aucun compte n'existe, l'inscription est fermée : les données
  // historiques doivent d'abord être adoptées via /setup.
  if ((await prisma.user.count()) === 0) {
    return { error: "Application non initialisée. Passe d'abord par /setup." };
  }

  const consumed = await prisma.$executeRaw`
    UPDATE "InviteCode"
       SET "usedCount" = "usedCount" + 1
     WHERE "code" = ${code}
       AND "revokedAt" IS NULL
       AND ("expiresAt" IS NULL OR "expiresAt" > NOW())
       AND "usedCount" < "maxUses"`;
  if (consumed === 0) {
    return { error: "Code d'invitation invalide, expiré ou déjà utilisé." };
  }

  try {
    await auth.api.signUpEmail({
      body: { name, email, password },
      headers: await headers(),
    });
  } catch (e) {
    await prisma.$executeRaw`
      UPDATE "InviteCode" SET "usedCount" = "usedCount" - 1
       WHERE "code" = ${code} AND "usedCount" > 0`;
    return { error: authErrorMessage(e, "Création du compte impossible.") };
  }

  revalidatePath("/", "layout");
  redirect("/");
}

// ---------- Gestion des invitations (admin) ----------

// Sans I, O, 0 ni 1 : le code se dicte à l'oral sans ambiguïté.
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function generateCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(10));
  const raw = Array.from(bytes, (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join("");
  return `${raw.slice(0, 5)}-${raw.slice(5)}`;
}

export async function createInviteCode(input: {
  label?: string;
  maxUses?: number;
  expiresInDays?: number | null;
}): Promise<string> {
  const admin = await requireActionAdmin();
  const expiresInDays = input.expiresInDays ?? null;
  const code = await prisma.inviteCode.create({
    data: {
      code: generateCode(),
      label: input.label?.trim() || null,
      maxUses: Math.min(Math.max(input.maxUses ?? 1, 1), 100),
      expiresAt:
        expiresInDays && expiresInDays > 0
          ? new Date(Date.now() + expiresInDays * 86_400_000)
          : null,
      createdById: admin.id,
    },
  });
  revalidatePath("/settings/invitations");
  return code.code;
}

export async function revokeInviteCode(id: string): Promise<void> {
  await requireActionAdmin();
  await prisma.inviteCode.update({
    where: { id },
    data: { revokedAt: new Date() },
  });
  revalidatePath("/settings/invitations");
}

export async function deleteInviteCode(id: string): Promise<void> {
  await requireActionAdmin();
  await prisma.inviteCode.delete({ where: { id } });
  revalidatePath("/settings/invitations");
}
