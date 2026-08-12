import { toNextJsHandler } from "better-auth/next-js";
import { auth } from "@/lib/auth";

// Point d'entrée HTTP de Better Auth (connexion, déconnexion, session, APIs
// du plugin admin). L'inscription y est volontairement fermée : elle passe par
// la Server Action `registerWithInvite`.
export const { GET, POST } = toNextJsHandler(auth);
