// Liste de lignes réordonnables du formulaire E3 (ingrédients, étapes).
// Chaque ligne a une poignée de glisser-déposer (Pointer Events : souris, doigt, stylet)
// et un menu de ligne (Monter, Descendre, actions propres à la ligne, Supprimer), qui
// sert aussi d'alternative accessible au glisser-déposer. La nouvelle position est
// annoncée par une zone aria-live. Chaque changement de structure (ajout, suppression,
// déplacement) émet EVENEMENT_LIGNES.

import { T } from '../textes.js';

/** Nom de l'événement émis (et propagé) quand des lignes sont ajoutées, retirées ou déplacées. */
export const EVENEMENT_LIGNES = 'changement-lignes';

// Icônes statiques : innerHTML est sans risque ici
const SVG_POIGNEE = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="9" cy="6" r="1.5"/><circle cx="15" cy="6" r="1.5"/><circle cx="9" cy="12" r="1.5"/><circle cx="15" cy="12" r="1.5"/><circle cx="9" cy="18" r="1.5"/><circle cx="15" cy="18" r="1.5"/></svg>';
const SVG_MENU = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="12" cy="5" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="12" cy="19" r="1.5"/></svg>';
const SVG_MONTER = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 19V5M6 11l6-6 6 6"/></svg>';
const SVG_DESCENDRE = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 5v14M6 13l6 6 6-6"/></svg>';
const SVG_SUPPRIMER = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3"/></svg>';

// Défilement automatique pendant un glissement près du haut ou du bas de l'écran
const MARGE_DEFILEMENT = 72;
const VITESSE_DEFILEMENT = 12;

let numeroListe = 0;

/** Crée un élément à partir d'une balise, d'une classe et d'un texte (via textContent). */
function element(balise, classe, texte) {
  const el = document.createElement(balise);
  if (classe) el.className = classe;
  if (texte !== undefined) el.textContent = texte;
  return el;
}

/**
 * Contenu d'une ligne, fourni par l'écran.
 * @typedef {Object} ContenuLigne
 * @property {HTMLElement} element contenu affiché dans la ligne (champs)
 * @property {() => HTMLElement} premier champ qui reçoit le focus à l'arrivée sur la ligne
 * @property {() => HTMLElement} dernier champ qui reçoit le focus en remontant (retour arrière)
 * @property {(numero: number) => void} numeroter met à jour numéro et libellés
 * @property {{ libelle: () => string, icone: () => string, executer: () => void }[]} [actions]
 *   actions propres à la ligne, ajoutées au menu
 */

/**
 * Crée une liste de lignes.
 * @param {object} options
 * @param {(donnees: object) => ContenuLigne} options.creerContenu fabrique le contenu d'une ligne
 * @param {{ menu: (n: number) => string, position: (n: number, total: number) => string }} options.libelles
 *   libellé du bouton de menu de la ligne n, annonce de la nouvelle position
 * @returns {{
 *   element: HTMLOListElement, annonce: HTMLElement,
 *   ajouter: (donnees?: object, options?: { apres?: HTMLElement, focaliser?: boolean }) => HTMLLIElement,
 *   supprimer: (item: HTMLLIElement, options?: { remonter?: boolean }) => void,
 *   retirer: (item: HTMLLIElement) => void,
 *   remplacer: (liste: object[]) => void,
 *   items: () => HTMLLIElement[], contenu: (item: HTMLElement) => ContenuLigne,
 *   ligneDe: (noeud: Node) => HTMLLIElement | null, annoncer: (texte: string) => void,
 *   nettoyer: () => void,
 * }}
 */
