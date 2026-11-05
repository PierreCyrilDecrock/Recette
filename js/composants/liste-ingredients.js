// Liste d'ingrédients affichée (fiche E2, panneau du mode cuisine E4) : quantité et unité
// en gras, nom, précision en gris ; les ingrédients sont regroupés par section.

import { formaterQuantite } from '../modele.js';

/** Crée un élément à partir d'une balise, d'une classe et d'un texte (via textContent). */
function element(balise, classe, texte) {
  const el = document.createElement(balise);
  if (classe) el.className = classe;
  if (texte !== undefined) el.textContent = texte;
  return el;
}

const rempli = (valeur) => typeof valeur === 'string' && valeur.trim() !== '';

/** Ligne d'ingrédient : quantité et unité en gras, nom, précision en gris. */
export function creerLigneIngredient(ingredient) {
  const item = element('li', 'ingredient');
  const quantite = formaterQuantite(ingredient.quantite, ingredient.unite);
  if (quantite) item.append(element('strong', 'ingredient__quantite', quantite), ' ');
  item.append(element('span', 'ingredient__nom', ingredient.nom));
  if (rempli(ingredient.precision)) {
    item.append(' ', element('span', 'ingredient__precision', ingredient.precision.trim()));
  }
  return item;
}

/**
 * Listes d'ingrédients regroupées par section (titre h3 avant chaque section nommée).
 * Les quantités doivent déjà être mises à l'échelle (mettreALEchelle).
 * @param {import('../modele.js').Ingredient[]} ingredients
 * @returns {HTMLElement[]} titres de section et listes <ul>, dans l'ordre
 */
export function creerListeIngredients(ingredients) {
  const morceaux = [];
  let liste = null;
  let sectionCourante = '';
  for (const ingredient of ingredients) {
    const nomSection = rempli(ingredient.section) ? ingredient.section.trim() : '';
    if (!liste || nomSection !== sectionCourante) {
      if (nomSection) morceaux.push(element('h3', 'ingredients__section', nomSection));
      liste = element('ul', 'ingredients');
      liste.setAttribute('role', 'list');
      morceaux.push(liste);
      sectionCourante = nomSection;
    }
    liste.append(creerLigneIngredient(ingredient));
  }
  return morceaux;
}
