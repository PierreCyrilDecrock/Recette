// Service worker : l'application s'ouvre et fonctionne sans réseau.
// - Installation : tous les fichiers de l'app (FICHIERS) sont mis en cache, dans un cache
//   nommé d'après la version.
// - Requêtes : « cache d'abord » pour ces fichiers ; le réseau pour le reste. Hors ligne,
//   une navigation inconnue reçoit la page d'accueil (le routeur lit le hash).
// - Activation : les caches des versions précédentes sont supprimés.
// - Mise à jour : la nouvelle version attend ; l'app propose « Recharger », puis envoie le
//   message SKIP_WAITING (aucun skipWaiting automatique : une page ouverte ne change
//   jamais de version en cours de route).
// Tous les chemins sont relatifs à ce fichier : l'app fonctionne dans un sous-dossier.

/**
 * Version de l'application : copie de VERSION (js/app.js), vérifiée par
 * npm run verifier-cache. Elle doit figurer dans ce fichier : le navigateur ne détecte une
 * nouvelle version que si le contenu de sw.js change.
 */
const VERSION = '1.0.0';

const PREFIXE_CACHE = 'recette-';
const CACHE = `${PREFIXE_CACHE}${VERSION}`;

/**
 * Fichiers de l'application, y compris chaque écran chargé par import() et les icônes.
 * « ./ » est la page d'accueil (index.html). npm run verifier-cache compare cette liste aux
 * fichiers présents dans css/, js/ et icones/.
 */
const FICHIERS = [
  './',
  'manifest.webmanifest',
  'css/base.css',
  'css/composants.css',
  'css/ecrans.css',
  'js/app.js',
  'js/db.js',
  'js/exemples.js',
  'js/icones.js',
  'js/modele.js',
  'js/textes.js',
  'js/composants/carte-recette.js',
  'js/composants/liste-ingredients.js',
  'js/composants/liste-lignes.js',
  'js/composants/selecteur-portions.js',
  'js/composants/toast.js',
  'js/ecrans/cuisine.js',
  'js/ecrans/edition.js',
  'js/ecrans/fiche.js',
  'js/ecrans/liste.js',
  'js/ecrans/reglages.js',
  'icones/apple-touch-icon.png',
  'icones/favicon.ico',
  'icones/favicon.svg',
  'icones/icone-192.png',
  'icones/icone-512.png',
  'icones/icone-maskable-512.png',
  'icones/icone.svg',
];

/** Message de l'app : la nouvelle version prend la main. */
const MESSAGE_ACTIVER = 'SKIP_WAITING';

self.addEventListener('install', (evenement) => {
  evenement.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    // cache: 'reload' contourne le cache HTTP : on met en cache les fichiers du serveur
    await cache.addAll(FICHIERS.map((fichier) => new Request(fichier, { cache: 'reload' })));
  })());
});

self.addEventListener('activate', (evenement) => {
  evenement.waitUntil((async () => {
    const noms = await caches.keys();
    await Promise.all(noms
      .filter((nom) => nom.startsWith(PREFIXE_CACHE) && nom !== CACHE)
      .map((nom) => caches.delete(nom)));
    // Première installation : les pages déjà ouvertes passent sous contrôle sans recharger
    await self.clients.claim();
  })());
});

self.addEventListener('message', (evenement) => {
  const type = typeof evenement.data === 'string' ? evenement.data : evenement.data?.type;
  if (type === MESSAGE_ACTIVER) self.skipWaiting();
});

self.addEventListener('fetch', (evenement) => {
  const { request } = evenement;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;
  evenement.respondWith(repondre(request));
});

/** Cache d'abord, puis réseau ; hors ligne, une navigation reçoit la page d'accueil. */
async function repondre(request) {
  const cache = await caches.open(CACHE);
  const navigation = request.mode === 'navigate';
  // Pour une page, la requête (?…) ne compte pas : « ./?source=pwa » est l'accueil
  const enCache = await cache.match(request, { ignoreSearch: navigation });
  if (enCache) return enCache;
  try {
    return await fetch(request);
  } catch (erreur) {
    if (navigation) {
      const accueil = await cache.match('./');
      if (accueil) return accueil;
    }
    throw erreur;
  }
}
