// E5 — Réglages : thème, catégories, données, à propos.
// Provisoire : sera remplacé à l'étape 9.

import { T } from '../textes.js';
import { afficherProvisoire } from './provisoire.js';

/**
 * @param {HTMLElement} conteneur
 * @param {object} params
 */
export function afficher(conteneur, params) {
  afficherProvisoire(conteneur, { titre: T.reglages.titre, params });
}
