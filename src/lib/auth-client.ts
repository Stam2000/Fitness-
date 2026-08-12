"use client";

import { createAuthClient } from "better-auth/react";
import { adminClient } from "better-auth/client/plugins";

// Client Better Auth pour les Composants Client (déconnexion, gestion des
// comptes côté admin). L'inscription et la connexion passent, elles, par des
// Server Actions afin de valider le code d'invitation côté serveur.
export const authClient = createAuthClient({
  plugins: [adminClient()],
});
