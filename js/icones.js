// Jeu d'icônes SVG en ligne, dessinées sur une grille de 24 × 24 : contour de 1,75 px,
// extrémités et angles arrondis, couleur héritée du texte (currentColor).
// icone(nom, { taille, libelle }) crée l'élément <svg> : décoratif (aria-hidden) par
// défaut, image nommée (role="img" + aria-label) quand un libellé est donné.

const NS = 'http://www.w3.org/2000/svg';

/** Attributs communs à toutes les icônes (le CSS peut changer la taille, pas le trait). */
const ATTRIBUTS = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  'stroke-width': '1.75',
  'stroke-linecap': 'round',
  'stroke-linejoin': 'round',
  focusable: 'false',
};

/** Point plein (menus, poignée, liste) : petit disque sans contour. */
const point = (x, y) => `<circle cx="${x}" cy="${y}" r="1.6" fill="currentColor" stroke="none"/>`;

/** Contour de la toque : trois bouffants, puis le bandeau. */
const TOQUE_BOUFFANT = 'M7 16.5v-2.9A3.5 3.5 0 0 1 8 6.7a4 4 0 0 1 8 0 3.5 3.5 0 0 1 1 6.9v2.9';
const TOQUE_BANDEAU = 'M7 16.5h10V19a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1v-2.5Z';
/** Cœur, partagé par les versions vide et pleine. */
const COEUR = 'M12 20s-7.25-4.5-7.25-10.1A4.15 4.15 0 0 1 12 7.2a4.15 4.15 0 0 1 7.25 2.7C19.25 15.5 12 20 12 20Z';

/**
 * Dessins des icônes (contenu du <svg>). Chaînes statiques, sans texte saisi :
 * les insérer par innerHTML est sans risque.
 */
