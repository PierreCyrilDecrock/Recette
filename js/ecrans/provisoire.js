// Gabarit commun aux écrans provisoires de l'étape 1.
// Il disparaîtra quand chaque écran aura son vrai contenu.

import { T } from '../textes.js';

/**
 * Affiche un écran provisoire : son titre, ses paramètres et des liens de navigation.
 * @param {HTMLElement} conteneur élément <main> de l'application
 * @param {object} options
 * @param {string} options.titre titre de l'écran (h1)
 * @param {object} options.params paramètres de la route
 * @param {{ texte: string, href: string, principal?: boolean }[]} [options.liens] liens d'action
 */
export function afficherProvisoire(conteneur, { titre, params, liens = [] }) {
  const section = document.createElement('section');
  section.className = 'ecran';

  const h1 = document.createElement('h1');
  h1.className = 'titre-ecran';
  h1.textContent = titre;

  const carte = document.createElement('div');
  carte.className = 'carte pile';

  const info = document.createElement('p');
  info.className = 'texte-doux';
  info.textContent = T.provisoire.enConstruction;

  const sousTitre = document.createElement('h2');
  sousTitre.className = 'carte__titre';
  sousTitre.textContent = T.provisoire.parametres;

  carte.append(info, sousTitre, listerParametres(params));

  section.append(h1, carte);

  if (liens.length > 0) {
    const actions = document.createElement('div');
    actions.className = 'rangee actions-provisoires';
    for (const { texte, href, principal } of liens) {
      const lien = document.createElement('a');
      lien.className = principal ? 'bouton bouton--principal' : 'bouton';
      lien.href = href;
      lien.textContent = texte;
      actions.append(lien);
    }
    section.append(actions);
  }

  conteneur.append(section);
}

/** Construit la liste des paramètres (textContent : ils viennent de l'URL). */
function listerParametres(params) {
  const entrees = Object.entries(params);
  if (entrees.length === 0) {
    const vide = document.createElement('p');
    vide.textContent = T.provisoire.aucunParametre;
    return vide;
  }
  const liste = document.createElement('dl');
  liste.className = 'parametres';
  for (const [cle, valeur] of entrees) {
    const terme = document.createElement('dt');
    terme.textContent = cle;
    const definition = document.createElement('dd');
    definition.textContent = String(valeur);
    liste.append(terme, definition);
  }
  return liste;
}
