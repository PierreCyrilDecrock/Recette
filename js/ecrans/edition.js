// E3 — Création (#/nouvelle) et modification (#/edition/:id) d'une recette.
// Provisoire : sera remplacé aux étapes 6 et 7.

import { T } from '../textes.js';
import { afficherProvisoire } from './provisoire.js';

/**
 * @param {HTMLElement} conteneur
 * @param {{ id?: string }} params id absent : nouvelle recette
 */
export function afficher(conteneur, params) {
  const modification = params.id !== undefined;
  afficherProvisoire(conteneur, {
    titre: modification ? T.edition.titreModification : T.edition.titreNouvelle,
    params,
    liens: [
      {
        texte: T.edition.annuler,
        href: modification ? `#/recette/${encodeURIComponent(params.id)}` : '#/',
      },
    ],
  });
}
