// E4 — Mode cuisine, une étape à la fois.
// Provisoire : sera remplacé à l'étape 8.

import { T } from '../textes.js';
import { afficherProvisoire } from './provisoire.js';

/**
 * @param {HTMLElement} conteneur
 * @param {{ id: string }} params
 */
export function afficher(conteneur, params) {
  afficherProvisoire(conteneur, {
    titre: T.cuisine.titre,
    params,
    liens: [{ texte: T.cuisine.quitter, href: `#/recette/${encodeURIComponent(params.id)}` }],
  });
}
