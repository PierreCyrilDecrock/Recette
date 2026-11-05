// E2 — Fiche recette (#/recette/:id, option ?portions=6).
// En-tête (visuel, titre, catégories, favori), infos en cartes, ingrédients recalculés
// selon les portions choisies, étapes numérotées, notes et source, puis la barre
// d'actions en bas : « Cuisiner » et un menu (modifier, dupliquer, partager, supprimer).

import { T } from '../textes.js';
import { basculerFavori, enregistrerRecette, lireRecette, supprimerRecette } from '../db.js';
import {
  DIFFICULTES, dupliquerRecette, formaterDuree, formaterQuantite, formaterRecetteTexte,
  lirePortions, mettreALEchelle, tempsTotal, urlSource,
} from '../modele.js';
import { creerDifficulte, creerVisuel } from '../composants/carte-recette.js';
import { EVENEMENT_PORTIONS, creerSelecteurPortions } from '../composants/selecteur-portions.js';
import { afficherToast } from '../composants/toast.js';

// Icônes statiques (aucun texte saisi par l'utilisateur) : innerHTML est sans risque ici.
// Provisoires : elles passeront par js/icones.js à l'étape 11.
const SVG_RETOUR = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M15 5l-7 7 7 7"/></svg>';
const SVG_COEUR = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10Z"/></svg>';
const SVG_PLUS = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="5" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="19" cy="12" r="1.5"/></svg>';
const SVG_CUISINER = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M6 13.5a6 6 0 0 1 12 0V18a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2v-4.5Z"/><path d="M8.5 7.5a3.5 3.5 0 0 1 7 0"/></svg>';
const SVG_MODIFIER = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M4 20h4L19 9l-4-4L4 16v4Z"/><path d="m13.5 6.5 4 4"/></svg>';
const SVG_DUPLIQUER = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/></svg>';
const SVG_PARTAGER = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 4v11M7.5 8.5 12 4l4.5 4.5"/><path d="M5 13v5a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-5"/></svg>';
const SVG_SUPPRIMER = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3"/></svg>';

/** Temps affichés dans le bloc infos, dans l'ordre. */
const TEMPS = [
  ['tempsPreparation', 'preparation'],
  ['tempsCuisson', 'cuisson'],
  ['tempsRepos', 'repos'],
];

/** Crée un élément à partir d'une balise, d'une classe et d'un texte (via textContent). */
function element(balise, classe, texte) {
  const el = document.createElement(balise);
  if (classe) el.className = classe;
  if (texte !== undefined) el.textContent = texte;
  return el;
}

/** Bouton (ou lien) avec une icône statique suivie d'un libellé. */
function avecIcone(el, icone, libelle) {
  el.innerHTML = icone;
  el.append(element('span', undefined, libelle));
  return el;
}

/** Vrai pour un texte non vide. */
const rempli = (valeur) => typeof valeur === 'string' && valeur.trim() !== '';

/**
 * @param {HTMLElement} conteneur
 * @param {{ id: string, portions?: string }} params
 * @returns {Promise<(() => void) | undefined>} nettoyage
 */
