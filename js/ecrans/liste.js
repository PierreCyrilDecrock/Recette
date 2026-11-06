// E1 — Liste des recettes (accueil) ; sert aussi l'onglet Favoris (params.favoris).
// Recherche instantanée (modele.js → rechercher), filtre par catégorie (puces à sélection
// unique), tri mémorisé dans les réglages, grille de cartes et états vides.
// Sur grand écran, la liste reste affichée à gauche de la fiche (mode double, js/app.js) :
// la fonction de nettoyage porte alors selectionner(id), qui marque la recette ouverte,
// et la liste se recharge d'elle-même après chaque écriture en base (favori, suppression…).

import { T } from '../textes.js';
import {
  EVENEMENT_CHANGEMENT, changements, ecrireReglage, lireReglage, listerCategories, listerRecettes,
} from '../db.js';
import { CRITERES_TRI, rechercher, trier } from '../modele.js';
import { creerCarteRecette } from '../composants/carte-recette.js';
import { icone } from '../icones.js';

/** Clé du réglage qui mémorise le critère de tri. */
const REGLAGE_TRI = 'tri';

/** Délai avant d'annoncer le nombre de résultats pendant la frappe (évite une annonce par lettre). */
const DELAI_ANNONCE = 400;

/**
 * Recherche et catégorie choisies, gardées le temps de la session pour chaque vue :
 * en revenant d'une fiche, on retrouve la liste comme on l'a laissée.
 */
const filtres = {
  recettes: { requete: '', categorie: null },
  favoris: { requete: '', categorie: null },
};

// Illustrations statiques (aucun texte saisi par l'utilisateur) : innerHTML est sans risque ici
// Une marmite qui fume doucement, posée sur un carnet ouvert
const SVG_CARNET_VIDE = `<svg class="etat-vide__illustration" viewBox="0 0 160 120" aria-hidden="true" focusable="false">
  <path class="etat-vide__fond" d="M18 96c0-6 5-10 11-10h102c6 0 11 4 11 10v4c0 3-2 5-5 5H23c-3 0-5-2-5-5v-4Z"/>
  <path class="etat-vide__trait" d="M80 88V100M30 88c16-4 34-4 50 0 16-4 34-4 50 0"/>
  <path class="etat-vide__accent" d="M48 54h64v18a14 14 0 0 1-14 14H62a14 14 0 0 1-14-14V54Z"/>
  <path class="etat-vide__trait" d="M42 54h76M48 62h-6M112 62h6M72 48a8 8 0 0 1 16 0"/>
  <path class="etat-vide__vapeur" d="M66 38c-4-5 4-8 0-14M80 36c-4-5 4-8 0-14M94 38c-4-5 4-8 0-14"/>
</svg>`;
const SVG_COEUR_VIDE = `<svg class="etat-vide__illustration" viewBox="0 0 160 120" aria-hidden="true" focusable="false">
  <path class="etat-vide__accent" d="M80 100s-38-22-38-50a20 20 0 0 1 38-9 20 20 0 0 1 38 9c0 28-38 50-38 50Z"/>
  <path class="etat-vide__vapeur" d="M128 28l4-4M134 40h6M28 40h-6M32 28l-4-4"/>
</svg>`;
const SVG_LOUPE_VIDE = `<svg class="etat-vide__illustration etat-vide__illustration--petite" viewBox="0 0 160 120" aria-hidden="true" focusable="false">
  <circle class="etat-vide__fond" cx="72" cy="54" r="30"/>
  <circle class="etat-vide__trait" cx="72" cy="54" r="30"/>
  <path class="etat-vide__accent-trait" d="m94 76 22 22"/>
  <path class="etat-vide__vapeur" d="M60 46a14 14 0 0 1 12-8"/>
</svg>`;

/** Crée un élément à partir d'une balise, d'une classe et d'un texte (via textContent). */
function element(balise, classe, texte) {
  const el = document.createElement(balise);
  if (classe) el.className = classe;
  if (texte !== undefined) el.textContent = texte;
  return el;
}

