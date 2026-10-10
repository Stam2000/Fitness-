import { betterAuth } from "better-auth";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { nextCookies } from "better-auth/next-js";
import { admin } from "better-auth/plugins";
import { prisma } from "@/lib/prisma";

// Instance Better Auth partagée par le handler /api/auth/[...all], les Server
// Actions et la couche d'accès (src/lib/session.ts).
//
// L'inscription publique passe par la Server Action `registerWithInvite`
// (src/app/auth-actions.ts) : elle valide un code d'invitation avant d'appeler
// `auth.api.signUpEmail`. Les points d'entrée HTTP bruts d'inscription et de
// connexion restent fermés — voir le garde-fou `hooks.before` plus bas.
export const auth = betterAuth({
  database: prismaAdapter(prisma, { provider: "postgresql" }),
  secret: process.env.BETTER_AUTH_SECRET,
  baseURL: process.env.BETTER_AUTH_URL,
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
  },
  hooks: {
    // Ferme l'inscription en accès direct : POST /api/auth/sign-up/email est
    // refusé. Seule la Server Action `registerWithInvite` peut créer un
    // compte, après avoir consommé un code d'invitation valide.
    //
    // `ctx.request` n'est renseigné que pour les appels arrivés par HTTP ;
    // les appels serveur (`auth.api.signUpEmail`) le laissent indéfini.
    before: createAuthMiddleware(async (ctx) => {
      if (ctx.path.startsWith("/sign-up") && ctx.request) {
        throw new APIError("FORBIDDEN", {
          message: "Inscription sur invitation uniquement.",
        });
      }
      // Même verrou pour la connexion : l'interface passe exclusivement par
      // la Server Action `signInWithPassword`, qui applique la limitation des
      // tentatives par compte et par IP (src/lib/rate-limit.ts). Laisser
      // POST /api/auth/sign-in/email ouvert offrirait un contournement.
      if (ctx.path.startsWith("/sign-in") && ctx.request) {
        throw new APIError("FORBIDDEN", {
          message: "Connexion via le formulaire de l'application uniquement.",
        });
      }
    }),
  },
  plugins: [
    // Ajoute `role`, `banned`, `banReason`, `banExpires` sur l'utilisateur et
    // `impersonatedBy` sur la session. Le premier compte (créé par /setup) est
    // promu « admin » : lui seul voit les clés API et gère les invitations.
    admin(),
    // Doit rester en dernier : permet aux Server Actions de poser le cookie de
    // session, ce qu'elles ne peuvent pas faire via les en-têtes de réponse.
    nextCookies(),
  ],
});
