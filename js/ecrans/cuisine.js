// E4 — Mode cuisine (#/cuisine/:id?portions=N&etape=K) : une étape à la fois, en grand.
// - Navigation : balayage horizontal (Pointer Events), boutons Précédent / Suivant, flèches
//   du clavier ; Échap ou × pour quitter. L'étape est dans l'URL (« etape=3 », « etape=fin ») :
//   le bouton retour du navigateur revient à l'étape précédente. Le routeur transmet les
//   changements d'étape à mettreAJour, sans reconstruire l'écran.
// - Ingrédients cités (trouverIngredientsDansTexte) : boutons qui ouvrent une bulle
//   (popover) avec la quantité ajustée aux portions ; liste complète dans un panneau
//   (<dialog> qui monte du bas).
// - Écran maintenu allumé (Wake Lock), redemandé au retour sur l'onglet.

import { T } from '../textes.js';
import { lireRecette } from '../db.js';
import {
  ETAPE_FIN, formaterQuantite, lireEtape, lirePortions, mettreALEchelle, sensGlissement,
  trouverIngredientsDansTexte,
} from '../modele.js';
import { creerListeIngredients } from '../composants/liste-ingredients.js';
import { icone } from '../icones.js';

/** Distance (px) au-delà de laquelle un geste est reconnu comme horizontal ou vertical. */
const SEUIL_DEPART = 10;
/** Durée de la transition entre deux étapes (ms). */
const DUREE_TRANSITION = 200;
/** Résistance du glissement quand il n'y a plus d'étape de ce côté. */
const RESISTANCE = 0.3;

/** Crée un élément à partir d'une balise, d'une classe et d'un texte (via textContent). */
function element(balise, classe, texte) {
  const el = document.createElement(balise);
  if (classe) el.className = classe;
  if (texte !== undefined) el.textContent = texte;
  return el;
}

/** Vrai si l'utilisateur demande moins d'animations. */
const mouvementReduit = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;

/** Vrai si le navigateur connaît l'API Popover. */
const popoverDisponible = () => typeof HTMLElement !== 'undefined'
  && Object.prototype.hasOwnProperty.call(HTMLElement.prototype, 'popover');

/** Une bulle (popover) est ouverte : Échap la ferme, sans quitter le mode cuisine. */
function bulleOuverte() {
  try {
    return document.querySelector(':popover-open') !== null;
  } catch {
    return document.querySelector('.bulle:not([hidden])') !== null;
  }
}

/**
 * @param {HTMLElement} conteneur
 * @param {{ id: string, portions?: string, etape?: string }} params
 * @returns {Promise<(() => void) | undefined>} nettoyage, avec mettreAJour(params)
 */
