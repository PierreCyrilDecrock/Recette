// Logique métier pure : création et validation des recettes, temps, mise à l'échelle,
// arrondi et affichage des quantités, analyse d'une ligne d'ingrédient, recherche et tri.
// Aucun accès au DOM ni à IndexedDB : ce module s'exécute tel quel dans le navigateur
// et sous Node (tests unitaires dans tests/modele.test.js).

import { T } from './textes.js';

/**
 * @typedef {Object} Ingredient
 * @property {number} [quantite] quantité numérique (ex. 0.5), absente pour « sel et poivre »
 * @property {string} [unite] unité canonique (g, kg, ml, cl, l, c. à s., c. à c., pincée, pièce, tasse) ou libre
 * @property {string} nom nom de l'ingrédient (obligatoire)
 * @property {string} [precision] ex. « coupé en dés »
 * @property {string} [section] ex. « Pour la pâte »
 */

/**
 * @typedef {Object} Etape
 * @property {string} texte texte de l'étape (obligatoire)
 * @property {number} [minuteur] durée en secondes
 */

/**
 * @typedef {Object} Recette
 * @property {string} id UUID
 * @property {string} titre 1 à 120 caractères
 * @property {string} [description] 500 caractères au maximum
 * @property {Blob|string} [photo] Blob ou data URL
 * @property {'facile'|'moyen'|'difficile'} difficulte
 * @property {number} [tempsPreparation] minutes, 0 à 1440
 * @property {number} [tempsCuisson] minutes, 0 à 1440
 * @property {number} [tempsRepos] minutes, 0 à 4320
 * @property {number} portions 1 à 100
 * @property {string[]} categories
 * @property {boolean} favori
 * @property {Ingredient[]} ingredients
 * @property {Etape[]} etapes
 * @property {string} [notes]
 * @property {string} [source]
 * @property {string} dateCreation date ISO
 * @property {string} dateModification date ISO
 */

/** Espace insécable : entre un nombre et son unité, et dans « 1 ½ ». */
export const ESPACE_INSECABLE = ' ';
const E = ESPACE_INSECABLE;

/** Valeurs admises pour la difficulté. */
export const DIFFICULTES = Object.freeze(['facile', 'moyen', 'difficile']);

/** Unités canoniques reconnues (toute autre chaîne est une unité libre). */
export const UNITES = Object.freeze(['g', 'kg', 'ml', 'cl', 'l', 'c. à s.', 'c. à c.', 'pincée', 'pièce', 'tasse']);

/** Bornes du modèle de données (cahier des charges, « Modèle de données »). */
export const LIMITES = Object.freeze({
  titre: 120,
  description: 500,
  tempsPreparation: 1440,
  tempsCuisson: 1440,
  tempsRepos: 4320,
  portionsMin: 1,
  portionsMax: 100,
});

const CHAMPS_TEMPS = ['tempsPreparation', 'tempsCuisson', 'tempsRepos'];
const MINUTES_PAR_JOUR = 24 * 60;

// ---------------------------------------------------------------------------
// Outils internes
// ---------------------------------------------------------------------------

/** Vrai si la valeur est considérée comme non saisie. */
const estAbsent = (valeur) => valeur === undefined || valeur === null || valeur === '';

/** Vrai pour un nombre fini (exclut NaN, Infinity et les chaînes). */
const estNombre = (valeur) => typeof valeur === 'number' && Number.isFinite(valeur);

/** Vrai pour une chaîne contenant autre chose que des espaces. */
const estTexteRempli = (valeur) => typeof valeur === 'string' && valeur.trim() !== '';

/** Échappe une chaîne pour l'insérer dans une expression régulière. */
const echapper = (texte) => texte.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Supprime les erreurs d'arrondi binaire (0.1 * 3 → 0.3) sans changer la valeur utile. */
const nettoyerFlottant = (nombre) => Number(nombre.toPrecision(12));

// Caractères repliés en plus de la suppression des accents
const REMPLACEMENTS = { 'œ': 'oe', 'æ': 'ae', '’': "'", '‘': "'" };

/**
 * Génère un UUID v4. crypto.randomUUID() n'existe qu'en contexte sécurisé (https,
 * localhost) : sur le réseau local en http, on le construit avec getRandomValues().
 * @returns {string}
 */