export async function afficher(conteneur, params) {
  let recette;
  try {
    recette = await lireRecette(params.id);
  } catch (erreur) {
    console.warn(erreur);
    conteneur.append(ecranErreur(erreur));
    return undefined;
  }
  if (!recette) {
    conteneur.append(ecranIntrouvable());
    return undefined;
  }

  let actif = true;
  const idUrl = encodeURIComponent(recette.id);
  const section = element('article', 'ecran fiche');

  // --- En-tête : visuel, retour, favori, titre, catégories, description -----------------
  const entete = element('header', 'fiche__entete');
  const media = element('div', 'fiche__media');
  const retour = element('a', 'bouton bouton--icone fiche__flottant fiche__retour');
  retour.href = '#/';
  retour.setAttribute('aria-label', T.fiche.retour);
  retour.innerHTML = SVG_RETOUR;

  const favori = element('button', 'bouton bouton--icone fiche__flottant fiche__favori');
  favori.type = 'button';
  favori.setAttribute('aria-label', T.fiche.favori);
  favori.setAttribute('aria-pressed', String(recette.favori === true));
  favori.innerHTML = SVG_COEUR;
  media.append(creerVisuel(recette), retour, favori);

  const titres = element('div', 'fiche__titres');
  titres.append(element('h1', 'fiche__titre', recette.titre));
  if (recette.categories?.length > 0) {
    const etiquettes = element('ul', 'etiquettes');
    etiquettes.setAttribute('role', 'list');
    etiquettes.setAttribute('aria-label', T.fiche.categories);
    etiquettes.append(...recette.categories.map((nom) => element('li', 'etiquette', nom)));
    titres.append(etiquettes);
  }
  if (rempli(recette.description)) titres.append(element('p', 'fiche__description', recette.description));
  entete.append(media, titres);

  // --- Bloc infos : difficulté, temps renseignés, total -----------------------------------
  const infos = element('dl', 'fiche__infos');
  infos.setAttribute('aria-label', T.fiche.infos);
  const ajouterInfo = (libelle, ...valeur) => {
    const carte = element('div', 'info');
    const dd = element('dd', 'info__valeur');
    dd.append(...valeur);
    carte.append(element('dt', 'info__libelle', libelle), dd);
    infos.append(carte);
  };
  if (DIFFICULTES.includes(recette.difficulte)) {
    const points = creerDifficulte(recette.difficulte);
    // Le mot suit les points : ils deviennent purement décoratifs
    points.removeAttribute('role');
    points.removeAttribute('aria-label');
    points.setAttribute('aria-hidden', 'true');
    ajouterInfo(T.fiche.difficulte, points, element('span', undefined, T.fiche.difficultes[recette.difficulte]));
  }
  for (const [champ, cle] of TEMPS) {
    if (recette[champ] > 0) ajouterInfo(T.fiche[cle], formaterDuree(recette[champ]));
  }
  const total = tempsTotal(recette);
  if (total > 0) {
    ajouterInfo(T.fiche.total, formaterDuree(total));
    infos.lastElementChild.classList.add('info--total');
  }

  // --- Ingrédients et sélecteur de portions -----------------------------------------------
  const selecteur = creerSelecteurPortions({ valeur: lirePortions(params.portions, recette.portions) });
  const blocIngredients = creerBloc('ingredients', T.fiche.ingredients, selecteur);
  const listeIngredients = element('div', 'fiche__ingredients-liste');
  blocIngredients.append(listeIngredients);

  /** Recalcule et affiche les ingrédients pour le nombre de portions choisi. */
  function rendreIngredients() {
    const ingredients = mettreALEchelle(recette.ingredients, recette.portions, selecteur.valeur);
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
    listeIngredients.replaceChildren(...morceaux);
  }

  // --- Étapes ---------------------------------------------------------------------------
  const blocEtapes = creerBloc('etapes', T.fiche.etapes);
  const etapes = element('ol', 'etapes');
  etapes.setAttribute('role', 'list');
  for (const etape of recette.etapes) {
    const item = element('li', 'etape');
    item.append(element('p', 'etape__texte', etape.texte));
    etapes.append(item);
  }
  blocEtapes.append(etapes);

  const colonnes = element('div', 'fiche__colonnes');
  colonnes.append(blocIngredients, blocEtapes);

  // --- Notes et source --------------------------------------------------------------------
  const complements = [];
  if (rempli(recette.notes)) {
    const notes = creerBloc('notes', T.fiche.notes);
    notes.append(element('p', 'fiche__notes-texte', recette.notes));
    complements.push(notes);
  }
  if (rempli(recette.source)) {
    const source = element('p', 'fiche__source texte-doux', `${T.fiche.source} `);
    const url = urlSource(recette.source);
    if (url) {
      const lien = element('a', undefined, recette.source.trim());
      lien.href = url;
      lien.target = '_blank';
      lien.rel = 'noopener noreferrer';
      source.append(lien);
    } else {
      source.append(recette.source.trim());
    }
    complements.push(source);
  }

  // --- Barre d'actions (zone du pouce) ----------------------------------------------------
  const actions = element('div', 'fiche__actions');
  actions.setAttribute('role', 'group');
  actions.setAttribute('aria-label', T.fiche.actions);
  const cuisiner = avecIcone(element('a', 'bouton bouton--principal fiche__cuisiner'), SVG_CUISINER, T.fiche.cuisiner);

  const menu = element('div', 'menu');
  const boutonMenu = element('button', 'bouton bouton--icone menu__declencheur');
  boutonMenu.type = 'button';
  boutonMenu.setAttribute('aria-label', T.fiche.plusActions);
  boutonMenu.setAttribute('aria-expanded', 'false');
  boutonMenu.setAttribute('aria-controls', 'menu-fiche');
  boutonMenu.innerHTML = SVG_PLUS;

  const listeMenu = element('ul', 'menu__liste');
  listeMenu.id = 'menu-fiche';
  listeMenu.setAttribute('role', 'list');
  listeMenu.hidden = true;
  const modifier = avecIcone(element('a', 'menu__action'), SVG_MODIFIER, T.fiche.modifier);
  modifier.href = `#/edition/${idUrl}`;
  const creerAction = (icone, libelle, classe = '') => {
    const bouton = avecIcone(element('button', `menu__action ${classe}`.trim()), icone, libelle);
    bouton.type = 'button';
    return bouton;
  };
  const dupliquer = creerAction(SVG_DUPLIQUER, T.fiche.dupliquer);
  const partager = creerAction(SVG_PARTAGER, T.fiche.partager);
  const supprimer = creerAction(SVG_SUPPRIMER, T.fiche.supprimer, 'menu__action--danger');
  for (const action of [modifier, dupliquer, partager, supprimer]) {
    const item = element('li');
    item.append(action);
    listeMenu.append(item);
  }
  menu.append(listeMenu, boutonMenu);
  actions.append(cuisiner, menu);

  const dialogue = creerDialogueSuppression(recette.titre);

  section.append(entete, infos, colonnes, ...complements, actions, dialogue);

  /** Le mode cuisine reçoit les portions choisies par l'URL. */
  function mettreAJourCuisiner() {
    cuisiner.href = `#/cuisine/${idUrl}?portions=${selecteur.valeur}`;
  }

  rendreIngredients();
  mettreAJourCuisiner();
  conteneur.append(section);

  // --- Événements -------------------------------------------------------------------------

  selecteur.addEventListener(EVENEMENT_PORTIONS, () => {
    rendreIngredients();
    mettreAJourCuisiner();
  });

  // Favori : l'état change tout de suite, puis la base confirme (ou on revient en arrière)
  favori.addEventListener('click', async () => {
    const attendu = favori.getAttribute('aria-pressed') !== 'true';
    favori.setAttribute('aria-pressed', String(attendu));
    try {
      const enregistre = await basculerFavori(recette.id);
      recette.favori = enregistre;
      if (actif) favori.setAttribute('aria-pressed', String(enregistre));
    } catch (erreur) {
      console.warn(erreur);
      if (!actif) return;
      favori.setAttribute('aria-pressed', String(!attendu));
      afficherToast(erreur?.message || T.stockage.generique, { erreur: true });
    }
  });

  // Menu secondaire (motif « disclosure ») : Échap, un clic ailleurs ou la perte du focus le ferment
  function ouvrirMenu() {
    listeMenu.hidden = false;
    boutonMenu.setAttribute('aria-expanded', 'true');
    modifier.focus();
  }
  function fermerMenu({ rendreFocus = false } = {}) {
    if (listeMenu.hidden) return;
    listeMenu.hidden = true;
    boutonMenu.setAttribute('aria-expanded', 'false');
    if (rendreFocus) boutonMenu.focus();
  }
  boutonMenu.addEventListener('click', () => {
    if (listeMenu.hidden) ouvrirMenu();
    else fermerMenu();
  });
  menu.addEventListener('keydown', (evenement) => {
    if (evenement.key === 'Escape' && !listeMenu.hidden) {
      evenement.preventDefault();
      fermerMenu({ rendreFocus: true });
    }
  });
  menu.addEventListener('focusout', (evenement) => {
    if (evenement.relatedTarget && !menu.contains(evenement.relatedTarget)) fermerMenu();
  });
  const clicExterieur = (evenement) => {
    if (!menu.contains(evenement.target)) fermerMenu();
  };
  document.addEventListener('pointerdown', clicExterieur);

  dupliquer.addEventListener('click', async () => {
    fermerMenu({ rendreFocus: true });
    try {
      const copie = await enregistrerRecette(dupliquerRecette(recette));
      if (!actif) return;
      location.hash = `#/recette/${encodeURIComponent(copie.id)}`;
      afficherToast(T.fiche.copieCreee);
    } catch (erreur) {
      console.warn(erreur);
      afficherToast(erreur?.message || T.stockage.generique, { erreur: true });
    }
  });

  partager.addEventListener('click', async () => {
    fermerMenu({ rendreFocus: true });
    await partagerRecette(recette, selecteur.valeur);
  });

  // Le focus revient au bouton du menu avant l'ouverture : le <dialog> l'y rendra en se fermant
  supprimer.addEventListener('click', () => {
    fermerMenu({ rendreFocus: true });
    dialogue.showModal();
  });
  dialogue.addEventListener('close', async () => {
    if (dialogue.returnValue !== 'supprimer') return;
    try {
      await supprimerRecette(recette.id);
      afficherToast(T.fiche.supprimee(recette.titre));
      // La fiche n'existe plus : elle est remplacée dans l'historique par la liste
      if (actif) location.replace('#/');
    } catch (erreur) {
      console.warn(erreur);
      afficherToast(erreur?.message || T.stockage.generique, { erreur: true });
    }
  });

  return () => {
    actif = false;
    document.removeEventListener('pointerdown', clicExterieur);
    if (dialogue.open) dialogue.close();
  };
}