export async function afficher(conteneur, params) {
  const C = T.cuisine;
  let recette;
  try {
    recette = await lireRecette(params.id);
  } catch (erreur) {
    console.warn(erreur);
    conteneur.append(ecranMessage(C.erreurTitre, erreur?.message || T.stockage.generique, true));
    return undefined;
  }
  if (!recette) {
    conteneur.append(ecranMessage(C.introuvableTitre, C.introuvableTexte));
    return undefined;
  }

  const idUrl = encodeURIComponent(recette.id);
  const portions = lirePortions(params.portions, recette.portions);
  const ingredients = mettreALEchelle(recette.ingredients, recette.portions, portions);
  const etapes = recette.etapes;
  const total = etapes.length;
  // La fiche retrouve le nombre de portions choisi (s'il venait de l'URL)
  const requetePortions = params.portions !== undefined ? `?portions=${portions}` : '';
  const urlFiche = `#/recette/${idUrl}${requetePortions}`;

  /** URL d'une étape : « etape » est omis pour la première. */
  function urlEtape(etape) {
    const requete = new URLSearchParams();
    if (params.portions !== undefined) requete.set('portions', String(portions));
    if (etape !== 1) requete.set('etape', String(etape));
    const texte = requete.toString();
    return `#/cuisine/${idUrl}${texte ? `?${texte}` : ''}`;
  }

  /** Rang d'une étape pour comparer : la fin vient après la dernière. */
  const rang = (etape) => (etape === ETAPE_FIN ? total + 1 : etape);

  let actif = true;
  let courante = null;

  // --- Structure ---------------------------------------------------------------------------
  const section = element('section', 'ecran cuisine');

  const entete = element('header', 'cuisine__entete');
  const fermer = element('button', 'bouton bouton--icone cuisine__fermer');
  fermer.type = 'button';
  fermer.setAttribute('aria-label', C.quitter);
  fermer.append(icone('croix'));
  const titre = element('h1', 'cuisine__titre', recette.titre);
  const boutonPanneau = element('button', 'bouton cuisine__bouton-ingredients');
  boutonPanneau.type = 'button';
  boutonPanneau.setAttribute('aria-haspopup', 'dialog');
  boutonPanneau.append(icone('liste', { taille: 20 }), element('span', undefined, C.ingredients));
  entete.append(fermer, titre, boutonPanneau);

  const progression = element('div', 'cuisine__progression');
  const texteProgression = element('span', 'cuisine__progression-texte');
  texteProgression.id = 'cuisine-progression';
  const barre = element('progress', 'cuisine__barre');
  barre.max = total;
  barre.setAttribute('aria-labelledby', texteProgression.id);
  progression.append(texteProgression, barre);

  const veille = element('p', 'cuisine__veille');
  veille.setAttribute('role', 'status');
  veille.hidden = true;

  // Scène : la carte de l'étape suit le doigt ; le défilement vertical reste au navigateur
  const scene = element('div', 'cuisine__scene');
  const carte = element('article', 'cuisine__carte');
  carte.setAttribute('aria-live', 'polite');
  carte.setAttribute('aria-atomic', 'true');
  scene.append(carte);

  const navigation = element('div', 'cuisine__navigation');
  navigation.setAttribute('role', 'group');
  navigation.setAttribute('aria-label', C.navigation);
  const precedent = element('button', 'bouton cuisine__precedent');
  precedent.type = 'button';
  precedent.append(icone('chevron-gauche', { taille: 22 }), element('span', undefined, C.precedent));
  const suivant = element('button', 'bouton bouton--principal cuisine__suivant');
  suivant.type = 'button';
  navigation.append(precedent, suivant);

  const panneau = creerPanneau(ingredients, portions);
  section.append(entete, progression, veille, scene, navigation, panneau);
  conteneur.append(section);

  // --- Contenu d'une étape -------------------------------------------------------------------

  let numeroBulle = 0;

  /** Texte de l'étape, ingrédients cités en boutons qui ouvrent leur bulle. */
  function creerTexte(texte) {
    const paragraphe = element('p', 'cuisine__texte');
    let position = 0;
    for (const { debut, fin, indexIngredient } of trouverIngredientsDansTexte(texte, recette.ingredients)) {
      paragraphe.append(texte.slice(position, debut));
      const bouton = element('button', 'cuisine__ingredient', texte.slice(debut, fin));
      bouton.type = 'button';
      const bulle = creerBulle(ingredients[indexIngredient], `cuisine-bulle-${++numeroBulle}`);
      relierBulle(bouton, bulle);
      paragraphe.append(bouton, bulle);
      position = fin;
    }
    paragraphe.append(texte.slice(position));
    return paragraphe;
  }

  /** Écran « Bon appétit ! ». */
  function creerFin() {
    const fin = element('div', 'cuisine__fin');
    const h2 = element('h2', 'cuisine__fin-titre', C.finTitre);
    h2.tabIndex = -1;
    const revenir = element('button', 'bouton bouton--principal cuisine__revenir', C.revenirFiche);
    revenir.type = 'button';
    revenir.addEventListener('click', quitter);
    fin.append(h2, element('p', 'cuisine__fin-texte', C.finTexte), revenir);
    return fin;
  }

  /**
   * Affiche une étape (ou la fin) ; sens : 1 si l'on avance, -1 si l'on recule, 0 sans transition.
   * @param {number|'fin'} etape
   */
  function afficherEtape(etape, sens = 0) {
    const etaitFin = courante === ETAPE_FIN;
    courante = etape;
    const fin = etape === ETAPE_FIN;

    texteProgression.textContent = fin ? C.progressionFin : C.progression(etape, total);
    barre.value = fin ? total : etape;
    carte.setAttribute('aria-label', fin ? C.finTitre : C.etape(etape, total));
    carte.replaceChildren(fin ? creerFin() : creerTexte(etapes[etape - 1].texte));
    carte.classList.toggle('cuisine__carte--fin', fin);

    precedent.setAttribute('aria-disabled', String(etape === 1));
    const derniere = etape === total;
    suivant.hidden = fin;
    const libelleSuivant = element('span', undefined, derniere ? C.termine : C.suivant);
    if (derniere) suivant.replaceChildren(icone('coche', { taille: 22 }), libelleSuivant);
    else suivant.replaceChildren(libelleSuivant, icone('chevron-droite', { taille: 22 }));
    if (fin) carte.querySelector('.cuisine__fin-titre').focus({ preventScroll: true });
    else if (etaitFin && document.activeElement === document.body) suivant.focus();

    // Transition de glissement : la nouvelle carte arrive du côté où l'on va
    carte.style.transform = '';
    if (sens !== 0 && !mouvementReduit() && typeof carte.animate === 'function') {
      carte.animate(
        [{ transform: `translateX(${sens * 40}%)`, opacity: 0 }, { transform: 'none', opacity: 1 }],
        { duration: DUREE_TRANSITION, easing: 'cubic-bezier(0.2, 0, 0, 1)' },
      );
    }
  }

  // --- Navigation ----------------------------------------------------------------------------

  /** Va à une étape : nouvelle entrée d'historique, que le routeur passe à mettreAJour. */
  function allerA(etape) {
    if (etape !== courante) location.hash = urlEtape(etape);
  }

  function avancer() {
    if (courante === ETAPE_FIN) return;
    allerA(courante === total ? ETAPE_FIN : courante + 1);
  }

  function reculer() {
    if (courante === 1) return;
    allerA(courante === ETAPE_FIN ? total : courante - 1);
  }

  // Quitter : on revient d'abord à l'entrée d'historique où le mode cuisine a commencé, puis
  // on la remplace par la fiche. Le bouton retour de la fiche ne repasse pas par les étapes.
  // Position de l'entrée d'historique du début (notée par le routeur avant l'affichage)
  const positionDepart = history.state?.position;
  let sortieEnAttente = null;
  function quitter() {
    const position = history.state?.position;
    const ecart = Number.isInteger(position) && Number.isInteger(positionDepart) ? position - positionDepart : 0;
    if (ecart > 0) {
      sortieEnAttente = urlFiche;
      history.go(-ecart);
    } else {
      location.replace(urlFiche);
    }
  }

  precedent.addEventListener('click', reculer);
  suivant.addEventListener('click', avancer);
  fermer.addEventListener('click', quitter);

  // Clavier : flèches pour changer d'étape, Échap pour quitter (sauf bulle ou panneau ouverts)
  const clavier = (evenement) => {
    if (evenement.defaultPrevented || evenement.altKey || evenement.ctrlKey || evenement.metaKey) return;
    if (panneau.open) return;
    if (evenement.key === 'ArrowRight') {
      evenement.preventDefault();
      avancer();
    } else if (evenement.key === 'ArrowLeft') {
      evenement.preventDefault();
      reculer();
    } else if (evenement.key === 'Escape' && !bulleOuverte()) {
      evenement.preventDefault();
      quitter();
    }
  };
  document.addEventListener('keydown', clavier);

  // --- Balayage (Pointer Events) ------------------------------------------------------------

  let geste = null;
  // Après un balayage, le clic qui suit (sur un ingrédient) est ignoré
  let ignorerClic = false;

  scene.addEventListener('pointerdown', (evenement) => {
    if (!evenement.isPrimary || (evenement.pointerType === 'mouse' && evenement.button !== 0)) return;
    geste = {
      id: evenement.pointerId,
      x0: evenement.clientX,
      y0: evenement.clientY,
      t0: evenement.timeStamp,
      horizontal: null,
      dx: 0,
    };
  });

  scene.addEventListener('pointermove', (evenement) => {
    if (!geste || evenement.pointerId !== geste.id) return;
    const dx = evenement.clientX - geste.x0;
    const dy = evenement.clientY - geste.y0;
    if (geste.horizontal === null) {
      if (Math.abs(dx) < SEUIL_DEPART && Math.abs(dy) < SEUIL_DEPART) return;
      geste.horizontal = Math.abs(dx) > Math.abs(dy);
      // Geste vertical : on laisse défiler la page
      if (!geste.horizontal) {
        geste = null;
        return;
      }
      scene.setPointerCapture(evenement.pointerId);
      carte.classList.add('cuisine__carte--suivie');
      carte.getAnimations?.().forEach((animation) => animation.finish());
    }
    // La carte suit le doigt, avec de la résistance quand il n'y a plus d'étape de ce côté
    const bord = (dx > 0 && courante === 1) || (dx < 0 && courante === ETAPE_FIN);
    geste.dx = dx;
    carte.style.transform = `translateX(${bord ? dx * RESISTANCE : dx}px)`;
  });

  function terminerGeste(evenement, annule = false) {
    if (!geste || evenement.pointerId !== geste.id) return;
    const { horizontal, dx, t0 } = geste;
    geste = null;
    if (!horizontal) return;
    carte.classList.remove('cuisine__carte--suivie');
    ignorerClic = true;
    setTimeout(() => { ignorerClic = false; }, 0);
    const sens = annule ? 0 : sensGlissement({ dx, duree: evenement.timeStamp - t0, largeur: scene.clientWidth });
    const possible = (sens === 1 && courante !== ETAPE_FIN) || (sens === -1 && courante !== 1);
    if (possible) {
      if (sens === 1) avancer();
      else reculer();
      return;
    }
    // Retour en place
    const depart = carte.style.transform;
    carte.style.transform = '';
    if (depart && !mouvementReduit() && typeof carte.animate === 'function') {
      carte.animate([{ transform: depart }, { transform: 'none' }], { duration: DUREE_TRANSITION, easing: 'ease-out' });
    }
  }
  scene.addEventListener('pointerup', (evenement) => terminerGeste(evenement));
  scene.addEventListener('pointercancel', (evenement) => terminerGeste(evenement, true));
  scene.addEventListener('click', (evenement) => {
    if (!ignorerClic) return;
    ignorerClic = false;
    evenement.preventDefault();
    evenement.stopPropagation();
  }, true);

  // --- Panneau des ingrédients ------------------------------------------------------------
  boutonPanneau.addEventListener('click', () => panneau.showModal());

  // --- Écran maintenu allumé (Wake Lock) --------------------------------------------------
  let verrou = null;
  async function demanderVerrou() {
    if (!actif || verrou || document.visibilityState === 'hidden') return;
    if (!('wakeLock' in navigator)) {
      veille.textContent = C.veilleIndisponible;
      veille.hidden = false;
      return;
    }
    try {
      const nouveau = await navigator.wakeLock.request('screen');
      if (!actif) {
        nouveau.release().catch(() => {});
        return;
      }
      verrou = nouveau;
      veille.hidden = true;
      // Le verrou saute quand l'onglet passe en arrière-plan
      verrou.addEventListener?.('release', () => {
        if (verrou === nouveau) verrou = null;
      });
    } catch (erreur) {
      console.warn(erreur);
      veille.textContent = C.veilleIndisponible;
      veille.hidden = false;
    }
  }
  const surVisibilite = () => {
    if (document.visibilityState === 'visible') demanderVerrou();
  };
  document.addEventListener('visibilitychange', surVisibilite);
  demanderVerrou();

  // --- Premier affichage et mises à jour par l'URL ------------------------------------------
  afficherEtape(lireEtape(params.etape, total));

  const nettoyage = () => {
    actif = false;
    document.removeEventListener('keydown', clavier);
    document.removeEventListener('visibilitychange', surVisibilite);
    verrou?.release().catch(() => {});
    verrou = null;
    if (panneau.open) panneau.close();
  };

  /** Changement de requête (étape) : mise à jour sur place ; autres portions : on reconstruit. */
  nettoyage.mettreAJour = (nouveaux) => {
    if (sortieEnAttente) {
      // Revenu au début du mode cuisine : on le remplace par la fiche
      const url = sortieEnAttente;
      sortieEnAttente = null;
      location.replace(url);
      return true;
    }
    if (nouveaux.portions !== params.portions) return false;
    const etape = lireEtape(nouveaux.etape, total);
    if (panneau.open) panneau.close();
    afficherEtape(etape, Math.sign(rang(etape) - rang(courante)));
    return true;
  };
  return nettoyage;
}