const DESSINS = {
  // Temps, difficulté, portions
  horloge: '<circle cx="12" cy="12" r="8.25"/><path d="M12 7.5V12l3 2"/>',
  toque: `<path d="${TOQUE_BOUFFANT}"/><path d="${TOQUE_BANDEAU}"/>`,
  // Toque remplie (difficulté) : bouffant et bandeau séparés par un mince jour
  'toque-pleine': '<path d="M7 15.25v-1.65A3.5 3.5 0 0 1 8 6.7a4 4 0 0 1 8 0 3.5 3.5 0 0 1 1 6.9v1.65Z" fill="currentColor"/>'
    + '<path d="M7 17.25h10V19a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1v-1.75Z" fill="currentColor"/>',
  portions: '<circle cx="9" cy="8.5" r="3"/><path d="M3.75 19.5a5.25 5.25 0 0 1 10.5 0"/>'
    + '<path d="M15.5 5.75a3 3 0 0 1 0 5.5M17 14.4a5.25 5.25 0 0 1 3.25 5.1"/>',
  minuteur: '<circle cx="12" cy="13.5" r="7"/><path d="M12 13.5V10M10 3h4M12 3v3.5M18 7l1.5-1.5"/>',
  calendrier: '<rect x="4" y="5.5" width="16" height="14.5" rx="2.5"/><path d="M4 10h16M8.5 3.5v4M15.5 3.5v4"/>',
  panier: '<path d="M4 9.5h16l-1.6 8.3a2 2 0 0 1-2 1.7H7.6a2 2 0 0 1-2-1.7L4 9.5Z"/>'
    + '<path d="M8.5 9.5 11 4.5M15.5 9.5 13 4.5M9.5 13v3M14.5 13v3"/>',

  // Favori
  coeur: `<path d="${COEUR}"/>`,
  'coeur-plein': `<path d="${COEUR}" fill="currentColor"/>`,

  // Actions
  recherche: '<circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.4-4.4"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  moins: '<path d="M5 12h14"/>',
  crayon: '<path d="M4.5 19.5h3.75L18.6 9.15a2.2 2.2 0 0 0 0-3.1l-.65-.65a2.2 2.2 0 0 0-3.1 0L4.5 15.75v3.75Z"/>'
    + '<path d="m13.5 6.75 3.75 3.75"/>',
  copie: '<rect x="8.5" y="8.5" width="11" height="11" rx="2.5"/>'
    + '<path d="M15.5 8.5v-2a2 2 0 0 0-2-2h-7a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h2"/>',
  partage: '<path d="M12 14.5V3.75M8 7.5l4-3.75 4 3.75"/>'
    + '<path d="M8.5 10.5H7a2 2 0 0 0-2 2V18a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-5.5a2 2 0 0 0-2-2h-1.5"/>',
  poubelle: '<path d="M4.5 7h15M10 11v5.5M14 11v5.5M6.5 7l.8 11.2a2 2 0 0 0 2 1.8h5.4a2 2 0 0 0 2-1.8L17.5 7"/>'
    + '<path d="M9.5 7V5a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1v2"/>',
  croix: '<path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/>',
  coche: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  telecharger: '<path d="M12 4v10.5M7.75 10.25 12 14.5l4.25-4.25"/><path d="M5 16.5v1.5a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-1.5"/>',
  importer: '<path d="M12 14.5V4M7.75 8.25 12 4l4.25 4.25"/><path d="M5 16.5v1.5a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-1.5"/>',

  // Flèches (chevrons pour aller et venir, flèches pleines pour déplacer)
  'chevron-gauche': '<path d="m14.5 5.5-6.5 6.5 6.5 6.5"/>',
  'chevron-droite': '<path d="m9.5 5.5 6.5 6.5-6.5 6.5"/>',
  'fleche-haut': '<path d="M12 19V5M6 11l6-6 6 6"/>',
  'fleche-bas': '<path d="M12 5v14M6 13l6 6 6-6"/>',

  // Navigation et listes
  livre: '<path d="M4.5 19.5v-14a2 2 0 0 1 2-2H19v14H6.5a2 2 0 0 0-2 2 2 2 0 0 0 2 2H19v-4"/><path d="M9 8h6M9 11.5h4"/>',
  liste: `<path d="M9 6h11M9 12h11M9 18h11"/>${point(4.5, 6)}${point(4.5, 12)}${point(4.5, 18)}`,
  reglages: '<path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/>',
  points: `${point(5.5, 12)}${point(12, 12)}${point(18.5, 12)}`,
  'points-verticaux': `${point(12, 5.5)}${point(12, 12)}${point(12, 18.5)}`,
  poignee: `${point(9, 6)}${point(15, 6)}${point(9, 12)}${point(15, 12)}${point(9, 18)}${point(15, 18)}`,

  // Saisie d'un ingrédient : une ligne de texte, ou des champs séparés
  'ligne-libre': '<path d="M4 12h16"/><path d="M4 7h10M4 17h7" opacity=".5"/>',
  champs: '<rect x="3.5" y="5" width="5" height="6" rx="1.5"/><rect x="11" y="5" width="9.5" height="6" rx="1.5"/>'
    + '<rect x="3.5" y="13.5" width="17" height="6" rx="1.5"/>',
};

/** Noms des icônes disponibles. */
export const NOMS_ICONES = Object.freeze(Object.keys(DESSINS));

/**
 * Crée une icône.
 * @param {string} nom une clé de NOMS_ICONES
 * @param {object} [options]
 * @param {number} [options.taille] côté en pixels (24 par défaut)
 * @param {string} [options.libelle] texte alternatif : l'icône devient une image nommée
 *   (role="img"). Sans libellé, elle est décorative (aria-hidden) : le bouton qui la porte
 *   doit alors avoir son propre nom (texte visible ou aria-label).
 * @param {string} [options.classe] classe(s) ajoutée(s) à « icone »
 * @returns {SVGSVGElement}
 */
export function icone(nom, { taille = 24, libelle, classe } = {}) {
  const dessin = DESSINS[nom];
  if (!dessin) throw new Error(`Icône inconnue : ${nom}`);
  const svg = document.createElementNS(NS, 'svg');
  for (const [attribut, valeur] of Object.entries(ATTRIBUTS)) svg.setAttribute(attribut, valeur);
  svg.setAttribute('width', String(taille));
  svg.setAttribute('height', String(taille));
  svg.setAttribute('class', classe ? `icone icone--${nom} ${classe}` : `icone icone--${nom}`);
  if (libelle) {
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', libelle);
  } else {
    svg.setAttribute('aria-hidden', 'true');
  }
  svg.innerHTML = dessin;
  return svg;
}
