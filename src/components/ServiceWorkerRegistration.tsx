"use client";

import { useEffect } from "react";

// Enregistre le service worker (mode hors ligne). Uniquement en production :
// en dev, le cache interférerait avec le rechargement à chaud. Nécessite un
// contexte sécurisé (HTTPS, ou localhost).
export default function ServiceWorkerRegistration() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // contexte non sécurisé ou SW indisponible : l'app marche sans
    });
  }, []);
  return null;
}
