// Démarrage de l'application et routeur par hash.
// Chaque route charge son écran par import() dynamique ; un écran exporte
// afficher(conteneur, params), qui peut renvoyer une fonction de nettoyage.
// Elle peut porter mettreAJour(params) → boolean : quand seule la requête du hash change sur le
// même écran (même route, mêmes paramètres du motif), le routeur la lui passe ; true évite de
// reconstruire l'écran (ex. #/cuisine/42?etape=3 → ?etape=4). Le focus ne bouge pas.
// Elle peut aussi porter une garde de sortie, confirmerSortie() → true | Promise<boolean> :
// true laisse partir tout de suite ; sinon le routeur revient à l'URL de l'écran, attend la
// réponse, puis rejoue la navigation (lien, bouton retour ou avance) si elle est acceptée.
// Sur grand écran (≥ 1024 px), les routes « double » affichent deux volets côte à côte :
// la liste à gauche (elle reste en place d'une fiche à l'autre) et la fiche à droite.
// Le changement d'écran passe par l'API View Transitions quand elle existe (fondu sinon).

import { T } from './textes.js';
import { icone } from './icones.js';

/**
 * Version de l'application (affichée dans les réglages), référence unique à modifier à
 * chaque publication. sw.js en porte une copie (le navigateur ne détecte une mise à jour que
 * si sw.js change) : npm run verifier-cache échoue si elles diffèrent.
 */
export const VERSION = '0.1.0';

/**
 * Table des routes. Le motif s'applique au chemin situé après « # ».
 * - ecran : fichier de js/ecrans/ à charger ;
 * - cles : noms des paramètres capturés par le motif ;
 * - extra : paramètres fixes transmis à l'écran ;
 * - onglet : onglet à marquer comme actif (aria-current="page") ;
 * - immersif : masque la barre d'onglets et le bouton « + » ;
 * - sansAjout : masque seulement le bouton « + » sur mobile (l'écran a sa propre barre
 *   d'actions en bas) ; sur grand écran, il reste dans l'en-tête ;
 * - double : sur grand écran, la liste reste affichée à gauche de l'écran (voir afficherDouble).
 * Les paramètres de requête (« #/cuisine/42?portions=6 ») sont transmis en chaînes ;
 * ceux du motif et de extra l'emportent en cas de conflit.
 */
const ROUTES = [
  { motif: /^\/$/, ecran: 'liste', onglet: 'recettes', double: true },
  { motif: /^\/favoris$/, ecran: 'liste', extra: { favoris: true }, onglet: 'favoris', double: true },
  { motif: /^\/recette\/([^/]+)$/, ecran: 'fiche', cles: ['id'], sansAjout: true, double: true },
  { motif: /^\/nouvelle$/, ecran: 'edition', immersif: true },
  { motif: /^\/edition\/([^/]+)$/, ecran: 'edition', cles: ['id'], immersif: true },
  { motif: /^\/cuisine\/([^/]+)$/, ecran: 'cuisine', cles: ['id'], immersif: true },
  { motif: /^\/reglages$/, ecran: 'reglages', onglet: 'reglages' },
];

const conteneur = document.getElementById('app');
const barreOnglets = document.querySelector('.barre-onglets');
const boutonFlottant = document.querySelector('.bouton-flottant');

/** Largeur à partir de laquelle la liste et la fiche s'affichent côte à côte. */
const ecranLarge = matchMedia('(min-width: 1024px)');
const mouvementReduit = matchMedia('(prefers-reduced-motion: reduce)');

// Fonction de nettoyage renvoyée par l'écran affiché (en mode double : celui de droite)
let nettoyageCourant = null;
// Mode double : volets de la liste et du détail ({ element, liste, detail, favoris, nettoyage })
let volet = null;
// Réaffichage dû au franchissement de 1024 px : le focus ne bouge pas
let garderFocus = false;
// Numéro de la navigation en cours : ignore les chargements devenus obsolètes
let numeroNavigation = 0;
// Le premier affichage ne déplace pas le focus (la page vient de s'ouvrir)
let premierAffichage = true;

// Route et paramètres de l'écran affiché (mise à jour sur place)
let routeCourante = null;
let paramsCourants = null;