/** Bulle d'un ingrédient cité : nom, quantité ajustée (avec l'unité) et précision. */
function creerBulle(ingredient, id) {
  const bulle = element('span', 'bulle');
  bulle.id = id;
  bulle.setAttribute('role', 'note');
  const quantite = formaterQuantite(ingredient.quantite, ingredient.unite);
  bulle.append(
    element('strong', 'bulle__nom', ingredient.nom),
    element('span', quantite ? 'bulle__quantite' : 'bulle__quantite bulle__quantite--libre', quantite || T.cuisine.selonGout),
  );
  if (typeof ingredient.precision === 'string' && ingredient.precision.trim() !== '') {
    bulle.append(element('span', 'bulle__precision', ingredient.precision.trim()));
  }
  return bulle;
}

/**
 * Relie un bouton à sa bulle : API Popover (fermeture au toucher ailleurs et par Échap),
 * sinon simple bascule de l'attribut hidden.
 */
function relierBulle(bouton, bulle) {
  if (popoverDisponible()) {
    bulle.popover = 'auto';
    bouton.popoverTargetElement = bulle;
    bouton.setAttribute('aria-expanded', 'false');
    bulle.addEventListener('toggle', (evenement) => {
      const ouverte = evenement.newState === 'open';
      bouton.setAttribute('aria-expanded', String(ouverte));
      if (ouverte) placerBulle(bulle, bouton);
    });
    return;
  }
  bulle.hidden = true;
  bouton.setAttribute('aria-expanded', 'false');
  bouton.setAttribute('aria-controls', bulle.id);
  bouton.addEventListener('click', () => {
    bulle.hidden = !bulle.hidden;
    bouton.setAttribute('aria-expanded', String(!bulle.hidden));
    if (!bulle.hidden) placerBulle(bulle, bouton);
  });
}