/**
 * Bloc de contenu en carte : titre h2 (et éventuel outil à droite du titre).
 * @param {string} nom suffixe de classe et d'identifiant
 * @param {string} titre
 * @param {HTMLElement} [outil] ex. le sélecteur de portions
 * @returns {HTMLElement}
 */
function creerBloc(nom, titre, outil) {
  const bloc = element('section', `carte fiche__bloc fiche__${nom}`);
  const h2 = element('h2', 'fiche__bloc-titre', titre);
  h2.id = `fiche-${nom}`;
  bloc.setAttribute('aria-labelledby', h2.id);
  if (outil) {
    const tete = element('div', 'fiche__bloc-entete');
    tete.append(h2, outil);
    bloc.append(tete);
  } else {
    bloc.append(h2);
  }
  return bloc;
}

/** Ligne d'ingrédient : quantité et unité en gras, nom, précision en gris. */
function creerLigneIngredient(ingredient) {
  const item = element('li', 'ingredient');
  const quantite = formaterQuantite(ingredient.quantite, ingredient.unite);
  if (quantite) item.append(element('strong', 'ingredient__quantite', quantite), ' ');
  item.append(element('span', 'ingredient__nom', ingredient.nom));
  if (rempli(ingredient.precision)) {
    item.append(' ', element('span', 'ingredient__precision', ingredient.precision.trim()));
  }
  return item;
}

