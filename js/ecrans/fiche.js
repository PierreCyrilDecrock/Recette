// E2 — Fiche recette.
// Provisoire : sera remplacé à l'étape 5.

import { T } from '../textes.js';
import { afficherProvisoire } from './provisoire.js';

/**
 * @param {HTMLElement} conteneur
 * @param {{ id: string }} params
 */
export function afficher(conteneur, params) {
  const id = encodeURIComponent(params.id);
  afficherProvisoire(conteneur, {
    titre: T.fiche.titre,
    params,
    liens: [
      { texte: T.fiche.cuisiner, href: `#/cuisine/${id}`, principal: true },
      { texte: T.fiche.modifier, href: `#/edition/${id}` },
    ],
  });
}
