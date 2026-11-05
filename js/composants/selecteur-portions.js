// Sélecteur de portions : boutons − et + autour de la valeur (annoncée par aria-live).
// Utilisé par la fiche (E2) et le formulaire (E3). La valeur est bornée de 1 à 100 ;
// chaque changement émet l'événement EVENEMENT_PORTIONS (detail.portions).

import { T } from '../textes.js';
import { LIMITES } from '../modele.js';

/** Nom de l'événement émis (et propagé) à chaque changement de valeur. */
export const EVENEMENT_PORTIONS = 'changement-portions';

// Icônes statiques : innerHTML est sans risque ici
const SVG_MOINS = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M6 12h12"/></svg>';
const SVG_PLUS = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 6v12M6 12h12"/></svg>';

/** Borne une valeur entre min et max (entier). */
const borner = (valeur, min, max) => Math.min(max, Math.max(min, Math.round(valeur)));

/**
 * Crée un sélecteur de portions. L'élément renvoyé expose une propriété `valeur`
 * (lecture et écriture ; l'écriture n'émet pas d'événement).
 * @param {object} [options]
 * @param {number} [options.valeur] valeur initiale (4 par défaut)
 * @param {number} [options.min] borne basse (1 par défaut)
 * @param {number} [options.max] borne haute (100 par défaut)
 * @returns {HTMLDivElement & { valeur: number }}
 */
export function creerSelecteurPortions({
  valeur = 4,
  min = LIMITES.portionsMin,
  max = LIMITES.portionsMax,
} = {}) {
  const racine = document.createElement('div');
  racine.className = 'selecteur-portions';
  racine.setAttribute('role', 'group');
  racine.setAttribute('aria-label', T.portions.groupe);

  const creerBouton = (classe, libelle, icone) => {
    const bouton = document.createElement('button');
    bouton.type = 'button';
    bouton.className = `selecteur-portions__bouton ${classe}`;
    bouton.setAttribute('aria-label', libelle);
    bouton.innerHTML = icone;
    return bouton;
  };
  const moins = creerBouton('selecteur-portions__moins', T.portions.moins, SVG_MOINS);
  const plus = creerBouton('selecteur-portions__plus', T.portions.plus, SVG_PLUS);

  // Zone annoncée : « 6 portions » est lu à chaque changement
  const affichage = document.createElement('output');
  affichage.className = 'selecteur-portions__valeur';
  affichage.setAttribute('aria-live', 'polite');
  affichage.setAttribute('aria-atomic', 'true');
  const nombre = document.createElement('span');
  nombre.className = 'selecteur-portions__nombre';
  const unite = document.createElement('span');
  unite.className = 'selecteur-portions__unite';
  affichage.append(nombre, ' ', unite);

  racine.append(moins, affichage, plus);

  let courante = borner(valeur, min, max);

  /** Met à jour l'affichage. Aux bornes, le bouton reste focalisable (aria-disabled). */
  function rendre() {
    nombre.textContent = String(courante);
    unite.textContent = T.portions.unite(courante);
    moins.setAttribute('aria-disabled', String(courante <= min));
    plus.setAttribute('aria-disabled', String(courante >= max));
  }

  /** Change la valeur et émet l'événement si elle a vraiment changé. */
  function changer(nouvelle) {
    const bornee = borner(nouvelle, min, max);
    if (bornee === courante) return;
    courante = bornee;
    rendre();
    racine.dispatchEvent(new CustomEvent(EVENEMENT_PORTIONS, { bubbles: true, detail: { portions: courante } }));
  }

  moins.addEventListener('click', () => changer(courante - 1));
  plus.addEventListener('click', () => changer(courante + 1));
  // Flèches haut / bas sur les boutons, comme un champ numérique
  racine.addEventListener('keydown', (evenement) => {
    const pas = { ArrowUp: 1, ArrowDown: -1 }[evenement.key];
    if (!pas) return;
    evenement.preventDefault();
    changer(courante + pas);
  });

  Object.defineProperty(racine, 'valeur', {
    get: () => courante,
    set: (nouvelle) => {
      courante = borner(Number(nouvelle) || min, min, max);
      rendre();
    },
  });

  rendre();
  return /** @type {HTMLDivElement & { valeur: number }} */ (racine);
}
