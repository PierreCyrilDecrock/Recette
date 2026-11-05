// E1 — Liste des recettes (accueil) ; sert aussi l'onglet Favoris (params.favoris).
// Provisoire : sera remplacé à l'étape 4.

import { T } from '../textes.js';
import { afficherProvisoire } from './provisoire.js';

/**
 * @param {HTMLElement} conteneur
 * @param {{ favoris?: boolean }} params
 */
export function afficher(conteneur, params) {
  afficherProvisoire(conteneur, {
    titre: params.favoris ? T.favoris.titre : T.liste.titre,
    params,
    liens: [{ texte: T.liste.exemple, href: '#/recette/exemple' }],
  });
}
