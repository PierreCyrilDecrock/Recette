// Carte d'une recette dans la grille de la liste (E1) : un lien vers la fiche, avec le
// visuel, le titre, le temps total et la difficulté. Le visuel par défaut (dégradé
// dérivé de l'id + initiale du titre) et la difficulté en toques sont exportés pour être
// réutilisés par la fiche, le mode cuisine et le formulaire.

import { T } from '../textes.js';
import { DIFFICULTES, formaterDuree, initiale, teinteVisuel, tempsTotal } from '../modele.js';
import { icone } from '../icones.js';

/** Crée un élément à partir d'une balise, d'une classe et d'un texte (via textContent). */
function element(balise, classe, texte) {
  const el = document.createElement(balise);
  if (classe) el.className = classe;
  if (texte !== undefined) el.textContent = texte;
  return el;
}

/**
 * Visuel par défaut d'une recette : dégradé de couleur stable (teinte tirée de l'id,
 * transmise au CSS par --teinte) et initiale du titre. Purement décoratif.
 * @param {import('../modele.js').Recette} recette
 * @returns {HTMLDivElement}
 */
export function creerVisuel(recette) {
  const visuel = element('div', 'visuel');
  visuel.setAttribute('aria-hidden', 'true');
  visuel.style.setProperty('--teinte', String(teinteVisuel(recette.id)));
  visuel.append(element('span', 'visuel__initiale', initiale(recette.titre)));
  return visuel;
}

/**
 * Difficulté en toques : 1, 2 ou 3 toques remplies, les autres en filigrane. Même rendu
 * partout (carte, fiche, formulaire).
 * @param {string} difficulte facile, moyen ou difficile
 * @param {object} [options]
 * @param {boolean} [options.decoratif] vrai quand le mot est écrit à côté : les toques sont
 *   alors masquées aux lecteurs d'écran ; sinon elles portent « Difficulté : moyen »
 * @param {number} [options.taille] côté d'une toque en pixels
 * @returns {HTMLSpanElement}
 */
export function creerDifficulte(difficulte, { decoratif = false, taille = 16 } = {}) {
  const niveau = DIFFICULTES.indexOf(difficulte) + 1;
  const pastille = element('span', 'difficulte');
  if (decoratif) {
    pastille.setAttribute('aria-hidden', 'true');
  } else {
    pastille.setAttribute('role', 'img');
    pastille.setAttribute('aria-label', T.carte.difficulte(difficulte));
  }
  pastille.dataset.niveau = String(niveau);
  for (let i = 1; i <= DIFFICULTES.length; i++) {
    const pleine = i <= niveau;
    pastille.append(icone(pleine ? 'toque-pleine' : 'toque', {
      taille,
      classe: pleine ? 'difficulte__toque difficulte__toque--pleine' : 'difficulte__toque',
    }));
  }
  return pastille;
}

/**
 * Carte cliquable d'une recette, enveloppée dans un <li> (la grille est une liste).
 * @param {import('../modele.js').Recette} recette
 * @returns {HTMLLIElement}
 */
export function creerCarteRecette(recette) {
  const lien = element('a', 'carte-recette');
  lien.href = `#/recette/${encodeURIComponent(recette.id)}`;

  const corps = element('div', 'carte-recette__corps');
  corps.append(element('h2', 'carte-recette__titre', recette.titre));

  const infos = element('p', 'carte-recette__infos');
  const total = tempsTotal(recette);
  if (total > 0) {
    const temps = element('span', 'carte-recette__temps');
    temps.append(
      icone('horloge', { taille: 16 }),
      element('span', 'visuellement-cache', `${T.carte.tempsTotal} `),
      formaterDuree(total),
    );
    infos.append(temps);
  }
  if (DIFFICULTES.includes(recette.difficulte)) infos.append(creerDifficulte(recette.difficulte));
  if (infos.childElementCount > 0) corps.append(infos);

  lien.append(creerVisuel(recette), corps);

  // Badge favori posé sur le visuel (positionné en CSS). Placé après le titre dans le
  // DOM pour que le nom du lien commence par le titre de la recette.
  if (recette.favori === true) {
    const badge = element('span', 'carte-recette__favori');
    badge.append(icone('coeur-plein', { taille: 18 }), element('span', 'visuellement-cache', T.carte.favori));
    lien.append(badge);
  }

  const item = element('li', 'grille-recettes__item');
  item.append(lien);
  return item;
}