// Garde de sortie : hash et position dans l'historique de l'écran affiché
let hashCourant = null;
let positionCourante = 0;
// Retour à l'écran courant demandé par la garde : fonction appelée quand il est fait
// (le hashchange correspondant est alors ignoré)
let finRetour = null;
// Délai au-delà duquel on n'attend plus ce hashchange (ms)
const DELAI_RETOUR = 1000;
// Navigation acceptée par la garde : elle ne la consulte pas une seconde fois
let sortieAcceptee = false;

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

/**
 * Marque l'onglet actif et masque la navigation en mode immersif.
 * @param {object} route
 * @param {string} [onglet] onglet à marquer à la place de celui de la route (mode double)
 */
function mettreAJourCoquille(route, onglet = route.onglet) {
  for (const lien of barreOnglets.querySelectorAll('[data-onglet]')) {
    if (lien.dataset.onglet === onglet) {
      lien.setAttribute('aria-current', 'page');
    } else {
      lien.removeAttribute('aria-current');
    }
  }
  const immersif = Boolean(route.immersif);
  barreOnglets.hidden = immersif;
  boutonFlottant.hidden = immersif;
  document.body.toggleAttribute('data-immersif', immersif);
  // Le « + » ne disparaît que sur mobile (CSS) : sur grand écran, il est dans l'en-tête
  document.body.toggleAttribute('data-sans-ajout', Boolean(route.sansAjout));
}

/** Appelle une fonction de nettoyage d'écran, sans bloquer la navigation. */
function appelerNettoyage(nettoyage) {
  if (typeof nettoyage !== 'function') return;
  try {
    nettoyage();
  } catch (erreur) {
    console.error(erreur);
  }
}

/** Nettoie l'écran précédent (en mode double : le volet de droite). */
function nettoyer() {
  appelerNettoyage(nettoyageCourant);
  nettoyageCourant = null;
}

/** Quitte le mode double : nettoie la liste de gauche et retire les volets. */
function nettoyerVolet() {
  if (!volet) return;
  appelerNettoyage(volet.nettoyage);
  volet.element.remove();
  volet = null;
}

/**
 * Donne le focus au titre du nouvel écran et met à jour le titre du document.
 * @param {HTMLElement} [zone] partie de la page qui vient de changer (hôte de l'écran,
 *   liste du mode double) ; le focus revient à <main> si elle n'a pas de titre
 */