/** Fenêtre de confirmation de la suppression (<dialog> modal, Échap pour annuler). */
function creerDialogueSuppression(titre) {
  const dialogue = element('dialog', 'dialogue');
  dialogue.setAttribute('aria-labelledby', 'dialogue-suppression-titre');
  dialogue.setAttribute('aria-describedby', 'dialogue-suppression-texte');

  const corps = element('form', 'dialogue__corps');
  corps.method = 'dialog';
  const h2 = element('h2', 'dialogue__titre', T.fiche.confirmationTitre);
  h2.id = 'dialogue-suppression-titre';
  const texte = element('p', 'dialogue__texte', T.fiche.confirmationTexte(titre));
  texte.id = 'dialogue-suppression-texte';

  const boutons = element('div', 'dialogue__actions');
  const annuler = element('button', 'bouton', T.fiche.annuler);
  annuler.value = 'annuler';
  annuler.autofocus = true; // l'action sans risque reçoit le focus
  const confirmer = element('button', 'bouton bouton--danger', T.fiche.confirmerSuppression);
  confirmer.value = 'supprimer';
  boutons.append(annuler, confirmer);
  corps.append(h2, texte, boutons);
  dialogue.append(corps);

  // Un clic sur le fond (hors du corps) annule
  dialogue.addEventListener('click', (evenement) => {
    if (evenement.target === dialogue) dialogue.close('annuler');
  });
  return dialogue;
}

/**
 * Partage la recette (texte formaté) avec la feuille de partage du système ; à défaut,
 * la copie dans le presse-papiers.
 */
async function partagerRecette(recette, portions) {
  const texte = formaterRecetteTexte(recette, portions);
  if (typeof navigator.share === 'function') {
    try {
      await navigator.share({ title: recette.titre, text: texte });
      return;
    } catch (erreur) {
      if (erreur?.name === 'AbortError') return; // partage annulé par l'utilisateur
      console.warn(erreur);
    }
  }
  try {
    await navigator.clipboard.writeText(texte);
    afficherToast(T.fiche.copieePressePapiers);
  } catch (erreur) {
    console.warn(erreur);
    afficherToast(T.fiche.partageImpossible, { erreur: true });
  }
}

/** Écran affiché pour un identifiant inconnu. */
function ecranIntrouvable() {
  const section = element('section', 'ecran fiche-introuvable');
  const voir = element('a', 'bouton bouton--principal', T.fiche.voirRecettes);
  voir.href = '#/';
  section.append(
    element('h1', 'titre-ecran', T.fiche.introuvableTitre),
    element('p', 'texte-doux', T.fiche.introuvableTexte),
    voir,
  );
  return section;
}

/** Écran affiché si la base ne peut pas être lue (message d'ErreurStockage). */
function ecranErreur(erreur) {
  const section = element('section', 'ecran fiche-introuvable');
  const message = element('p', 'carte message-erreur', erreur?.message || T.stockage.generique);
  message.setAttribute('role', 'alert');
  const voir = element('a', 'bouton', T.fiche.voirRecettes);
  voir.href = '#/';
  section.append(element('h1', 'titre-ecran', T.fiche.erreurTitre), message, voir);
  return section;
}
