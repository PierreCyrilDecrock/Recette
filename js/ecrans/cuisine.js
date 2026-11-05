// E4 — Mode cuisine, une étape à la fois.
// Provisoire : sera remplacé à l'étape 8.

import { T } from '../textes.js';
import { afficherProvisoire } from './provisoire.js';

/**
 * @param {HTMLElement} conteneur
 * @param {{ id: string, portions?: string }} params portions : choisies sur la fiche (?portions=6)
 */
export function afficher(conteneur, params) {
  // En quittant, la fiche retrouve le nombre de portions choisi
  const requete = params.portions ? `?portions=${encodeURIComponent(params.portions)}` : '';
  afficherProvisoire(conteneur, {
    titre: T.cuisine.titre,
    params,
    liens: [{ texte: T.cuisine.quitter, href: `#/recette/${encodeURIComponent(params.id)}${requete}` }],
  });
}