export function creerListeLignes({ creerContenu, libelles }) {
  const L = T.lignes;
  const prefixe = `liste-lignes-${++numeroListe}`;
  let numeroLigne = 0;

  const liste = element('ol', 'lignes');
  liste.setAttribute('role', 'list');
  const annonce = element('p', 'visuellement-cache');
  annonce.setAttribute('aria-live', 'polite');

  /** @type {WeakMap<HTMLElement, ContenuLigne>} */
  const contenus = new WeakMap();
  const items = () => [...liste.children];

  function signaler() {
    liste.dispatchEvent(new CustomEvent(EVENEMENT_LIGNES, { bubbles: true }));
  }

  function annoncer(texte) {
    // Vider puis remplir : un même texte est annoncé à nouveau
    annonce.textContent = '';
    requestAnimationFrame(() => { annonce.textContent = texte; });
  }

  /** Met à jour les numéros et les libellés de toutes les lignes. */
  function numeroter() {
    items().forEach((item, index) => {
      contenus.get(item).numeroter(index + 1);
      item.querySelector('.menu__declencheur').setAttribute('aria-label', libelles.menu(index + 1));
    });
  }

  // --- Création d'une ligne -----------------------------------------------------------

  function creerItem(donnees = {}) {
    const contenu = creerContenu(donnees);
    const item = element('li', 'ligne');
    const poignee = element('span', 'ligne__poignee');
    poignee.innerHTML = SVG_POIGNEE;
    poignee.setAttribute('aria-hidden', 'true'); // alternative au clavier : le menu de ligne

    const menu = element('div', 'menu ligne__menu');
    const declencheur = element('button', 'bouton bouton--icone menu__declencheur');
    declencheur.type = 'button';
    declencheur.innerHTML = SVG_MENU;
    declencheur.setAttribute('aria-expanded', 'false');
    const id = `${prefixe}-menu-${++numeroLigne}`;
    declencheur.setAttribute('aria-controls', id);
    const listeMenu = element('ul', 'menu__liste');
    listeMenu.id = id;
    listeMenu.setAttribute('role', 'list');
    listeMenu.hidden = true;
    menu.append(listeMenu, declencheur);

    item.append(contenu.element, poignee, menu);
    contenus.set(item, contenu);
    return item;
  }

  /**
   * Ajoute une ligne (à la fin, ou après une autre ligne).
   * @returns {HTMLLIElement}
   */
  function ajouter(donnees = {}, { apres = null, focaliser = false } = {}) {
    const item = creerItem(donnees);
    if (apres) apres.after(item);
    else liste.append(item);
    numeroter();
    signaler();
    if (focaliser) contenus.get(item).premier().focus();
    return item;
  }

  /**
   * Supprime une ligne. Le focus passe à la ligne suivante (ou précédente) ; avec
   * remonter, au dernier champ de la ligne précédente, curseur en fin de texte.
   * La liste garde toujours au moins une ligne, prête à être remplie.
   */
  function supprimer(item, { remonter = false } = {}) {
    const precedente = item.previousElementSibling;
    const voisine = remonter ? precedente : (item.nextElementSibling ?? precedente);
    item.remove();
    const cible = voisine ?? creerItem();
    if (!cible.isConnected) liste.append(cible);
    numeroter();
    signaler();
    const champ = remonter ? contenus.get(cible).dernier() : contenus.get(cible).premier();
    champ.focus();
    if (remonter && typeof champ.setSelectionRange === 'function') {
      const fin = champ.value.length;
      champ.setSelectionRange(fin, fin);
    }
  }

  /** Retire une ligne sans déplacer le focus (la liste garde au moins une ligne). */
  function retirer(item) {
    item.remove();
    if (liste.children.length === 0) liste.append(creerItem());
    numeroter();
    signaler();
  }

  /** Remplace toutes les lignes (au moins une ligne vide). */
  function remplacer(listeDonnees) {
    fermerMenu();
    const donnees = listeDonnees?.length > 0 ? listeDonnees : [{}];
    liste.replaceChildren(...donnees.map(creerItem));
    numeroter();
  }

  /**
   * Déplace une ligne d'un cran (−1 : vers le haut) et annonce sa position. C'est la
   * voisine qui change de place : la ligne garde ainsi son focus et sa capture du pointeur.
   */
  function echanger(item, sens) {
    const voisine = sens < 0 ? item.previousElementSibling : item.nextElementSibling;
    if (!voisine) return false;
    if (sens < 0) item.after(voisine);
    else item.before(voisine);
    return true;
  }

  function deplacer(item, sens) {
    if (echanger(item, sens)) apresDeplacement(item);
  }

  function apresDeplacement(item) {
    numeroter();
    signaler();
    annoncer(libelles.position(items().indexOf(item) + 1, items().length));
  }

  // --- Menu de ligne (motif « disclosure ») ----------------------------------------------

  let menuOuvert = null;

  /**
   * Ouvre le menu d'une ligne : ses actions sont reconstruites à chaque ouverture.
   * Monter et Descendre rendent le focus au bouton du menu, qui suit la ligne.
   */
  function ouvrirMenu(item) {
    fermerMenu();
    const declencheur = item.querySelector('.menu__declencheur');
    const listeMenu = item.querySelector('.menu__liste');
    const contenu = contenus.get(item);
    const actions = [];
    if (item.previousElementSibling) actions.push({ libelle: L.monter, icone: SVG_MONTER, executer: () => deplacer(item, -1) });
    if (item.nextElementSibling) actions.push({ libelle: L.descendre, icone: SVG_DESCENDRE, executer: () => deplacer(item, 1) });
    for (const action of contenu.actions ?? []) {
      actions.push({ libelle: action.libelle(), icone: action.icone(), executer: action.executer, garderFocus: true });
    }
    actions.push({
      libelle: L.supprimer, icone: SVG_SUPPRIMER, danger: true, garderFocus: true,
      executer: () => supprimer(item),
    });

    listeMenu.replaceChildren(...actions.map((action) => {
      const li = element('li');
      const bouton = element('button', `menu__action${action.danger ? ' menu__action--danger' : ''}`);
      bouton.type = 'button';
      bouton.innerHTML = action.icone;
      bouton.append(element('span', undefined, action.libelle));
      bouton.addEventListener('click', () => {
        fermerMenu({ rendreFocus: !action.garderFocus });
        action.executer();
      });
      li.append(bouton);
      return li;
    }));

    listeMenu.hidden = false;
    // Le menu s'ouvre vers le bas s'il manque de place au-dessus du bouton
    const haut = declencheur.getBoundingClientRect().top;
    listeMenu.classList.toggle('menu__liste--bas', haut - listeMenu.offsetHeight - 8 < 72);
    declencheur.setAttribute('aria-expanded', 'true');
    menuOuvert = item;
    listeMenu.querySelector('button').focus();
  }

  function fermerMenu({ rendreFocus = false } = {}) {
    if (!menuOuvert) return;
    const item = menuOuvert;
    menuOuvert = null;
    item.querySelector('.menu__liste').hidden = true;
    const declencheur = item.querySelector('.menu__declencheur');
    declencheur.setAttribute('aria-expanded', 'false');
    if (rendreFocus) declencheur.focus();
  }

  liste.addEventListener('click', (evenement) => {
    const declencheur = evenement.target.closest('.menu__declencheur');
    if (!declencheur) return;
    const item = declencheur.closest('.ligne');
    if (menuOuvert === item) fermerMenu();
    else ouvrirMenu(item);
  });

  liste.addEventListener('keydown', (evenement) => {
    if (!menuOuvert || !evenement.target.closest('.menu')) return;
    const boutons = [...menuOuvert.querySelectorAll('.menu__action')];
    const index = boutons.indexOf(evenement.target);
    if (evenement.key === 'Escape') {
      evenement.preventDefault();
      evenement.stopPropagation();
      fermerMenu({ rendreFocus: true });
    } else if ((evenement.key === 'ArrowDown' || evenement.key === 'ArrowUp') && index >= 0) {
      evenement.preventDefault();
      const pas = evenement.key === 'ArrowDown' ? 1 : -1;
      boutons[(index + pas + boutons.length) % boutons.length].focus();
    }
  });

  liste.addEventListener('focusout', (evenement) => {
    if (!menuOuvert) return;
    const menu = menuOuvert.querySelector('.menu');
    if (evenement.relatedTarget && !menu.contains(evenement.relatedTarget)) fermerMenu();
  });

  const clicExterieur = (evenement) => {
    if (menuOuvert && !menuOuvert.querySelector('.menu').contains(evenement.target)) fermerMenu();
  };
  document.addEventListener('pointerdown', clicExterieur);

  // --- Glisser-déposer avec les Pointer Events --------------------------------------------

  let glissement = null;

  liste.addEventListener('pointerdown', (evenement) => {
    const poignee = evenement.target.closest('.ligne__poignee');
    if (!poignee || glissement || (evenement.pointerType === 'mouse' && evenement.button !== 0)) return;
    evenement.preventDefault();
    fermerMenu();
    const item = poignee.closest('.ligne');
    const boite = item.getBoundingClientRect();
    poignee.setPointerCapture(evenement.pointerId);
    glissement = {
      item,
      poignee,
      pointeur: evenement.pointerId,
      indexDepart: items().indexOf(item),
      // Distance entre le pointeur et le haut de la ligne, conservée pendant le glissement
      prise: evenement.clientY - boite.top,
      y: evenement.clientY,
      translation: 0,
      animation: requestAnimationFrame(defilerAutomatiquement),
    };
    item.classList.add('ligne--glissee');
    liste.classList.add('lignes--glissement');
  });

  /** Place la ligne sous le pointeur, en l'échangeant avec ses voisines si besoin. */
  function suivrePointeur() {
    const { item } = glissement;
    const hauteur = item.offsetHeight;
    const hautVoulu = glissement.y - glissement.prise;
    const precedente = item.previousElementSibling;
    const suivante = item.nextElementSibling;
    // Un échange au plus par mouvement : la ligne avance d'un cran à la fois
    const boitePrecedente = precedente?.getBoundingClientRect();
    const boiteSuivante = suivante?.getBoundingClientRect();
    if (boitePrecedente && hautVoulu < boitePrecedente.top + boitePrecedente.height / 2) {
      echanger(item, -1);
    } else if (boiteSuivante && hautVoulu + hauteur > boiteSuivante.top + boiteSuivante.height / 2) {
      echanger(item, 1);
    }
    // Position naturelle de la ligne (sans sa translation actuelle)
    const hautNaturel = item.getBoundingClientRect().top - glissement.translation;
    glissement.translation = hautVoulu - hautNaturel;
    item.style.transform = `translateY(${glissement.translation}px)`;
  }

  function defilerAutomatiquement() {
    if (!glissement) return;
    const { y } = glissement;
    let pas = 0;
    if (y < MARGE_DEFILEMENT) pas = -VITESSE_DEFILEMENT;
    else if (y > window.innerHeight - MARGE_DEFILEMENT) pas = VITESSE_DEFILEMENT;
    if (pas !== 0) {
      window.scrollBy(0, pas);
      suivrePointeur();
    }
    glissement.animation = requestAnimationFrame(defilerAutomatiquement);
  }

  liste.addEventListener('pointermove', (evenement) => {
    if (!glissement || evenement.pointerId !== glissement.pointeur) return;
    evenement.preventDefault();
    glissement.y = evenement.clientY;
    suivrePointeur();
  });

  function terminerGlissement(evenement) {
    if (!glissement || evenement.pointerId !== glissement.pointeur) return;
    const { item, indexDepart, animation } = glissement;
    cancelAnimationFrame(animation);
    glissement = null;
    item.classList.remove('ligne--glissee');
    item.style.transform = '';
    liste.classList.remove('lignes--glissement');
    if (items().indexOf(item) !== indexDepart) apresDeplacement(item);
  }
  liste.addEventListener('pointerup', terminerGlissement);
  liste.addEventListener('pointercancel', terminerGlissement);
  liste.addEventListener('lostpointercapture', terminerGlissement);

  return {
    element: liste,
    annonce,
    ajouter,
    supprimer,
    retirer,
    remplacer,
    items,
    contenu: (item) => contenus.get(item),
    ligneDe: (noeud) => {
      const item = noeud instanceof Element ? noeud.closest('.ligne') : null;
      return item && item.parentElement === liste ? item : null;
    },
    annoncer,
    nettoyer: () => document.removeEventListener('pointerdown', clicExterieur),
  };
}
