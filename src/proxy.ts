import { NextResponse, type NextRequest } from "next/server";
import { getSessionCookie } from "better-auth/cookies";

/**
 * Redirection OPTIMISTE vers /login (Next 16 : « middleware » s'appelle
 * désormais « proxy »).
 *
 * On se contente de vérifier la PRÉSENCE du cookie de session, sans accès à
 * la base : le proxy s'exécute sur chaque requête, y compris les préchargements
 * de liens. La vraie protection est ailleurs — chaque page, Server Action et
 * Route Handler appelle `requireUser()` / `requireApiUser()` et filtre ses
 * requêtes par propriétaire (voir src/lib/session.ts).
 */
const PUBLIC_PATHS = ["/login", "/register", "/setup"];

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }
  if (getSessionCookie(request)) {
    return NextResponse.next();
  }
  const url = request.nextUrl.clone();
  url.pathname = "/login";
  url.search = "";
  return NextResponse.redirect(url);
}

export const config = {
  // Les routes d'API renvoient leur propre 401 (le client attend du JSON, pas
  // une redirection) ; /api/media est exclu pour ne pas casser la lecture des
  // vidéos hors ligne servies par le service worker.
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|icon.png|apple-icon.png|logo-.*\\.png|manifest.webmanifest|sw\\.js).*)",
  ],
};