/** Bloc d'état vide : illustration, titre, texte et actions. */
function creerEtatVide({ illustration, titre, texte, actions }) {
  const bloc = element('div', 'etat-vide');
  const dessin = element('div');
  dessin.innerHTML = illustration;
  bloc.append(dessin.firstElementChild, element('h2', 'etat-vide__titre', titre));
  if (texte) bloc.append(element('p', 'etat-vide__texte texte-doux', texte));
  const rangee = element('div', 'etat-vide__actions');
  rangee.append(...actions);
  bloc.append(rangee);
  return bloc;
}

/** Message d'erreur du stockage (ErreurStockage : message affichable tel quel). */
function creerErreur(erreur) {
  const message = element('p', 'carte message-erreur', erreur?.message || T.stockage.generique);
  message.setAttribute('role', 'alert');
  return message;
}

/**
 * @param {HTMLElement} conteneur
 * @param {{ favoris?: boolean }} params
 * @returns {Promise<() => void>} nettoyage
 */
export async function afficher(conteneur, params) {
  const favoris = Boolean(params.favoris);
  const etat = filtres[favoris ? 'favoris' : 'recettes'];

  const section = element('section', 'ecran liste');
  /** Titre de l'écran : h1, ou h2 quand une fiche ouverte à côté porte le h1 de la page. */
  const creerTitre = (balise) => {
    const el = element(balise, 'titre-ecran', favoris ? T.favoris.titre : T.liste.titre);
    el.tabIndex = -1; // reçoit le focus après le chargement des exemples
    return el;
  };
  let titre = creerTitre('h1');
  section.append(titre);

  let recettes;
  let categories;
  let tri;
  try {
    [recettes, categories, tri] = await Promise.all([
      listerRecettes({ favoris }),
      listerCategories(),
      lireReglage(REGLAGE_TRI, 'date'),
    ]);
  } catch (erreur) {
    console.warn(erreur);
    section.append(creerErreur(erreur));
    conteneur.append(section);
    return undefined;
  }
  if (!CRITERES_TRI.includes(tri)) tri = 'date';

  let actif = true;
  let minuterieAnnonce = null;
  // Recette ouverte à côté de la liste (mode double), marquée aria-current
  let selection = null;

  // --- Outils : recherche, puces de catégories, tri -----------------------------------
  const outils = element('div', 'liste__outils');

  const formulaire = element('form', 'recherche');
  formulaire.setAttribute('role', 'search');
  const idRecherche = favoris ? 'recherche-favoris' : 'recherche-recettes';
  const libelle = element('label', 'visuellement-cache', T.liste.recherche);
  libelle.htmlFor = idRecherche;
  const saisie = element('input', 'champ__saisie recherche__saisie');
  Object.assign(saisie, {
    type: 'search',
    id: idRecherche,
    placeholder: T.liste.rechercheIndication,
    autocomplete: 'off',
    spellcheck: false,
    enterKeyHint: 'search',
    value: etat.requete,
  });
  formulaire.append(libelle, icone('recherche', { taille: 20, classe: 'recherche__icone' }), saisie);

  const puces = element('div', 'puces liste__puces');
  puces.setAttribute('role', 'group');
  puces.setAttribute('aria-label', T.liste.categories);

  const barre = element('div', 'liste__barre');
  const compte = element('p', 'liste__compte texte-doux');
  compte.setAttribute('role', 'status');
  compte.setAttribute('aria-live', 'polite');
  const champTri = element('label', 'tri');
  const selectTri = element('select', 'tri__menu');
  for (const critere of CRITERES_TRI) {
    const option = element('option', undefined, T.liste.criteresTri[critere]);
    option.value = critere;
    selectTri.append(option);
  }
  selectTri.value = tri;
  champTri.append(element('span', 'tri__libelle', T.liste.tri), selectTri);
  barre.append(compte, champTri);

  outils.append(formulaire, puces, barre);

  const grille = element('ul', 'grille-recettes');
  grille.setAttribute('role', 'list');
  const zoneEtat = element('div', 'liste__etat');

  section.append(outils, grille, zoneEtat);
  // L'écran n'apparaît qu'une fois les données lues : pas d'écran à moitié rempli
  conteneur.append(section);

  // --- Affichage ------------------------------------------------------------------------

  /** Catégories qui ont au moins une recette dans la vue : une puce ne mène jamais à rien. */
  function categoriesUtilisees() {
    const presentes = new Set(recettes.flatMap((r) => r.categories ?? []));
    return categories.filter((nom) => presentes.has(nom));
  }

  /** Met à jour le nombre de résultats ; pendant la frappe, l'annonce attend une pause. */
  function annoncer(texte, differe) {
    clearTimeout(minuterieAnnonce);
    if (!differe) {
      compte.textContent = texte;
      return;
    }
    minuterieAnnonce = setTimeout(() => { compte.textContent = texte; }, DELAI_ANNONCE);
  }

  /** Reconstruit les puces (« Toutes » + catégories utilisées), aria-pressed sur la sélection. */
  function rendrePuces() {
    const noms = categoriesUtilisees();
    if (etat.categorie !== null && !noms.includes(etat.categorie)) etat.categorie = null;
    puces.hidden = noms.length === 0;
    if (noms.length === 0) {
      puces.replaceChildren();
      return;
    }
    puces.replaceChildren(...[null, ...noms].map((nom) => {
      const puce = element('button', 'puce', nom ?? T.liste.toutes);
      puce.type = 'button';
      puce.setAttribute('aria-pressed', String(nom === etat.categorie));
      puce.addEventListener('click', () => {
        if (etat.categorie === nom) return;
        etat.categorie = nom;
        for (const autre of puces.children) autre.setAttribute('aria-pressed', String(autre === puce));
        rendre();
      });
      return puce;
    }));
  }

  /** Affiche la grille filtrée et triée, ou l'état vide qui convient. */
  function rendre({ differe = false } = {}) {
    // Aucune recette du tout dans cette vue : état vide illustré, sans outils
    if (recettes.length === 0) {
      outils.hidden = true;
      grille.replaceChildren();
      annoncer('');
      zoneEtat.replaceChildren(favoris ? etatVideFavoris() : etatVideRecettes());
      return;
    }
    outils.hidden = false;

    const parCategorie = etat.categorie === null
      ? recettes
      : recettes.filter((r) => r.categories?.includes(etat.categorie));
    const resultats = trier(rechercher(parCategorie, etat.requete), tri);

    grille.replaceChildren(...resultats.map(creerCarteRecette));
    marquerSelection();
    annoncer(T.liste.resultats(resultats.length), differe);
    zoneEtat.replaceChildren(...(resultats.length === 0 ? [etatAucunResultat()] : []));
  }

  /** Marque la carte de la recette ouverte (aria-current) et la rend visible. */
  function marquerSelection({ montrer = false } = {}) {
    const href = selection === null ? null : `#/recette/${encodeURIComponent(selection)}`;
    for (const lien of grille.querySelectorAll('.carte-recette')) {
      const choisie = lien.getAttribute('href') === href;
      if (choisie) lien.setAttribute('aria-current', 'page');
      else lien.removeAttribute('aria-current');
      if (choisie && montrer) lien.scrollIntoView({ block: 'nearest' });
    }
  }

  /** Recharge recettes et catégories après une écriture en base (mode double). */
  let rechargement = null;
  function recharger() {
    if (rechargement) return;
    rechargement = Promise.all([listerRecettes({ favoris }), listerCategories()])
      .then(([nouvelles, nouvellesCategories]) => {
        if (!actif) return;
        recettes = nouvelles;
        categories = nouvellesCategories;
        rendrePuces();
        rendre();
      })
      .catch((erreur) => console.warn(erreur))
      .finally(() => { rechargement = null; });
  }
  const surChangement = () => queueMicrotask(recharger);
  changements.addEventListener(EVENEMENT_CHANGEMENT, surChangement);

  // --- États vides ----------------------------------------------------------------------

  function etatVideRecettes() {
    const creer = element('a', 'bouton bouton--principal', T.liste.creerPremiere);
    creer.href = '#/nouvelle';

    const exemples = element('button', 'bouton', T.liste.chargerExemples);
    exemples.type = 'button';
    const bloc = creerEtatVide({
      illustration: SVG_CARNET_VIDE,
      titre: T.liste.videTitre,
      texte: T.liste.videTexte,
      actions: [creer, exemples],
    });

    exemples.addEventListener('click', async () => {
      exemples.disabled = true;
      exemples.setAttribute('aria-busy', 'true');
      exemples.textContent = T.liste.chargementExemples;
      bloc.querySelector('.message-erreur')?.remove();
      try {
        // Chargé à la demande : les exemples ne pèsent rien tant qu'on ne les demande pas
        const { chargerExemples } = await import('../exemples.js');
        await chargerExemples();
        const [nouvelles, nouvellesCategories] = await Promise.all([listerRecettes({ favoris }), listerCategories()]);
        if (!actif) return;
        recettes = nouvelles;
        categories = nouvellesCategories;
        rendrePuces();
        rendre();
        // Le bouton a disparu : le focus revient au titre de l'écran
        titre.focus({ preventScroll: true });
      } catch (erreur) {
        console.warn(erreur);
        if (!actif) return;
        exemples.disabled = false;
        exemples.removeAttribute('aria-busy');
        exemples.textContent = T.liste.chargerExemples;
        bloc.append(creerErreur(erreur));
      }
    });
    return bloc;
  }

  function etatVideFavoris() {
    const voir = element('a', 'bouton bouton--principal', T.favoris.voirRecettes);
    voir.href = '#/';
    return creerEtatVide({
      illustration: SVG_COEUR_VIDE,
      titre: T.favoris.videTitre,
      texte: T.favoris.videTexte,
      actions: [voir],
    });
  }

  function etatAucunResultat() {
    const requete = etat.requete.trim();
    const effacer = element('button', 'bouton', T.liste.effacerRecherche);
    effacer.type = 'button';
    effacer.addEventListener('click', () => {
      etat.requete = '';
      saisie.value = '';
      rendre();
      saisie.focus();
    });
    return creerEtatVide({
      illustration: SVG_LOUPE_VIDE,
      titre: requete ? T.liste.aucunResultatTitre(requete) : T.liste.resultats(0),
      texte: etat.categorie === null ? T.liste.aucunResultatTexte : T.liste.aucunResultatCategorie(etat.categorie),
      actions: requete ? [effacer] : [],
    });
  }

  // --- Événements -----------------------------------------------------------------------

  saisie.addEventListener('input', () => {
    etat.requete = saisie.value;
    rendre({ differe: true });
  });

  // Entrée valide la recherche : on ferme le clavier virtuel, sans recharger la page
  formulaire.addEventListener('submit', (evenement) => {
    evenement.preventDefault();
    saisie.blur();
  });

  selectTri.addEventListener('change', () => {
    tri = selectTri.value;
    rendre();
    ecrireReglage(REGLAGE_TRI, tri).catch((erreur) => console.warn(erreur));
  });

  rendrePuces();
  rendre();

  const nettoyage = () => {
    actif = false;
    clearTimeout(minuterieAnnonce);
    changements.removeEventListener(EVENEMENT_CHANGEMENT, surChangement);
  };
  /**
   * Mode double : marque la recette ouverte à droite (null : aucune). Le titre de la liste
   * passe alors au niveau 2, sous le h1 de la fiche.
   * @param {string|null} id
   */
  nettoyage.selectionner = (id) => {
    selection = id ?? null;
    const balise = selection === null ? 'H1' : 'H2';
    if (titre.tagName !== balise) {
      const nouveau = creerTitre(balise.toLowerCase());
      titre.replaceWith(nouveau);
      titre = nouveau;
    }
    marquerSelection({ montrer: true });
  };
  return nettoyage;
}
