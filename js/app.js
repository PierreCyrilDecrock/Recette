// Démarrage de l'application et routeur par hash.
// Chaque route charge son écran par import() dynamique ; un écran exporte
// afficher(conteneur, params), qui peut renvoyer une fonction de nettoyage.

import { T } from './textes.js';

/**
 * Table des routes. Le motif s'applique au chemin situé après « # ».
 * - ecran : fichier de js/ecrans/ à charger ;
 * - cles : noms des paramètres capturés par le motif ;
 * - extra : paramètres fixes transmis à l'écran ;
 * - onglet : onglet à marquer comme actif (aria-current="page") ;
 * - immersif : masque la barre d'onglets et le bouton « + » ;
 * - sansAjout : masque seulement le bouton « + » (l'écran a sa propre barre d'actions en bas).
 * Les paramètres de requête (« #/cuisine/42?portions=6 ») sont transmis en chaînes ;
 * ceux du motif et de extra l'emportent en cas de conflit.
 */
const ROUTES = [
  { motif: /^\/$/, ecran: 'liste', onglet: 'recettes' },
  { motif: /^\/favoris$/, ecran: 'liste', extra: { favoris: true }, onglet: 'favoris' },
  { motif: /^\/recette\/([^/]+)$/, ecran: 'fiche', cles: ['id'], sansAjout: true },
  { motif: /^\/nouvelle$/, ecran: 'edition', immersif: true },
  { motif: /^\/edition\/([^/]+)$/, ecran: 'edition', cles: ['id'], immersif: true },
  { motif: /^\/cuisine\/([^/]+)$/, ecran: 'cuisine', cles: ['id'], immersif: true },
  { motif: /^\/reglages$/, ecran: 'reglages', onglet: 'reglages' },
];

const conteneur = document.getElementById('app');
const barreOnglets = document.querySelector('.barre-onglets');
const boutonFlottant = document.querySelector('.bouton-flottant');

// Fonction de nettoyage renvoyée par l'écran affiché
let nettoyageCourant = null;
// Numéro de la navigation en cours : ignore les chargements devenus obsolètes
let numeroNavigation = 0;
// Le premier affichage ne déplace pas le focus (la page vient de s'ouvrir)
let premierAffichage = true;

/**
 * Trouve la route correspondant au hash.
 * @param {string} hash ex. « #/recette/42 » ou « #/cuisine/42?portions=6 »
 * @returns {{ route: object, params: object } | null} null si la route est inconnue
 */
function resoudre(hash) {
  const [chemin, requete = ''] = (hash.replace(/^#/, '') || '/').split(/\?(.*)/s);
  for (const route of ROUTES) {
    const resultat = (chemin || '/').match(route.motif);
    if (!resultat) continue;
    const params = { ...Object.fromEntries(new URLSearchParams(requete)), ...route.extra };
    try {
      (route.cles ?? []).forEach((cle, i) => {
        params[cle] = decodeURIComponent(resultat[i + 1]);
      });
    } catch {
      return null; // encodage invalide (ex. « %E0 ») : route inconnue
    }
    return { route, params };
  }
  return null;
}

/** Marque l'onglet actif et masque la navigation en mode immersif. */
function mettreAJourCoquille(route) {
  for (const onglet of barreOnglets.querySelectorAll('[data-onglet]')) {
    if (onglet.dataset.onglet === route.onglet) {
      onglet.setAttribute('aria-current', 'page');
    } else {
      onglet.removeAttribute('aria-current');
    }
  }
  const immersif = Boolean(route.immersif);
  barreOnglets.hidden = immersif;
  boutonFlottant.hidden = immersif || Boolean(route.sansAjout);
  document.body.toggleAttribute('data-immersif', immersif);
}

/** Appelle la fonction de nettoyage de l'écran précédent, sans bloquer la navigation. */
function nettoyer() {
  if (typeof nettoyageCourant === 'function') {
    try {
      nettoyageCourant();
    } catch (erreur) {
      console.error(erreur);
    }
  }
  nettoyageCourant = null;
}

/** Donne le focus au titre du nouvel écran et met à jour le titre du document. */
function annoncerEcran() {
  const titre = conteneur.querySelector('h1');
  document.title = titre ? T.app.titreDocument(titre.textContent) : T.app.nom;
  window.scrollTo(0, 0);
  if (premierAffichage) {
    premierAffichage = false;
    return;
  }
  const cible = titre ?? conteneur;
  if (!cible.hasAttribute('tabindex')) cible.setAttribute('tabindex', '-1');
  cible.focus({ preventScroll: true });
}

/** Affiche un message d'erreur si l'écran n'a pas pu être chargé. */
function afficherErreur() {
  const message = document.createElement('p');
  message.className = 'carte';
  message.setAttribute('role', 'alert');
  message.textContent = T.app.erreurChargement;

  const bouton = document.createElement('button');
  bouton.type = 'button';
  bouton.className = 'bouton bouton--principal';
  bouton.textContent = T.app.reessayer;
  bouton.addEventListener('click', naviguer);

  const section = document.createElement('section');
  section.className = 'ecran pile';
  section.append(message, bouton);
  conteneur.replaceChildren(section);
}

/** Affiche l'écran correspondant au hash courant. */
async function naviguer() {
  const resolution = resoudre(location.hash);
  if (!resolution) {
    // Route inconnue : retour à l'accueil, sans laisser l'URL fautive dans l'historique
    location.replace('#/');
    return;
  }

  const numero = ++numeroNavigation;
  const { route, params } = resolution;

  try {
    const module = await import(`./ecrans/${route.ecran}.js`);
    // Une autre navigation a commencé pendant le chargement : on l'ignore
    if (numero !== numeroNavigation) return;

    nettoyer();
    mettreAJourCoquille(route);
    conteneur.replaceChildren();
    const nettoyage = await module.afficher(conteneur, params);
    if (numero !== numeroNavigation) {
      // L'écran a fini de s'afficher alors qu'on l'a déjà quitté
      if (typeof nettoyage === 'function') nettoyage();
      return;
    }
    nettoyageCourant = nettoyage ?? null;
    annoncerEcran();
  } catch (erreur) {
    console.error(erreur);
    if (numero !== numeroNavigation) return;
    nettoyer();
    mettreAJourCoquille(route);
    afficherErreur();
  }
}

/** Remplace les libellés de repli de index.html par ceux de textes.js. */
function appliquerTextes() {
  const lire = (chemin) => chemin.split('.').reduce((objet, cle) => objet?.[cle], T);
  for (const element of document.querySelectorAll('[data-texte]')) {
    element.textContent = lire(element.dataset.texte) ?? element.textContent;
  }
  for (const element of document.querySelectorAll('[data-texte-aria]')) {
    const texte = lire(element.dataset.texteAria);
    if (texte) element.setAttribute('aria-label', texte);
  }
}

appliquerTextes();
window.addEventListener('hashchange', naviguer);
naviguer();
