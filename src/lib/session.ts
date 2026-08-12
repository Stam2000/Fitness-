import { cache } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * Couche d'accès aux données (« DAL ») : point de passage unique pour savoir
 * qui consulte l'application.
 *
 * Le guide d'authentification de Next 16 est explicite — le proxy ne fait que
 * des redirections optimistes, il ne protège rien. Toute page, Server Action
 * et Route Handler qui touche à des données personnelles commence donc par
 * `requireUser()` (ou `requireApiUser()`), puis filtre systématiquement ses
 * requêtes Prisma par `userId` : un identifiant appartenant à quelqu'un
 * d'autre doit donner un 404, jamais une fuite.
 */

export type SessionUser = {
  id: string;
  name: string;
  email: string;
  role: string | null;
  isAdmin: boolean;
};

// Mémoïsé pour la durée du rendu : plusieurs composants peuvent l'appeler sans
// multiplier les allers-retours en base.
export const getCurrentUser = cache(async (): Promise<SessionUser | null> => {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return null;
  const role = (session.user as { role?: string | null }).role ?? null;
  return {
    id: session.user.id,
    name: session.user.name,
    email: session.user.email,
    role,
    isAdmin: role === "admin",
  };
});

// Vrai tant qu'aucun compte n'existe : l'application entière renvoie alors
// vers /setup, seule page capable de rattacher les données déjà en base au
// tout premier compte. Mémoïsé, et de toute façon `count` sur une table vide.
export const needsSetup = cache(async (): Promise<boolean> => {
  return (await prisma.user.count()) === 0;
});

/** Utilisateur connecté, ou redirection vers /setup puis /login. */
export async function requireUser(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) {
    if (await needsSetup()) redirect("/setup");
    redirect("/login");
  }
  return user;
}

/** Administrateur (clés API, invitations, gestion des comptes). */
export async function requireAdmin(): Promise<SessionUser> {
  const user = await requireUser();
  if (!user.isAdmin) redirect("/");
  return user;
}

/**
 * Équivalent pour les Route Handlers : renvoie soit l'utilisateur, soit une
 * réponse 401/403 à retourner telle quelle — pas de redirection, l'appelant
 * est du JavaScript, pas un navigateur.
 *
 *   const auth = await requireApiUser();
 *   if (auth instanceof NextResponse) return auth;
 */
export async function requireApiUser(): Promise<SessionUser | NextResponse> {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }
  return user;
}

export async function requireApiAdmin(): Promise<SessionUser | NextResponse> {
  const user = await requireApiUser();
  if (user instanceof NextResponse) return user;
  if (!user.isAdmin) {
    return NextResponse.json({ error: "Réservé à l'administrateur" }, { status: 403 });
  }
  return user;
}

/**
 * Variante pour les Server Actions : lève au lieu de rediriger, afin que
 * l'appelant renvoie un message d'erreur exploitable par le formulaire.
 */
export async function requireActionUser(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) throw new Error("Session expirée. Reconnecte-toi.");
  return user;
}

export async function requireActionAdmin(): Promise<SessionUser> {
  const user = await requireActionUser();
  if (!user.isAdmin) throw new Error("Action réservée à l'administrateur.");
  return user;
}