function genererId() {
  const c = globalThis.crypto;
  if (typeof c?.randomUUID === 'function') return c.randomUUID();
  const octets = c.getRandomValues(new Uint8Array(16));
  octets[6] = (octets[6] & 0x0f) | 0x40; // version 4
  octets[8] = (octets[8] & 0x3f) | 0x80; // variante RFC 4122
  const h = [...octets].map((o) => o.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/**
 * Replie un texte (minuscules, sans accents, œ → oe, apostrophes droites) en gardant
 * la correspondance avec les positions du texte d'origine : le caractère replié n° k
 * provient de texte.slice(debuts[k], fins[k]).
 * @param {string} texte
 * @returns {{ plie: string, debuts: number[], fins: number[] }}
 */
function replier(texte) {
  let plie = '';
  const debuts = [];
  const fins = [];
  let position = 0;
  for (const caractere of texte) {
    const fin = position + caractere.length;
    let replie = caractere.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '');
    replie = REMPLACEMENTS[replie] ?? replie;
    if (replie === '') {
      // Accent combinant isolé (texte en NFD) : il prolonge le caractère précédent
      if (fins.length) fins[fins.length - 1] = fin;
    } else {
      for (const c of replie) {
        plie += c;
        debuts.push(position);
        fins.push(fin);
      }
    }
    position = fin;
  }
  return { plie, debuts, fins };
}

// ---------------------------------------------------------------------------
// Création et validation
// ---------------------------------------------------------------------------

/**
 * Crée une recette complète à partir de données partielles. Les valeurs fournies
 * (y compris id et dates, utile à l'import) l'emportent sur les valeurs par défaut ;
 * les valeurs undefined sont ignorées. Les listes sont copiées : la recette renvoyée
 * ne partage aucune liste avec les données reçues.
 * @param {Partial<Recette>} [donnees]
 * @returns {Recette}
 */
export function creerRecette(donnees = {}) {
  const maintenant = new Date().toISOString();
  const fournies = Object.fromEntries(
    Object.entries(donnees ?? {}).filter(([, valeur]) => valeur !== undefined),
  );
  const recette = {
    id: genererId(),
    titre: '',
    description: '',
    difficulte: 'facile',
    portions: 4,
    categories: [],
    favori: false,
    ingredients: [],
    etapes: [],
    notes: '',
    source: '',
    dateCreation: maintenant,
    dateModification: maintenant,
    ...fournies,
  };
  recette.categories = Array.isArray(recette.categories) ? [...recette.categories] : [];
  recette.ingredients = Array.isArray(recette.ingredients)
    ? recette.ingredients.map((ingredient) => ({ ...ingredient }))
    : [];
  recette.etapes = Array.isArray(recette.etapes) ? recette.etapes.map((etape) => ({ ...etape })) : [];
  return recette;
}

/**
 * Vérifie une recette selon les règles du modèle de données.
 * Les lignes d'ingrédients ou d'étapes entièrement vides sont ignorées (lignes
 * ajoutées dans le formulaire mais jamais remplies).
 * @param {Recette} recette
 * @returns {{ valide: boolean, erreurs: Object<string, string> }} erreurs : { champ: message }
 */
export function validerRecette(recette) {
  const r = recette ?? {};
  const V = T.validation;
  const erreurs = {};

  if (!estTexteRempli(r.id)) erreurs.id = V.identifiant;

  // Titre : 1 à 120 caractères après suppression des espaces aux extrémités
  const titre = typeof r.titre === 'string' ? r.titre.trim() : '';
  if (titre === '') erreurs.titre = V.titreObligatoire;
  else if (titre.length > LIMITES.titre) erreurs.titre = V.titreTropLong(LIMITES.titre);

  if (!estAbsent(r.description)) {
    if (typeof r.description !== 'string') erreurs.description = V.texte;
    else if (r.description.trim().length > LIMITES.description) {
      erreurs.description = V.descriptionTropLongue(LIMITES.description);
    }
  }

  if (!DIFFICULTES.includes(r.difficulte)) erreurs.difficulte = V.difficulte;

  // Temps : facultatifs, mais entiers et bornés lorsqu'ils sont présents
  for (const champ of CHAMPS_TEMPS) {
    const valeur = r[champ];
    if (estAbsent(valeur)) continue;
    if (!Number.isInteger(valeur) || valeur < 0 || valeur > LIMITES[champ]) {
      erreurs[champ] = V.temps(LIMITES[champ]);
    }
  }

  const { portionsMin, portionsMax } = LIMITES;
  if (!Number.isInteger(r.portions) || r.portions < portionsMin || r.portions > portionsMax) {
    erreurs.portions = V.portions(portionsMin, portionsMax);
  }

  if (!estAbsent(r.categories) && !(Array.isArray(r.categories) && r.categories.every(estTexteRempli))) {
    erreurs.categories = V.categories;
  }

  if (r.favori !== undefined && typeof r.favori !== 'boolean') erreurs.favori = V.favori;

  if (!estAbsent(r.photo)) {
    const estBlob = typeof Blob !== 'undefined' && r.photo instanceof Blob;
    const estDataUrl = typeof r.photo === 'string' && r.photo.startsWith('data:image/');
    if (!estBlob && !estDataUrl) erreurs.photo = V.photo;
  }

  for (const champ of ['notes', 'source']) {
    if (!estAbsent(r[champ]) && typeof r[champ] !== 'string') erreurs[champ] = V.texte;
  }

  for (const champ of ['dateCreation', 'dateModification']) {
    if (typeof r[champ] !== 'string' || Number.isNaN(Date.parse(r[champ]))) erreurs[champ] = V.date;
  }

  // Ingrédients : au moins un avec un nom ; chaque ligne remplie a un nom et une quantité valide
  if (!Array.isArray(r.ingredients)) {
    erreurs.ingredients = V.ingredientsObligatoires;
  } else {
    const remplis = r.ingredients.filter((i) => !ingredientVide(i));
    if (remplis.length === 0) erreurs.ingredients = V.ingredientsObligatoires;
    else if (remplis.some((i) => !estTexteRempli(i?.nom))) erreurs.ingredients = V.ingredientSansNom;
    else if (remplis.some((i) => !estAbsent(i.quantite) && !(estNombre(i.quantite) && i.quantite >= 0))) {
      erreurs.ingredients = V.quantite;
    }
  }

  // Étapes : au moins une avec un texte ; minuteur entier positif s'il est présent
  if (!Array.isArray(r.etapes)) {
    erreurs.etapes = V.etapesObligatoires;
  } else {
    const remplies = r.etapes.filter((e) => estTexteRempli(e?.texte));
    if (remplies.length === 0) erreurs.etapes = V.etapesObligatoires;
    else if (remplies.some((e) => !estAbsent(e.minuteur) && !(Number.isInteger(e.minuteur) && e.minuteur > 0))) {
      erreurs.etapes = V.minuteur;
    }
  }

  return { valide: Object.keys(erreurs).length === 0, erreurs };
}

/** Vrai pour une ligne d'ingrédient jamais remplie (l'unité seule ne compte pas). */
function ingredientVide(ingredient) {
  if (ingredient === null || typeof ingredient !== 'object') return false;
  return estAbsent(ingredient.quantite)
    && !estTexteRempli(ingredient.nom)
    && !estTexteRempli(ingredient.precision);
}

/**
 * Duplique une recette : nouvel id, titre suivi de « (copie) » (raccourci si besoin pour
 * rester sous 120 caractères), nouvelles dates, favori remis à faux.
 * @param {Recette} recette
 * @returns {Recette}
 */
export function dupliquerRecette(recette) {
  const { id, dateCreation, dateModification, ...reste } = recette ?? {};
  const suffixe = T.modele.suffixeCopie;
  const titre = String(reste.titre ?? '').trim();
  const base = titre.slice(0, Math.max(0, LIMITES.titre - suffixe.length)).trimEnd();
  return creerRecette({ ...reste, titre: `${base}${suffixe}`, favori: false });
}

// ---------------------------------------------------------------------------
// Temps
// ---------------------------------------------------------------------------

/**
 * Temps total en minutes : préparation + cuisson + repos. Les valeurs absentes ou
 * invalides comptent pour zéro.
 * @param {Recette} recette
 * @returns {number}
 */
export function tempsTotal(recette) {
  return CHAMPS_TEMPS.reduce((total, champ) => {
    const valeur = recette?.[champ];
    return estNombre(valeur) && valeur > 0 ? total + valeur : total;
  }, 0);
}

/** Vrai si au moins un des temps de la recette est renseigné. */
function aDesTemps(recette) {
  return CHAMPS_TEMPS.some((champ) => estNombre(recette?.[champ]));
}

/**
 * Formate une durée en minutes : « 45 min », « 1 h », « 1 h 15 », « 1 h 05 ».
 * Au-delà de 24 h, en jours et heures arrondies : « 1 j », « 2 j 3 h ».
 * Les espaces sont insécables. Renvoie '' pour une valeur invalide ou négative.
 * @param {number} minutes
 * @returns {string}
 */
export function formaterDuree(minutes) {
  if (!estNombre(minutes) || minutes < 0) return '';
  const { minutes: mn, heures: h, jours: j } = T.duree;
  const total = Math.round(minutes);
  if (total < 60) return `${total}${E}${mn}`;
  if (total < MINUTES_PAR_JOUR) {
    const heures = Math.floor(total / 60);
    const reste = total % 60;
    return reste === 0 ? `${heures}${E}${h}` : `${heures}${E}${h}${E}${String(reste).padStart(2, '0')}`;
  }
  const heuresTotales = Math.round(total / 60);
  const jours = Math.floor(heuresTotales / 24);
  const heures = heuresTotales % 24;
  return heures === 0 ? `${jours}${E}${j}` : `${jours}${E}${j}${E}${heures}${E}${h}`;
}

// ---------------------------------------------------------------------------
// Quantités : mise à l'échelle, arrondi, affichage
// ---------------------------------------------------------------------------

/**
 * Recalcule les quantités pour un autre nombre de portions. Renvoie une nouvelle liste
 * (les ingrédients d'origine ne sont pas modifiés). Les quantités absentes restent
 * absentes. Les valeurs ne sont pas arrondies : l'arrondi se fait à l'affichage
 * (formaterQuantite), ce qui évite d'accumuler les erreurs.
 * Si une des portions est invalide, les quantités sont recopiées sans changement.
 * @param {Ingredient[]} ingredients
 * @param {number} portionsOrigine
 * @param {number} portionsCible
 * @returns {Ingredient[]}
 */
export function mettreALEchelle(ingredients, portionsOrigine, portionsCible) {
  const valide = (p) => estNombre(p) && p > 0;
  const facteur = valide(portionsOrigine) && valide(portionsCible) ? portionsCible / portionsOrigine : 1;
  return (Array.isArray(ingredients) ? ingredients : []).map((ingredient) => {
    const copie = { ...ingredient };
    if (estNombre(ingredient?.quantite)) copie.quantite = nettoyerFlottant(ingredient.quantite * facteur);
    return copie;
  });
}

/**
 * Famille d'arrondi d'une unité.
 * - piece : pièce, ou pas d'unité (on compte des objets) ;
 * - fine : g et ml ;
 * - cl : centilitres ;
 * - decimale : kg et l ;
 * - quart : c. à s., c. à c., tasse, pincée et unités libres.
 * @param {string} [unite]
 * @returns {'piece'|'fine'|'cl'|'decimale'|'quart'}
 */
function familleUnite(unite) {
  const u = normaliser(unite);
  if (u === '' || u === 'piece' || u === 'pieces') return 'piece';
  if (u === 'g' || u === 'ml') return 'fine';
  if (u === 'cl') return 'cl';
  if (u === 'kg' || u === 'l') return 'decimale';
  return 'quart';
}

/**
 * Arrondit une quantité de façon lisible selon son unité :
 * - pièce (ou sans unité) : entier le plus proche, au moins 1 ; sous 0,75 : ½ ou ¼ ;
 * - c. à s., c. à c., tasse, pincée et unités libres : quart le plus proche, au moins ¼ ;
 * - g et ml : 1 décimale sous 10, multiple de 5 de 10 à 100, multiple de 10 au-delà ;
 * - cl : 1 décimale sous 10, entier au-delà ;
 * - kg et l : 2 décimales au maximum.
 * Une quantité positive n'est jamais arrondie à zéro.
 * @param {number} quantite
 * @param {string} [unite]
 * @returns {number|undefined} undefined si la quantité est absente, négative ou invalide
 */
export function arrondirQuantite(quantite, unite) {
  if (!estNombre(quantite) || quantite < 0) return undefined;
  if (quantite === 0) return 0;
  const q = quantite;
  switch (familleUnite(unite)) {
    case 'piece':
      if (q >= 0.75) return Math.max(1, Math.round(q));
      return q >= 0.375 ? 0.5 : 0.25;
    case 'fine':
      if (q < 10) return Math.max(0.1, Math.round(q * 10) / 10);
      if (q <= 100) return Math.round(q / 5) * 5;
      return Math.round(q / 10) * 10;
    case 'cl':
      if (q < 10) return Math.max(0.1, Math.round(q * 10) / 10);
      return Math.round(q);
    case 'decimale':
      return Math.max(0.01, Math.round(q * 100) / 100);
    default:
      return Math.max(0.25, Math.round(q * 4) / 4);
  }
}

// Unités qui prennent un « s » au pluriel (à partir de 2) ; « c. à s. » reste invariable
const UNITES_PLURIELLES = new Set([
  'pincée', 'tasse', 'gousse', 'tranche', 'boîte', 'sachet', 'feuille', 'brin',
  'botte', 'poignée', 'noisette', 'pot', 'verre', 'bouquet', 'branche',
]);

const FRACTIONS_AFFICHEES = ['', '¼', '½', '¾'];

/** Écrit un multiple de ¼ en fraction : 0.5 → « ½ », 1.5 → « 1 ½ », 2 → « 2 ». */
function enFraction(nombre) {
  let entier = Math.floor(nombre);
  let quarts = Math.round((nombre - entier) * 4);
  if (quarts === 4) {
    entier += 1;
    quarts = 0;
  }
  const fraction = FRACTIONS_AFFICHEES[quarts];
  if (!fraction) return String(entier);
  return entier === 0 ? fraction : `${entier}${E}${fraction}`;
}

/** Écrit un nombre avec une virgule décimale : 1.25 → « 1,25 ». */
const enDecimal = (nombre) => String(nombre).replace('.', ',');

/**
 * Formate une quantité pour l'affichage, après arrondi intelligent (arrondirQuantite) :
 * « 1 ½ c. à s. », « 7,5 g », « 1,25 kg », « 3 » (pièces : l'unité n'est pas affichée,
 * le nom de l'ingrédient suffit). Virgule décimale et espace insécable avant l'unité.
 * Sans quantité, renvoie l'unité seule (« pincée ») ou ''.
 * @param {number} [quantite]
 * @param {string} [unite]
 * @returns {string}
 */
export function formaterQuantite(quantite, unite) {
  const famille = familleUnite(unite);
  const nombre = arrondirQuantite(quantite, unite);
  let libelle = famille === 'piece' ? '' : String(unite).trim();
  if (nombre !== undefined && nombre >= 2 && UNITES_PLURIELLES.has(libelle)) libelle += 's';
  if (nombre === undefined) return libelle;
  const texte = famille === 'piece' || famille === 'quart' ? enFraction(nombre) : enDecimal(nombre);
  return libelle ? `${texte}${E}${libelle}` : texte;
}

// ---------------------------------------------------------------------------
// Analyse d'une ligne d'ingrédient
// ---------------------------------------------------------------------------

const FRACTIONS_UNICODE = {
  '½': 1 / 2, '¼': 1 / 4, '¾': 3 / 4, '⅓': 1 / 3, '⅔': 2 / 3,
  '⅕': 1 / 5, '⅛': 1 / 8, '⅜': 3 / 8, '⅝': 5 / 8, '⅞': 7 / 8,
};
const CAR_FRACTION = `[${Object.keys(FRACTIONS_UNICODE).join('')}]`;

const NOMBRES_EN_LETTRES = {
  un: 1, une: 1, deux: 2, trois: 3, quatre: 4, cinq: 5, six: 6,
  sept: 7, huit: 8, neuf: 9, dix: 10, douze: 12,
};

// Formes de quantité reconnues en début de ligne, de la plus précise à la plus simple
const MOTIFS_QUANTITE = [
  // « 1 ½ », « 1½ »
  [new RegExp(`^(\\d+)\\s*(${CAR_FRACTION})`, 'u'), (m) => Number(m[1]) + FRACTIONS_UNICODE[m[2]]],
  // « 1 1/2 »
  [/^(\d+)\s+(\d+)\s*[/⁄]\s*(\d+)/, (m) => (Number(m[3]) ? Number(m[1]) + Number(m[2]) / Number(m[3]) : undefined)],
  // « 1/2 »
  [/^(\d+)\s*[/⁄]\s*(\d+)/, (m) => (Number(m[2]) ? Number(m[1]) / Number(m[2]) : undefined)],
  // « ½ »
  [new RegExp(`^(${CAR_FRACTION})`, 'u'), (m) => FRACTIONS_UNICODE[m[1]]],
  // « 200 », « 1,5 », « 1.5 »
  [/^(\d+(?:[.,]\d+)?)/, (m) => Number(m[1].replace(',', '.'))],
  // « une pincée », « deux oignons » (mais pas « un peu de sel »)
  [/^(\p{L}+)(?=\s)(?!\s+peu\b)/u, (m) => NOMBRES_EN_LETTRES[m[1].toLowerCase()]],
];

// Variantes d'unités, cherchées dans le texte replié (minuscules, sans accents).
// [expression, unité canonique, facteur de conversion]
const VARIANTES_UNITES = [
  [/^(?:cuill?(?:ere|eree|er)?s?\.?\s*(?:a|de)\s*soupe|c\.?\s*(?:a\.?\s*)?s(?:oupe)?\.?|tbsp)/, 'c. à s.', 1],
  [/^(?:cuill?(?:ere|eree|er)?s?\.?\s*(?:a|de)\s*cafe|c\.?\s*(?:a\.?\s*)?c(?:afe)?\.?|tsp)/, 'c. à c.', 1],
  [/^(?:kilogrammes?|kilos?|kg)\.?/, 'kg', 1],
  [/^(?:grammes?|grs?|g)\.?/, 'g', 1],
  [/^(?:millilitres?|ml)\.?/, 'ml', 1],
  [/^(?:centilitres?|cl)\.?/, 'cl', 1],
  [/^(?:decilitres?|dl)\.?/, 'cl', 10],
  [/^(?:litres?|l)\.?/, 'l', 1],
  [/^pincees?/, 'pincée', 1],
  [/^tasses?/, 'tasse', 1],
];

// Unités libres courantes : reconnues seulement devant « de » (« 2 gousses d'ail »),
// pour ne pas confondre « 3 tranches » (le nom) avec une unité.
const UNITES_LIBRES = {
  gousse: 'gousse', tranche: 'tranche', boite: 'boîte', sachet: 'sachet', feuille: 'feuille',
  brin: 'brin', botte: 'botte', poignee: 'poignée', noisette: 'noisette', noix: 'noix',
  pot: 'pot', verre: 'verre', bouquet: 'bouquet', branche: 'branche',
};
const MOTIF_UNITE_LIBRE = new RegExp(
  `^(${Object.keys(UNITES_LIBRES).join('|')})s?(?=\\s+(?:de\\s|d'|des\\s|du\\s))`,
);

// Une unité doit être suivie d'autre chose qu'une lettre ou un chiffre (« 200 g », pas « 2 gousses »)
const FIN_DE_MOT = /^(?![\p{L}\p{N}])/u;

/** Lit la quantité en début de texte. @returns {{ quantite: number, longueur: number } | null} */
function lireQuantite(texte) {
  for (const [motif, valeur] of MOTIFS_QUANTITE) {
    const m = motif.exec(texte);
    if (!m) continue;
    const quantite = valeur(m);
    if (estNombre(quantite)) return { quantite, longueur: m[0].length };
  }
  return null;
}

/**
 * Lit l'unité en début de texte (variantes comprises).
 * @returns {{ unite: string, facteur: number, longueur: number } | null} longueur dans le texte d'origine
 */
function lireUnite(texte) {
  const { plie, fins } = replier(texte);
  for (const [motif, unite, facteur] of VARIANTES_UNITES) {
    const m = motif.exec(plie);
    if (m && FIN_DE_MOT.test(plie.slice(m[0].length))) {
      return { unite, facteur, longueur: fins[m[0].length - 1] };
    }
  }
  const m = MOTIF_UNITE_LIBRE.exec(plie);
  if (m) return { unite: UNITES_LIBRES[m[1]], facteur: 1, longueur: fins[m[0].length - 1] };
  return null;
}

/** Sépare la précision : après la première virgule non décimale, ou entre parenthèses finales. */
function separerPrecision(texte) {
  let principal = texte;
  let apresVirgule = '';
  for (let i = 0; i < texte.length; i++) {
    if (texte[i] !== ',') continue;
    if (/\d/.test(texte[i - 1] ?? '') && /\d/.test(texte[i + 1] ?? '')) continue; // « 1,5 »
    principal = texte.slice(0, i);
    apresVirgule = texte.slice(i + 1).trim();
    break;
  }
  let entreParentheses = '';
  const m = /\(([^()]*)\)\s*$/.exec(principal);
  if (m) {
    entreParentheses = m[1].trim();
    principal = principal.slice(0, m.index);
  }
  const precision = [entreParentheses, apresVirgule].filter(Boolean).join(', ');
  return { principal: principal.trim(), precision };
}

/**
 * Décompose une ligne d'ingrédient saisie librement.
 * « 200g de farine » → { quantite: 200, unite: 'g', nom: 'farine', precision: '' }
 * « 2 oignons, émincés » → { quantite: 2, unite: 'pièce', nom: 'oignons', precision: 'émincés' }
 * « sel et poivre » → { quantite: undefined, unite: '', nom: 'sel et poivre', precision: '' }
 * Les variantes d'unités (cs, càs, cuillère à soupe, gr, litres…) sont ramenées aux
 * unités canoniques ; les décilitres sont convertis en centilitres. Une quantité sans
 * unité reconnue est comptée en pièces.
 * @param {string} texte
 * @returns {{ quantite: number|undefined, unite: string, nom: string, precision: string }}
 */
export function analyserLigneIngredient(texte) {
  const ligne = String(texte ?? '')
    .normalize('NFC')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^[-–•*·]\s*/, ''); // puce d'une liste collée
  const { principal, precision } = separerPrecision(ligne);

  const lu = lireQuantite(principal);
  if (!lu) return { quantite: undefined, unite: '', nom: principal, precision };

  let quantite = lu.quantite;
  let reste = principal.slice(lu.longueur).trimStart();
  let unite = 'pièce';
  const u = lireUnite(reste);
  if (u) {
    unite = u.unite;
    quantite *= u.facteur;
    // « 200 g de farine », « 2 c. à s. d'huile » : on retire « de », « d' », « des », « du »
    reste = reste.slice(u.longueur).trimStart().replace(/^(?:de|des|du)\s+|^d['’]\s*/i, '');
  }
  return { quantite: nettoyerFlottant(quantite), unite, nom: reste.trim(), precision };
}

// ---------------------------------------------------------------------------
// Recherche et tri
// ---------------------------------------------------------------------------

/**
 * Normalise un texte pour les comparaisons : minuscules, sans accents (NFD),
 * œ → oe, apostrophes droites, espaces réduits et retirés aux extrémités.
 * @param {string} texte
 * @returns {string}
 */
export function normaliser(texte) {
  return String(texte ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[œæ’‘]/g, (c) => REMPLACEMENTS[c])
    .replace(/\s+/g, ' ')
    .trim();
}

// Cache de la recherche : recette → { brut, normalise }. La normalisation (NFD) est la
// partie coûteuse ; on la refait seulement si le texte brut a changé, ce qui reste juste
// même si l'objet recette est modifié sur place.
const cacheRecherche = new WeakMap();

/** Texte normalisé dans lequel on cherche : titre, noms des ingrédients et notes. */
function texteRecherchable(recette) {
  if (recette === null || typeof recette !== 'object') return '';
  const noms = Array.isArray(recette.ingredients) ? recette.ingredients.map((i) => i?.nom) : [];
  const brut = [recette.titre, ...noms, recette.notes].filter((p) => typeof p === 'string').join('\n');
  const enCache = cacheRecherche.get(recette);
  if (enCache?.brut === brut) return enCache.normalise;
  const normalise = normaliser(brut);
  cacheRecherche.set(recette, { brut, normalise });
  return normalise;
}

/**
 * Filtre les recettes dont le titre, les noms d'ingrédients ou les notes contiennent
 * tous les mots de la requête (sans tenir compte des accents ni de la casse ; un mot
 * peut être le début ou une partie d'un mot : « poireau » trouve « poireaux »).
 * Une requête vide renvoie toutes les recettes. Renvoie une nouvelle liste.
 * @param {Recette[]} recettes
 * @param {string} requete
 * @returns {Recette[]}
 */
export function rechercher(recettes, requete) {
  const liste = Array.isArray(recettes) ? recettes : [];
  const mots = normaliser(requete).split(/[^\p{L}\p{N}']+/u).filter(Boolean);
  if (mots.length === 0) return [...liste];
  return liste.filter((recette) => {
    const texte = texteRecherchable(recette);
    return mots.every((mot) => texte.includes(mot));
  });
}

const COLLATEUR = new Intl.Collator('fr', { sensitivity: 'base', numeric: true });
const comparerTitres = (a, b) => COLLATEUR.compare(String(a?.titre ?? ''), String(b?.titre ?? ''));

/** Horodatage de création (à défaut, de modification) ; -Infinity si inconnu. */
function horodatage(recette) {
  const t = Date.parse(recette?.dateCreation ?? recette?.dateModification);
  return Number.isNaN(t) ? -Infinity : t;
}

/**
 * Trie les recettes sans modifier la liste reçue.
 * - « date » : la plus récemment créée d'abord ;
 * - « titre » : ordre alphabétique français (accents et casse ignorés, nombres naturels) ;
 * - « temps » : temps total croissant, les recettes sans aucun temps renseigné en dernier.
 * À égalité, l'ordre alphabétique des titres départage. Un critère inconnu renvoie
 * une copie dans l'ordre d'origine.
 * @param {Recette[]} recettes
 * @param {'date'|'titre'|'temps'} critere
 * @returns {Recette[]}
 */
export function trier(recettes, critere) {
  const copie = Array.isArray(recettes) ? [...recettes] : [];
  const temps = (r) => (aDesTemps(r) ? tempsTotal(r) : Infinity);
  const comparateurs = {
    // Deux dates inconnues donnent NaN (-Infinity - -Infinity) : les titres départagent
    date: (a, b) => horodatage(b) - horodatage(a) || comparerTitres(a, b),
    titre: comparerTitres,
    temps: (a, b) => {
      const ta = temps(a);
      const tb = temps(b);
      return ta === tb ? comparerTitres(a, b) : ta < tb ? -1 : 1;
    },
  };
  const comparer = comparateurs[critere];
  return comparer ? copie.sort(comparer) : copie;
}

// ---------------------------------------------------------------------------
// Ingrédients cités dans une étape
// ---------------------------------------------------------------------------

// Adjectifs placés avant le nom : « petits pois » ne doit pas surligner « petits »
const ADJECTIFS_ANTEPOSES = new Set([
  'petit', 'petite', 'gros', 'grosse', 'grand', 'grande', 'bon', 'bonne', 'beau', 'belle',
  'vieux', 'vieille', 'jeune', 'demi', 'fin', 'fine', 'nouveau', 'nouvelle', 'gras', 'grasse',
]);

/** Motif d'un mot replié, tolérant le singulier et le pluriel (poireau/poireaux, oeuf/oeufs). */
function motifMot(mot) {
  const base = mot.length > 3 ? mot.replace(/[sx]$/, '') : mot;
  return echapper(base) + (mot.length > 2 ? '[sx]?' : '');
}

/**
 * Motifs de recherche d'un ingrédient dans un texte replié : le nom complet (priorité 0)
 * puis, pour un nom de plusieurs mots, son premier mot seul (priorité 1) : « crème
 * fraîche » se retrouve dans « ajouter la crème ».
 * @returns {Array<[RegExp, number]>}
 */
function motifsIngredient(nom) {
  const mots = replier(nom).plie.split(/[\s-]+/).filter(Boolean);
  if (mots.length === 0) return [];
  const motif = (liste) => new RegExp(
    `(?<![\\p{L}\\p{N}])${liste.map(motifMot).join('[\\s-]+')}(?![\\p{L}\\p{N}])`,
    'gu',
  );
  const motifs = [[motif(mots), 0]];
  const premier = mots[0];
  if (mots.length > 1 && premier.length >= 4 && !ADJECTIFS_ANTEPOSES.has(premier.replace(/s$/, ''))) {
    motifs.push([motif([premier]), 1]);
  }
  return motifs;
}

/**
 * Trouve les ingrédients cités dans le texte d'une étape, pour les surligner.
 * La recherche ignore accents et casse, tolère singulier et pluriel, et préfère la
 * correspondance la plus longue (« pommes de terre » plutôt que « pomme »). Les plages
 * renvoyées ne se chevauchent pas et sont triées dans l'ordre du texte ; debut et fin
 * sont des positions du texte d'origine (texte.slice(debut, fin)).
 * @param {string} texte
 * @param {Ingredient[]} ingredients
 * @returns {Array<{ debut: number, fin: number, indexIngredient: number }>}
 */
export function trouverIngredientsDansTexte(texte, ingredients) {
  if (typeof texte !== 'string' || texte === '' || !Array.isArray(ingredients)) return [];
  const { plie, debuts, fins } = replier(texte);

  const candidats = [];
  ingredients.forEach((ingredient, indexIngredient) => {
    const nom = typeof ingredient?.nom === 'string' ? ingredient.nom : '';
    for (const [motif, priorite] of motifsIngredient(nom)) {
      for (const m of plie.matchAll(motif)) {
        const debut = debuts[m.index];
        const fin = fins[m.index + m[0].length - 1];
        candidats.push({ debut, fin, indexIngredient, priorite });
      }
    }
  });

  // Les plus longues d'abord, puis le nom complet avant le premier mot, puis l'ordre des ingrédients
  candidats.sort((a, b) => (b.fin - b.debut) - (a.fin - a.debut)
    || a.priorite - b.priorite
    || a.indexIngredient - b.indexIngredient
    || a.debut - b.debut);
  const retenues = [];
  for (const c of candidats) {
    if (!retenues.some((r) => c.debut < r.fin && r.debut < c.fin)) retenues.push(c);
  }
  return retenues
    .sort((a, b) => a.debut - b.debut)
    .map(({ debut, fin, indexIngredient }) => ({ debut, fin, indexIngredient }));
}

// ---------------------------------------------------------------------------
// Visuel par défaut d'une recette (sans photo)
// ---------------------------------------------------------------------------

/**
 * Teinte (0 à 359) du dégradé d'une recette, dérivée de son id (empreinte FNV-1a brassée) :
 * la même recette garde toujours la même couleur, d'un appareil à l'autre.
 * @param {string} id
 * @returns {number}
 */
export function teinteVisuel(id) {
  let empreinte = 0x811c9dc5;
  for (const caractere of String(id ?? '')) {
    empreinte ^= caractere.codePointAt(0);
    empreinte = Math.imul(empreinte, 0x01000193);
  }
  // Brassage final (fmix32 de MurmurHash3) : des id voisins (« exemple-… ») donnent
  // des teintes bien différentes
  empreinte ^= empreinte >>> 16;
  empreinte = Math.imul(empreinte, 0x85ebca6b);
  empreinte ^= empreinte >>> 13;
  empreinte = Math.imul(empreinte, 0xc2b2ae35);
  empreinte ^= empreinte >>> 16;
  // Les bits de poids fort sont les mieux répartis : on les ramène sur 0 à 359
  return Math.floor(((empreinte >>> 0) / 2 ** 32) * 360);
}

/**
 * Initiale affichée sur le visuel : la première lettre ou le premier chiffre du titre,
 * en majuscule (« « Tarte » » → « T », « œufs » → « Œ »). Renvoie '' s'il n'y en a pas.
 * @param {string} titre
 * @returns {string}
 */
export function initiale(titre) {
  const lettre = String(titre ?? '').normalize('NFC').match(/[\p{L}\p{N}]/u)?.[0] ?? '';
  return lettre.toLocaleUpperCase('fr');
}

/** Critères de tri acceptés par trier(), dans l'ordre du menu de la liste. */
export const CRITERES_TRI = Object.freeze(['date', 'titre', 'temps']);

// ---------------------------------------------------------------------------
// Fiche recette : portions demandées, source, texte à partager
// ---------------------------------------------------------------------------

/**
 * Lit un nombre de portions venu de l'extérieur (paramètre d'URL « ?portions=6 ») :
 * un entier écrit en chiffres, entre 1 et 100. Sinon, renvoie la valeur par défaut.
 * @param {unknown} valeur ex. « 6 »
 * @param {number} defaut valeur renvoyée si la saisie est absente ou invalide
 * @returns {number}
 */
export function lirePortions(valeur, defaut) {
  const texte = typeof valeur === 'number' ? String(valeur) : String(valeur ?? '').trim();
  if (!/^\d{1,3}$/.test(texte)) return defaut;
  const portions = Number(texte);
  return portions >= LIMITES.portionsMin && portions <= LIMITES.portionsMax ? portions : defaut;
}

/**
 * Reconnaît une adresse web dans le champ « source » : seules les URL http et https
 * deviennent des liens (jamais « javascript: » ni « data: »). « www.exemple.fr » est
 * accepté et complété en https.
 * @param {string} texte
 * @returns {string|null} l'URL normalisée, ou null si ce n'est pas une adresse web
 */
export function urlSource(texte) {
  if (typeof texte !== 'string') return null;
  const brut = texte.trim();
  if (brut === '' || /\s/.test(brut)) return null;
  const candidat = /^www\./i.test(brut) ? `https://${brut}` : brut;
  if (!/^https?:\/\//i.test(candidat)) return null;
  try {
    const url = new URL(candidat);
    return url.hostname.includes('.') ? url.href : null;
  } catch {
    return null;
  }
}

/** Une ligne d'ingrédient lisible : « 1,5 kg potimarron, en cubes ». */
function ligneIngredient(ingredient) {
  const quantite = formaterQuantite(ingredient?.quantite, ingredient?.unite);
  const nom = String(ingredient?.nom ?? '').trim();
  const precision = estTexteRempli(ingredient?.precision) ? `, ${ingredient.precision.trim()}` : '';
  return [quantite, nom].filter(Boolean).join(' ') + precision;
}

/**
 * Texte brut d'une recette, pour la partager (navigator.share ou presse-papiers) :
 * titre, description, portions et temps, ingrédients (mis à l'échelle, regroupés par
 * section), étapes numérotées, notes et source. Les blocs vides sont omis.
 * @param {Recette} recette
 * @param {number} [portions] nombre de portions voulu (par défaut, celui de la recette)
 * @returns {string}
 */
export function formaterRecetteTexte(recette, portions = recette?.portions) {
  const P = T.partage;
  const blocs = [];
  const texte = (valeur) => (estTexteRempli(valeur) ? valeur.trim() : '');

  blocs.push([texte(recette?.titre), texte(recette?.description)].filter(Boolean).join('\n'));

  const resume = [];
  const cible = estNombre(portions) && portions > 0 ? portions : recette?.portions;
  if (estNombre(cible) && cible > 0) resume.push(P.portions(cible));
  for (const champ of CHAMPS_TEMPS) {
    const minutes = recette?.[champ];
    if (estNombre(minutes) && minutes > 0) resume.push(`${P.temps[champ]} ${formaterDuree(minutes)}`);
  }
  blocs.push(resume.join(' · '));

  const ingredients = Array.isArray(recette?.ingredients)
    ? mettreALEchelle(recette.ingredients, recette.portions, cible)
    : [];
  if (ingredients.length > 0) {
    const lignes = [P.ingredients];
    let section = '';
    for (const ingredient of ingredients) {
      const nouvelle = texte(ingredient?.section);
      if (nouvelle && nouvelle !== section) lignes.push('', nouvelle);
      section = nouvelle;
      lignes.push(`- ${ligneIngredient(ingredient)}`);
    }
    blocs.push(lignes.join('\n'));
  }

  const etapes = Array.isArray(recette?.etapes) ? recette.etapes.map((e) => texte(e?.texte)).filter(Boolean) : [];
  if (etapes.length > 0) {
    blocs.push([P.etapes, ...etapes.map((e, i) => `${i + 1}. ${e}`)].join('\n'));
  }

  if (texte(recette?.notes)) blocs.push(`${P.notes}\n${texte(recette.notes)}`);
  if (texte(recette?.source)) blocs.push(`${P.source} ${texte(recette.source)}`);

  return blocs.filter(Boolean).join('\n\n');
}

// ---------------------------------------------------------------------------
// Formulaire (E3) : lecture des saisies et nettoyage avant enregistrement
// ---------------------------------------------------------------------------

/**
 * Lit une quantité saisie dans le formulaire : « 2 », « 1,5 », « 1.5 », « 1/2 »,
 * « 1 1/2 », « ½ », « 1 ½ ». Toute la saisie doit être une quantité.
 * @param {string} texte
 * @returns {number|undefined} undefined si le champ est vide, NaN si la saisie n'est
 * pas une quantité (validerRecette la signale alors comme invalide)
 */
export function lireQuantiteSaisie(texte) {
  const brut = String(texte ?? '').replace(/\s+/g, ' ').trim();
  if (brut === '') return undefined;
  for (const [motif, valeur] of MOTIFS_QUANTITE) {
    const m = motif.exec(brut);
    if (!m || m[0].length !== brut.length) continue;
    const quantite = valeur(m);
    return estNombre(quantite) ? nettoyerFlottant(quantite) : NaN;
  }
  return NaN;
}

/**
 * Lit un nombre de minutes saisi dans le formulaire (chiffres uniquement).
 * @param {string} texte ex. « 15 »
 * @returns {number|undefined} undefined si le champ est vide, NaN si la saisie est invalide
 */
export function lireMinutesSaisie(texte) {
  const brut = String(texte ?? '').trim();
  if (brut === '') return undefined;
  return /^\d+$/.test(brut) ? Number(brut) : NaN;
}

/**
 * Écrit une quantité dans un champ du formulaire, sous une forme que lireQuantiteSaisie
 * relit à l'identique : « 1,5 », « 0,25 », « 1/3 », « 1 2/3 ». Au-delà de 3 décimales
 * (hors tiers), la valeur est arrondie au millième.
 * @param {number} [quantite]
 * @returns {string} '' si la quantité est absente ou invalide
 */
export function formaterQuantiteSaisie(quantite) {
  if (!estNombre(quantite) || quantite < 0) return '';
  const virgule = (nombre) => String(nettoyerFlottant(nombre)).replace('.', ',');
  const milliemes = quantite * 1000;
  if (Math.abs(milliemes - Math.round(milliemes)) < 1e-6) return virgule(Math.round(milliemes) / 1000);
  const tiers = Math.round(quantite * 3);
  if (Math.abs(quantite * 3 - tiers) < 1e-6) {
    const entier = Math.floor(tiers / 3);
    return `${entier > 0 ? `${entier} ` : ''}${tiers % 3}/3`;
  }
  return virgule(Math.round(milliemes) / 1000);
}

/**
 * Prépare une recette saisie dans le formulaire pour l'enregistrement : textes sans
 * espaces aux extrémités, lignes d'ingrédients et d'étapes vides retirées, champs
 * facultatifs vides supprimés, catégories dédoublonnées. Renvoie une nouvelle recette.
 * @param {Recette} recette
 * @returns {Recette}
 */
export function nettoyerSaisie(recette) {
  const propre = { ...recette };
  for (const champ of ['titre', 'description', 'notes', 'source']) {
    if (typeof propre[champ] === 'string') propre[champ] = propre[champ].trim();
  }
  for (const champ of CHAMPS_TEMPS) {
    if (estAbsent(propre[champ])) delete propre[champ];
  }
  if (Array.isArray(propre.categories)) {
    const noms = propre.categories.map((c) => (typeof c === 'string' ? c.trim() : c));
    propre.categories = [...new Set(noms.filter((c) => c !== ''))];
  }
  if (Array.isArray(propre.ingredients)) {
    propre.ingredients = propre.ingredients
      .filter((ingredient) => !ingredientVide(ingredient))
      .map((ingredient) => {
        if (ingredient === null || typeof ingredient !== 'object') return ingredient;
        const ligne = { ...ingredient };
        for (const champ of ['nom', 'unite', 'precision', 'section']) {
          if (typeof ligne[champ] === 'string') ligne[champ] = ligne[champ].trim();
          if (champ !== 'nom' && estAbsent(ligne[champ])) delete ligne[champ];
        }
        if (estAbsent(ligne.quantite)) delete ligne.quantite;
        return ligne;
      });
  }
  if (Array.isArray(propre.etapes)) {
    propre.etapes = propre.etapes
      .filter((etape) => !(etape && typeof etape === 'object' && !estTexteRempli(etape.texte)))
      .map((etape) => (typeof etape?.texte === 'string' ? { ...etape, texte: etape.texte.trim() } : etape));
  }
  return propre;
}

/**
 * Écrit un ingrédient sur une seule ligne, pour le mode « ligne libre » du formulaire :
 * { 200, 'g', 'farine' } → « 200 g farine » ; { 2, 'gousse', 'ail' } → « 2 gousses d’ail ».
 * analyserLigneIngredient relit le résultat : l'unité « pièce » est sous-entendue, les
 * unités libres sont suivies de « de » (ou « d’ ») et la précision vient après une virgule.
 * @param {Ingredient} ingredient
 * @returns {string}
 */
export function composerLigneIngredient(ingredient) {
  const texte = (valeur) => (typeof valeur === 'string' ? valeur.trim() : '');
  const quantite = formaterQuantiteSaisie(ingredient?.quantite);
  const unite = texte(ingredient?.unite);
  const nom = texte(ingredient?.nom);
  const precision = texte(ingredient?.precision);

  let corps = nom;
  // Sans quantité, une unité ne serait pas relue comme telle : seul le nom est gardé
  if (unite && unite !== 'pièce' && quantite) {
    const forme = ingredient.quantite >= 2 && UNITES_PLURIELLES.has(unite) ? `${unite}s` : unite;
    if (UNITES.includes(unite) || !nom) corps = [forme, nom].filter(Boolean).join(' ');
    else corps = `${forme} ${/^[aeiouyhàâäéèêëîïôöûüœ]/i.test(nom) ? 'd’' : 'de '}${nom}`;
  }
  const ligne = [quantite, corps].filter(Boolean).join(' ');
  return precision ? `${ligne}, ${precision}` : ligne;
}

// Marques de liste retirées en début de ligne collée : puces, tirets, cases à cocher,
// numéros (« 1. », « 2) », « 3 - ») et « Étape 4 : ». « 1 pincée » ou « 1.5 kg » sont gardés.
const MARQUE_LISTE = new RegExp(
  '^(?:[-–—•*·▪◦●○■□☐☑✓✔>]+\\s*'
  + '|\\[[ xX✓]?\\]\\s*'
  + '|(?:[ée]tape\\s*)?\\d{1,3}\\s*(?:[.)°:]|[-–](?=\\s))(?=\\s|$)\\s*'
  + '|[ée]tape\\s*\\d{1,3}\\s*'
  + ')+',
  'iu',
);

/**
 * Découpe un texte collé en lignes utiles : une par ligne non vide, sans les puces,
 * tirets et numéros de début de ligne (« 1. », « - », « • »), espaces réduits.
 * Avec { paragraphes: true } (étapes), un texte qui contient une ligne vide est découpé
 * par paragraphe : les lignes d'un même paragraphe sont réunies par une espace.
 * @param {string} texte
 * @param {{ paragraphes?: boolean }} [options]
 * @returns {string[]}
 */
export function decouperLignesCollees(texte, { paragraphes = false } = {}) {
  const lignes = String(texte ?? '').replace(/\r\n?/g, '\n').split('\n');
  const nettoyer = (ligne) => ligne.replace(/\s+/g, ' ').trim().replace(MARQUE_LISTE, '').trim();

  const blocs = [];
  if (paragraphes && lignes.some((ligne) => ligne.trim() === '')) {
    let courant = [];
    for (const ligne of [...lignes, '']) {
      if (ligne.trim() !== '') {
        courant.push(nettoyer(ligne));
      } else if (courant.length > 0) {
        blocs.push(courant.filter(Boolean).join(' '));
        courant = [];
      }
    }
  } else {
    blocs.push(...lignes.map(nettoyer));
  }
  return blocs.filter((bloc) => bloc !== '');
}
