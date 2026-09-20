import { NextResponse, type NextRequest } from "next/server";

const REALM = "AOX Generative Operations";

/**
 * Protège l'intégralité de l'application par une authentification HTTP
 * Basic (popup native du navigateur), identifiants lus depuis les
 * variables d'environnement APP_BASIC_AUTH_USER / APP_BASIC_AUTH_PASSWORD.
 *
 * Choix délibéré, adapté à un outil interne : pas de page de login, pas de
 * session à gérer, aucune dépendance supplémentaire. Si une UX plus
 * poussée est nécessaire un jour (vraie page de login, bouton
 * "déconnexion"), ceci peut être remplacé par une authentification par
 * cookie sans changer le reste de l'application.
 *
 * Comparaison en clair (pas de comparaison "timing-safe") : acceptable
 * pour un outil interne servi en HTTPS, mais à durcir si le seuil de
 * sécurité requis est plus élevé.
 */
export function middleware(request: NextRequest) {
  const expectedUser = process.env.APP_BASIC_AUTH_USER;
  const expectedPassword = process.env.APP_BASIC_AUTH_PASSWORD;

  if (!expectedUser || !expectedPassword) {
    console.error(
      "[auth middleware] APP_BASIC_AUTH_USER / APP_BASIC_AUTH_PASSWORD non définis : accès BLOQUÉ."
    );

    return new NextResponse("Authentification non configurée.", {
      status: 503,
      headers: {
        "Cache-Control": "no-store",
      },
    });
  }

  const authHeader = request.headers.get("authorization");
  if (authHeader?.startsWith("Basic ")) {
    const encoded = authHeader.slice("Basic ".length);
    try {
      const decoded = atob(encoded); // atob plutôt que Buffer : compatible runtime Edge et Node.
      const separatorIndex = decoded.indexOf(":");
      const user = decoded.slice(0, separatorIndex);
      const password = decoded.slice(separatorIndex + 1);
      if (user === expectedUser && password === expectedPassword) {
        return NextResponse.next();
      }
    } catch {
      // En-tête malformé : traité comme non authentifié ci-dessous.
    }
  }

  return new NextResponse("Authentification requise.", {
    status: 401,
    headers: { "WWW-Authenticate": `Basic realm="${REALM}", charset="UTF-8"` },
  });
}

export const config = {
  // Protège tout, y compris les fichiers de /public (comme /catalog.xml,
  // qu'on ne veut pas non plus exposer sans authentification), sauf les
  // assets internes Next.js dont le blocage casserait le rendu de la popup
  // d'authentification elle-même.
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