function annoncerEcran(zone = conteneur) {
  const titre = zone.querySelector('h1');
  document.title = titre ? T.app.titreDocument(titre.textContent) : T.app.nom;
  window.scrollTo(0, 0);
  if (premierAffichage || garderFocus) {
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

/**
 * Mémorise la position de l'entrée d'historique courante dans son état : elle permet
 * de savoir de combien d'entrées le navigateur s'est déplacé (retour, avance, lien).
 * Sans effet sur une entrée déjà marquée (appels répétés sans risque).
 */
function marquerPosition() {
  const position = history.state?.position;
  positionCourante = Number.isInteger(position) ? position : positionCourante + 1;
  history.replaceState({ ...history.state, position: positionCourante }, '');
  hashCourant = location.hash;
}

/**
 * Consulte la garde de l'écran courant avant de le quitter.
 * @returns {boolean} vrai si la navigation peut continuer tout de suite
 */
function consulterGarde() {
  if (finRetour && location.hash === hashCourant) {
    // Retour à l'écran gardé : rien à afficher
    const terminer = finRetour;
    finRetour = null;
    terminer();
    return false;
  }
  if (sortieAcceptee) {
    sortieAcceptee = false;
    return true;
  }
  const garde = nettoyageCourant?.confirmerSortie;
  if (typeof garde !== 'function' || hashCourant === null || location.hash === hashCourant) return true;
  // La garde répond true tout de suite quand il n'y a rien à confirmer
  let reponse;
  try {
    reponse = garde();
  } catch (erreur) {
    console.error(erreur);
    return true;
  }
  if (reponse === true) return true;

  // Retour immédiat à l'écran courant (l'URL reste cohérente pendant la question)
  const cible = location.hash;
  const position = history.state?.position;
  const ecart = Number.isInteger(position) ? position - positionCourante : 1;
  const retourFait = new Promise((resoudre) => {
    finRetour = resoudre;
    setTimeout(() => {
      if (finRetour === resoudre) finRetour = null;
      resoudre();
    }, DELAI_RETOUR);
  });
  if (ecart !== 0) history.go(-ecart);
  else location.replace(hashCourant);
  // On ne rejoue le déplacement qu'une fois revenu à l'écran gardé
  Promise.all([reponse, retourFait])
    .then(([accepte]) => {
      if (!accepte) return;
      // On rejoue le déplacement d'origine
      sortieAcceptee = true;
      if (ecart !== 0) history.go(ecart);
      else location.replace(cible);
    })
    .catch((erreur) => console.error(erreur));
  return false;
}

/**
 * Même écran, mêmes paramètres du motif, autre requête : l'écran se met à jour lui-même
 * s'il sait le faire (mettreAJour renvoie true).
 * @returns {boolean} vrai si l'écran a été mis à jour sans être reconstruit
 */
function mettreAJourSurPlace(route, params) {
  const mettreAJour = nettoyageCourant?.mettreAJour;
  if (route !== routeCourante || typeof mettreAJour !== 'function') return false;
  if ((route.cles ?? []).some((cle) => params[cle] !== paramsCourants[cle])) return false;
  try {
    if (mettreAJour(params) !== true) return false;
  } catch (erreur) {
    console.error(erreur);
    return false;
  }
  paramsCourants = params;
  marquerPosition();
  return true;
}

/** Affiche l'écran correspondant au hash courant. */
async function naviguer() {
  if (!consulterGarde()) return;
  const resolution = resoudre(location.hash);
  if (!resolution) {
    // Route inconnue : retour à l'accueil, sans laisser l'URL fautive dans l'historique
    location.replace('#/');
    return;
  }

  const numero = ++numeroNavigation;
  const { route, params } = resolution;

  if (mettreAJourSurPlace(route, params)) return;

  const double = Boolean(route.double) && ecranLarge.matches;
  try {
    const [module, moduleListe] = await Promise.all([
      import(`./ecrans/${route.ecran}.js`),
      double && route.ecran !== 'liste' ? import('./ecrans/liste.js') : null,
    ]);
    // Une autre navigation a commencé pendant le chargement : on l'ignore
    if (numero !== numeroNavigation) return;

    await avecTransition(async () => {
      // Transition sautée par une navigation plus récente : son rappel est quand même
      // appelé, parfois après celui de la nouvelle ; il ne doit plus toucher à la page
      if (numero !== numeroNavigation) return;
      if (double) {
        await afficherDouble(route, params, module, moduleListe ?? module, numero);
        return;
      }
      nettoyer();
      nettoyerVolet();
      mettreAJourCoquille(route);
      const hote = creerHote();
      conteneur.replaceChildren(hote);
      // La position est notée avant l'affichage : l'écran peut la lire dans history.state
      marquerPosition();
      const nettoyage = await module.afficher(hote, params);
      if (numero !== numeroNavigation) {
        // L'écran a fini de s'afficher alors qu'on l'a déjà quitté
        appelerNettoyage(nettoyage);
        hote.remove();
        return;
      }
      nettoyageCourant = nettoyage ?? null;
      routeCourante = route;
      paramsCourants = params;
      annoncerEcran(hote);
    });
  } catch (erreur) {
    console.error(erreur);
    if (numero !== numeroNavigation) return;
    nettoyer();
    nettoyerVolet();
    routeCourante = null;
    mettreAJourCoquille(route);
    afficherErreur();
    marquerPosition();
  } finally {
    if (numero === numeroNavigation) garderFocus = false;
  }
}

/**
 * Mode double (grand écran) : la liste à gauche, la fiche ou une invitation à droite.
 * La liste n'est reconstruite que si elle n'est pas déjà affichée (ou si l'on passe des
 * recettes aux favoris) : elle garde sa recherche et son défilement d'une fiche à l'autre,
 * et marque la recette ouverte (selectionner). Sa fonction de nettoyage est gardée à part.
 * @param {object} route
 * @param {object} params
 * @param {{ afficher: Function }} module écran de la route
 * @param {{ afficher: Function }} moduleListe écran de la liste
 * @param {number} numero numéro de la navigation
 */
async function afficherDouble(route, params, module, moduleListe, numero) {
  const fiche = route.ecran !== 'liste';
  // Sur une fiche, la liste déjà affichée reste (recettes ou favoris)
  const favoris = fiche ? (volet?.favoris ?? false) : Boolean(params.favoris);

  nettoyer();
  let nouveauVolet = false;
  if (!volet || volet.favoris !== favoris) {
    nettoyerVolet();
    volet = creerVolet(favoris);
    conteneur.replaceChildren(volet.element);
    nouveauVolet = true;
  }
  mettreAJourCoquille(route, favoris ? 'favoris' : 'recettes');
  marquerPosition();

  if (nouveauVolet) {
    const ce = volet;
    const nettoyageListe = await moduleListe.afficher(ce.liste, { favoris });
    // Volet déjà retiré par une navigation plus récente : on libère tout de suite sa liste
    if (ce !== volet) appelerNettoyage(nettoyageListe);
    else ce.nettoyage = nettoyageListe;
    if (numero !== numeroNavigation) return;
  }
  volet.nettoyage?.selectionner?.(fiche ? params.id : null);
  volet.element.dataset.detail = fiche ? 'fiche' : 'vide';

  let nettoyage = null;
  const hote = creerHote();
  volet.detail.replaceChildren(hote);
  if (fiche) {
    nettoyage = await module.afficher(hote, params);
    if (numero !== numeroNavigation) {
      appelerNettoyage(nettoyage);
      hote.remove();
      return;
    }
  } else {
    hote.append(creerInvitation());
  }
  nettoyageCourant = nettoyage ?? null;
  routeCourante = route;
  paramsCourants = params;
  annoncerEcran(fiche ? hote : volet.liste);
}

/**
 * Hôte d'un écran : l'écran y ajoute son contenu. Sans boîte (display: contents), il
 * ne change rien à la mise en page ; si la navigation devient obsolète pendant que
 * l'écran se construit, on le retire avec tout ce que l'écran y a mis.
 */
function creerHote() {
  const hote = document.createElement('div');
  hote.className = 'hote-ecran';
  return hote;
}

/** Structure des deux volets (mode double). */
function creerVolet(favoris) {
  const element = document.createElement('div');
  element.className = 'double';
  const liste = document.createElement('div');
  liste.className = 'double__liste';
  const detail = document.createElement('div');
  detail.className = 'double__detail';
  element.append(liste, detail);
  return { element, liste, detail, favoris, nettoyage: null };
}

/** Volet de droite quand aucune recette n'est ouverte : une invitation à en choisir une. */
function creerInvitation() {
  const bloc = document.createElement('div');
  bloc.className = 'ecran invitation';
  const pastille = document.createElement('div');
  pastille.className = 'invitation__pastille';
  pastille.append(icone('toque', { taille: 40 }));
  const titre = document.createElement('h2');
  titre.className = 'invitation__titre';
  titre.textContent = T.app.invitationTitre;
  const texte = document.createElement('p');
  texte.className = 'invitation__texte texte-doux';
  texte.textContent = T.app.invitationTexte;
  bloc.append(pastille, titre, texte);
  return bloc;
}

/**
 * Change d'écran dans une transition de vue (fondu entre l'ancien et le nouvel écran)
 * quand le navigateur la connaît et que l'utilisateur accepte le mouvement. Sinon, la
 * mise à jour est directe et chaque écran apparaît par l'animation CSS « apparition ».
 * @param {() => Promise<void>} miseAJour
 * @returns {Promise<void>} résolue (ou rejetée) avec la mise à jour
 */
function avecTransition(miseAJour) {
  if (premierAffichage || garderFocus || typeof document.startViewTransition !== 'function' || mouvementReduit.matches) {
    return miseAJour();
  }
  const transition = document.startViewTransition(miseAJour);
  // Transition sautée (une autre commence, délai dépassé) : la mise à jour a lieu quand même
  transition.ready.catch(() => {});
  transition.finished.catch(() => {});
  return transition.updateCallbackDone;
}

/** Franchissement de 1024 px sur un écran double : on passe d'un mode à l'autre. */
function changerDisposition() {
  if (!routeCourante?.double) return;
  garderFocus = true;
  routeCourante = null; // force la reconstruction
  naviguer();
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

/** Remplace les emplacements d'icône de index.html (data-icone) par les icônes de icones.js. */
function appliquerIcones() {
  for (const emplacement of document.querySelectorAll('[data-icone]')) {
    emplacement.replaceWith(icone(emplacement.dataset.icone, {
      taille: Number(emplacement.dataset.taille) || 24,
      classe: emplacement.className,
    }));
  }
}

// ---------------------------------------------------------------------------
// Service worker : hors ligne et mises à jour
// ---------------------------------------------------------------------------

/** Message qui demande à la nouvelle version de ne plus attendre (voir sw.js). */
const MESSAGE_ACTIVER = 'SKIP_WAITING';

/** Vrai une fois « Recharger » choisi : seul ce cas recharge la page au changement de version. */
let rechargementDemande = false;

/** Vrai en HTTPS ou sur la machine locale : les seuls contextes où le service worker est permis. */
function contexteSecurise() {
  return location.protocol === 'https:' || ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);
}

/**
 * Bandeau « Nouvelle version disponible — Recharger » : le bouton active la version en
 * attente, puis la page se recharge quand elle prend la main (controllerchange).
 * @param {ServiceWorker} enAttente
 */
function proposerMiseAJour(enAttente) {
  if (document.querySelector('.bandeau-maj')) return;
  const bandeau = document.createElement('div');
  bandeau.className = 'bandeau-maj';
  bandeau.setAttribute('role', 'status');
  const texte = document.createElement('p');
  texte.className = 'bandeau-maj__texte';
  texte.textContent = T.app.nouvelleVersion;
  const bouton = document.createElement('button');
  bouton.type = 'button';
  bouton.className = 'bouton bouton--principal';
  bouton.textContent = T.app.recharger;
  bouton.addEventListener('click', () => {
    bouton.disabled = true;
    rechargementDemande = true;
    enAttente.postMessage({ type: MESSAGE_ACTIVER });
  });
  bandeau.append(texte, bouton);
  document.body.append(bandeau);
  document.body.toggleAttribute('data-mise-a-jour', true);
}

/** Enregistre sw.js (chemin relatif : l'app peut vivre dans un sous-dossier). */
async function enregistrerServiceWorker() {
  if (!('serviceWorker' in navigator) || !contexteSecurise()) return;
  // À la première installation, le service worker prend la main sans qu'il faille recharger
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (rechargementDemande) location.reload();
  });
  let enregistrement;
  try {
    enregistrement = await navigator.serviceWorker.register('sw.js');
  } catch (erreur) {
    console.warn(erreur);
    return;
  }
  // Enregistrement refusé sans erreur (service worker bloqué par le navigateur ou un outil)
  if (!enregistrement) return;
  // Une version attendait déjà (onglet rouvert) : on la propose
  if (enregistrement.waiting && navigator.serviceWorker.controller) proposerMiseAJour(enregistrement.waiting);
  enregistrement.addEventListener('updatefound', () => {
    const nouveau = enregistrement.installing;
    nouveau?.addEventListener('statechange', () => {
      // Installée alors qu'une version contrôle déjà la page : c'est une mise à jour
      if (nouveau.state === 'installed' && navigator.serviceWorker.controller) proposerMiseAJour(nouveau);
    });
  });
}

appliquerTextes();
appliquerIcones();
// Les transitions de vue sont gérées en JS : l'animation CSS des écrans devient inutile
if (typeof document.startViewTransition === 'function') document.documentElement.classList.add('transitions-vues');
window.addEventListener('hashchange', naviguer);
ecranLarge.addEventListener('change', changerDisposition);
naviguer();

// Après le premier affichage : l'installation télécharge tous les fichiers de l'app
if (document.readyState === 'complete') enregistrerServiceWorker();
else window.addEventListener('load', enregistrerServiceWorker, { once: true });
