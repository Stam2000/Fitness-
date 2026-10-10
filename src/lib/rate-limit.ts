/**
 * Limitation des tentatives (connexion, /setup, inscription) — en mémoire.
 *
 * Fenêtre fixe par clé : au-delà de `max` échecs dans `windowMs`, la clé est
 * bloquée jusqu'à la fin de la fenêtre. Le stockage est local au processus :
 * suffisant pour l'unique conteneur applicatif déployé (un redémarrage remet
 * les compteurs à zéro, ce qui reste acceptable pour freiner le bruteforce).
 * Avec plusieurs réplicas, il faudrait un stockage partagé (Postgres/Redis).
 */

type Bucket = { count: number; resetAt: number };

export type Limiter = {
  /** Millisecondes avant déblocage, ou 0 si la clé peut tenter. */
  blockedFor(key: string): number;
  /** Comptabilise un échec pour la clé. */
  fail(key: string): void;
  /** Efface le compteur (succès). */
  reset(key: string): void;
};

const MAX_KEYS = 50_000;

export function createLimiter(opts: { max: number; windowMs: number }): Limiter {
  const buckets = new Map<string, Bucket>();

  function prune(now: number) {
    for (const [k, b] of buckets) if (b.resetAt <= now) buckets.delete(k);
    // Garde-fou mémoire face à un flot de clés distinctes (IP usurpées
    // impossibles ici, mais e-mails arbitraires possibles) : on sacrifie les
    // plus anciennes entrées plutôt que de grossir sans fin.
    if (buckets.size > MAX_KEYS) {
      const excess = buckets.size - MAX_KEYS;
      let i = 0;
      for (const k of buckets.keys()) {
        if (i++ >= excess) break;
        buckets.delete(k);
      }
    }
  }

  return {
    blockedFor(key) {
      const now = Date.now();
      const b = buckets.get(key);
      if (!b || b.resetAt <= now) return 0;
      return b.count >= opts.max ? b.resetAt - now : 0;
    },
    fail(key) {
      const now = Date.now();
      if (buckets.size > MAX_KEYS / 2) prune(now);
      const b = buckets.get(key);
      if (!b || b.resetAt <= now) {
        buckets.set(key, { count: 1, resetAt: now + opts.windowMs });
      } else {
        b.count += 1;
      }
    },
    reset(key) {
      buckets.delete(key);
    },
  };
}

// Instances partagées par les Server Actions d'authentification. Survivent au
// rechargement à chaud en dev via globalThis.
const g = globalThis as unknown as {
  __authLimiters?: { ip: Limiter; account: Limiter };
};

export const authLimiters =
  g.__authLimiters ??
  (g.__authLimiters = {
    // Par IP : couvre le bruteforce d'un compte comme le « password spraying »
    // sur plusieurs comptes, et les jetons de /setup et codes d'invitation.
    ip: createLimiter({ max: 20, windowMs: 15 * 60_000 }),
    // Par compte : ralentit une attaque distribuée sur une seule adresse
    // e-mail. Seuil assez haut pour qu'un tiers ne puisse pas bloquer
    // durablement le titulaire à peu de frais (le blocage expire seul).
    account: createLimiter({ max: 10, windowMs: 15 * 60_000 }),
  });

export function retryMessage(ms: number): string {
  const minutes = Math.max(1, Math.ceil(ms / 60_000));
  return `Trop de tentatives. Réessaie dans ${minutes} minute${minutes > 1 ? "s" : ""}.`;
}
