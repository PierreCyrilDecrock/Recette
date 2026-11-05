// Carte d'une recette dans la grille de la liste (E1) : un lien vers la fiche, avec le
// visuel, le titre, le temps total et la difficulté. Le visuel par défaut (dégradé
// dérivé de l'id + initiale du titre) est exporté pour être réutilisé par la fiche.
// Les icônes sont provisoires : elles passeront par js/icones.js à l'étape 11.

import { T } from '../textes.js';
import { DIFFICULTES, formaterDuree, initiale, teinteVisuel, tempsTotal } from '../modele.js';

// Icônes statiques (aucun texte saisi par l'utilisateur) : innerHTML est sans risque ici
const SVG_HORLOGE = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/></svg>';
const SVG_COEUR = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10Z"/></svg>';

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
 * Difficulté en 1 à 3 points pleins, avec un texte alternatif (« Difficulté : moyen »).
 * @param {string} difficulte facile, moyen ou difficile
 * @returns {HTMLSpanElement}
 */
export function creerDifficulte(difficulte) {
  const niveau = DIFFICULTES.indexOf(difficulte) + 1;
  const pastille = element('span', 'difficulte');
  pastille.setAttribute('role', 'img');
  pastille.setAttribute('aria-label', T.carte.difficulte(difficulte));
  pastille.dataset.niveau = String(niveau);
  for (let i = 1; i <= DIFFICULTES.length; i++) {
    pastille.append(element('span', i <= niveau ? 'difficulte__point difficulte__point--plein' : 'difficulte__point'));
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
    temps.innerHTML = SVG_HORLOGE;
    temps.append(element('span', 'visuellement-cache', `${T.carte.tempsTotal} `), formaterDuree(total));
    infos.append(temps);
  }
  if (DIFFICULTES.includes(recette.difficulte)) infos.append(creerDifficulte(recette.difficulte));
  if (infos.childElementCount > 0) corps.append(infos);

  lien.append(creerVisuel(recette), corps);

  // Badge favori posé sur le visuel (positionné en CSS). Placé après le titre dans le
  // DOM pour que le nom du lien commence par le titre de la recette.
  if (recette.favori === true) {
    const badge = element('span', 'carte-recette__favori');
    badge.innerHTML = SVG_COEUR;
    badge.append(element('span', 'visuellement-cache', T.carte.favori));
    lien.append(badge);
  }

  const item = element('li', 'grille-recettes__item');
  item.append(lien);
  return item;
}