/** Place la bulle sous le bouton (au-dessus s'il manque de place), dans la largeur de l'écran. */
function placerBulle(bulle, bouton) {
  const marge = 8;
  const cible = bouton.getBoundingClientRect();
  const largeur = bulle.offsetWidth;
  const hauteur = bulle.offsetHeight;
  const gauche = Math.min(
    Math.max(marge, cible.left + cible.width / 2 - largeur / 2),
    window.innerWidth - largeur - marge,
  );
  let haut = cible.bottom + marge;
  if (haut + hauteur > window.innerHeight - marge) haut = Math.max(marge, cible.top - hauteur - marge);
  bulle.style.left = `${Math.round(gauche)}px`;
  bulle.style.top = `${Math.round(haut)}px`;
}

/** Panneau « Ingrédients » : <dialog> modal qui monte du bas, liste ajustée aux portions. */
function creerPanneau(ingredients, portions) {
  const C = T.cuisine;
  const panneau = element('dialog', 'panneau');
  panneau.setAttribute('aria-labelledby', 'cuisine-panneau-titre');
  const corps = element('form', 'panneau__corps');
  corps.method = 'dialog';
  const tete = element('div', 'panneau__entete');
  const titres = element('div', 'panneau__titres');
  const h2 = element('h2', 'panneau__titre', C.ingredients);
  h2.id = 'cuisine-panneau-titre';
  titres.append(h2, element('p', 'texte-doux', C.pourPortions(portions)));
  const fermer = element('button', 'bouton bouton--icone panneau__fermer');
  fermer.setAttribute('aria-label', C.fermer);
  fermer.append(icone('croix'));
  fermer.autofocus = true;
  tete.append(titres, fermer);
  const liste = element('div', 'panneau__liste');
  liste.append(...creerListeIngredients(ingredients));
  corps.append(tete, liste);
  panneau.append(corps);
  // Un toucher sur le fond (hors du panneau) le ferme
  panneau.addEventListener('click', (evenement) => {
    if (evenement.target === panneau) panneau.close();
  });
  return panneau;
}

/** Écran affiché si la recette est introuvable ou si la base ne peut pas être lue. */
function ecranMessage(titre, texte, alerte = false) {
  const section = element('section', 'ecran fiche-introuvable');
  const message = element('p', alerte ? 'carte message-erreur' : 'texte-doux', texte);
  if (alerte) message.setAttribute('role', 'alert');
  const voir = element('a', alerte ? 'bouton' : 'bouton bouton--principal', T.cuisine.voirRecettes);
  voir.href = '#/';
  section.append(element('h1', 'titre-ecran', titre), message, voir);
  return section;
}
