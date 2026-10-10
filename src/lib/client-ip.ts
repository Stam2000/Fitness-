import { isIP } from "net";

/**
 * IP du client telle que vue par NOTRE reverse proxy — jamais une valeur
 * choisie par le client.
 *
 * Chaque proxy AJOUTE à droite de X-Forwarded-For l'adresse de son
 * interlocuteur. Les entrées de gauche peuvent donc être forgées par le
 * client ; seule la N-ième en partant de la droite, N étant le nombre de
 * proxies de confiance (TRUSTED_PROXY_HOPS), est fiable :
 *   - Traefik seul (Coolify)            → 1 (valeur par défaut)
 *   - Cloudflare (proxy) puis Traefik   → 2
 *   - accès direct, sans proxy          → 0 : aucune IP n'est retenue
 *
 * Cela suppose que l'app n'est joignable QUE par ce proxy (aucun port
 * publié : voir docker-compose.yml).
 *
 * Les IPv6 sont ramenées à leur préfixe /64 : un attaquant dispose en
 * général d'un /64 entier et changerait d'adresse à chaque essai.
 */
export function clientIpFromHeaders(headers: Headers): string | null {
  const raw = process.env.TRUSTED_PROXY_HOPS;
  const parsed = raw === undefined || raw === "" ? 1 : Number.parseInt(raw, 10);
  const hops = Number.isFinite(parsed) && parsed >= 0 ? parsed : 1;
  if (hops === 0) return null;

  const chain = (headers.get("x-forwarded-for") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const candidate = chain[chain.length - hops];
  if (!candidate) return null;
  return normalizeIp(candidate);
}

function normalizeIp(value: string): string | null {
  let ip = value;
  // « [2001:db8::1]:1234 » ou « 1.2.3.4:5678 »
  const bracket = /^\[([^\]]+)\](?::\d+)?$/.exec(ip);
  if (bracket) ip = bracket[1];
  else if (/^\d+\.\d+\.\d+\.\d+:\d+$/.test(ip)) ip = ip.split(":")[0];

  const version = isIP(ip);
  if (version === 4) return ip;
  if (version !== 6) return null;

  const lower = ip.toLowerCase();
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(lower);
  if (mapped) return mapped[1];
  return `${expandIpv6(lower).slice(0, 4).join(":")}::/64`;
}

function expandIpv6(ip: string): string[] {
  const [left, right] = ip.includes("::") ? ip.split("::") : [ip, ""];
  const l = left ? left.split(":") : [];
  const r = right ? right.split(":") : [];
  const zeros = Array(Math.max(0, 8 - l.length - r.length)).fill("0");
  return [...l, ...zeros, ...r].map((g) => g.padStart(4, "0"));
}
