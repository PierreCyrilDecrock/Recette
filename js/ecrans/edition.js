// E3 — Création (#/nouvelle) et modification (#/edition/:id) d'une recette.
// Un seul formulaire défilant en quatre sections (Infos, Ingrédients, Étapes, Notes) et
// une barre d'actions collée en bas (Annuler, Enregistrer). La validation passe par
// validerRecette : chaque erreur s'affiche sous son champ (aria-invalid, aria-describedby)
// et le focus va au premier champ en erreur. Les lignes vides sont ignorées.
// L'ergonomie de saisie rapide (Entrée, collage, glisser-déposer, brouillon) vient à l'étape 7.

import { T } from '../textes.js';
import { ErreurValidation, enregistrerRecette, listerCategories, lireRecette } from '../db.js';
import {
  DIFFICULTES, LIMITES, UNITES, creerRecette, formaterQuantiteSaisie, lireMinutesSaisie,
  lireQuantiteSaisie, nettoyerSaisie, normaliser, validerRecette,
} from '../modele.js';
import { creerSelecteurPortions } from '../composants/selecteur-portions.js';
import { afficherToast } from '../composants/toast.js';

// Icônes statiques (aucun texte saisi par l'utilisateur) : innerHTML est sans risque ici.
// Provisoires : elles passeront par js/icones.js à l'étape 11.
const SVG_SUPPRIMER = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3"/></svg>';
const SVG_AJOUTER = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 5v14M5 12h14"/></svg>';

/** Champs de temps : [clé de la recette, clé du libellé dans T.edition]. */
const TEMPS = [
  ['tempsPreparation', 'preparation'],
  ['tempsCuisson', 'cuisson'],
  ['tempsRepos', 'repos'],
];

/** Ordre des erreurs affichées, celui des champs dans le formulaire. */
const ORDRE_CHAMPS = [
  'titre', 'description', 'difficulte', ...TEMPS.map(([champ]) => champ), 'portions',
  'categories', 'ingredients', 'etapes', 'notes', 'source',
];

const ID_UNITES = 'edition-unites';

/** Compteur des identifiants de lignes (uniques pour toute la session). */
let numeroLigne = 0;

/** Crée un élément à partir d'une balise, d'une classe et d'un texte (via textContent). */
function element(balise, classe, texte) {
  const el = document.createElement(balise);
  if (classe) el.className = classe;
  if (texte !== undefined) el.textContent = texte;
  return el;
}

/** Champ de saisie (input ou textarea) avec la classe commune. */
function saisie(balise = 'input', attributs = {}) {
  const el = element(balise, 'champ__saisie');
  if (balise === 'input') el.type = 'text';
  for (const [nom, valeur] of Object.entries(attributs)) el.setAttribute(nom, valeur);
  return el;
}

/** Ajoute ou retire un identifiant de la liste aria-describedby. */
function decrirePar(el, id, present) {
  const ids = new Set((el.getAttribute('aria-describedby') ?? '').split(/\s+/).filter(Boolean));
  if (present) ids.add(id);
  else ids.delete(id);
  if (ids.size > 0) el.setAttribute('aria-describedby', [...ids].join(' '));
  else el.removeAttribute('aria-describedby');
}

/** Ajuste la hauteur d'un <textarea> à son contenu. */
function ajusterHauteur(zone) {
  if (!zone.isConnected) return;
  const bordures = zone.offsetHeight - zone.clientHeight;
  zone.style.height = 'auto';
  zone.style.height = `${zone.scrollHeight + bordures}px`;
}

/** Bouton icône « supprimer » d'une ligne. */
function boutonSupprimer() {
  const bouton = element('button', 'bouton bouton--icone ligne__supprimer');
  bouton.type = 'button';
  bouton.innerHTML = SVG_SUPPRIMER;
  return bouton;
}

/** Bouton « Ajouter … » sous une liste. */
function boutonAjouter(libelle) {
  const bouton = element('button', 'bouton bouton--secondaire edition__ajouter');
  bouton.type = 'button';
  bouton.innerHTML = SVG_AJOUTER;
  bouton.append(element('span', undefined, libelle));
  return bouton;
}

/**
 * @param {HTMLElement} conteneur
 * @param {{ id?: string }} params id absent : nouvelle recette
 * @returns {Promise<(() => void) | undefined>} nettoyage
 */
export async function afficher(conteneur, params) {
  const modification = params.id !== undefined;
  let recette;
  let categoriesConnues;
  try {
    [recette, categoriesConnues] = await Promise.all([
      modification ? lireRecette(params.id) : creerRecette(),
      listerCategories(),
    ]);
  } catch (erreur) {
    console.warn(erreur);
    conteneur.append(ecranMessage(T.edition.erreurTitre, erreur?.message || T.stockage.generique, true));
    return undefined;
  }
  if (!recette) {
    conteneur.append(ecranMessage(T.edition.introuvableTitre, T.edition.introuvableTexte));
    return undefined;
  }

  const E = T.edition;
  let actif = true;
  let enCours = false;
  const urlRetour = modification ? `#/recette/${encodeURIComponent(recette.id)}` : '#/';

  const section = element('section', 'ecran edition');
  const formulaire = element('form', 'edition__formulaire');
  formulaire.noValidate = true; // validation maison : messages sous les champs
  formulaire.setAttribute('aria-labelledby', 'edition-titre-ecran');
  const h1 = element('h1', 'titre-ecran', modification ? E.titreModification : E.titreNouvelle);
  h1.id = 'edition-titre-ecran';

  // Emplacements des messages d'erreur et champs concernés, par clé de validerRecette
  const erreurs = new Map();
  /** Crée l'emplacement du message d'erreur d'un champ. */
  function emplacementErreur(cle) {
    const message = element('p', 'champ__erreur');
    message.id = `edition-erreur-${cle}`;
    message.hidden = true;
    erreurs.set(cle, { message, cibles: [] });
    return message;
  }

  // --- Section Infos ------------------------------------------------------------------
  const infos = creerSection('infos', E.infos);

  // Titre (obligatoire)
  const titre = saisie('input', { id: 'edition-titre', autocomplete: 'off', placeholder: E.titreIndication });
  titre.required = true;
  titre.value = recette.titre ?? '';
  titre.dataset.champ = 'titre';
  const libelleTitre = element('label', 'champ__libelle', E.titre);
  libelleTitre.htmlFor = titre.id;
  libelleTitre.append(' ', element('span', 'champ__obligatoire', E.obligatoire));
  infos.append(champ(libelleTitre, titre, emplacementErreur('titre')));

  // Description et compteur de caractères
  const description = saisie('textarea', {
    id: 'edition-description', rows: '3', placeholder: E.descriptionIndication,
  });
  description.value = recette.description ?? '';
  description.dataset.champ = 'description';
  const aideDescription = element('span', 'visuellement-cache', E.compteurAide(LIMITES.description));
  aideDescription.id = 'edition-description-aide';
  decrirePar(description, aideDescription.id, true);
  const compteur = element('span', 'edition__compteur');
  compteur.setAttribute('aria-hidden', 'true');
  const pied = element('div', 'champ__pied');
  pied.append(aideDescription, compteur);
  const mettreAJourCompteur = () => {
    const nombre = description.value.length;
    compteur.textContent = E.compteur(nombre, LIMITES.description);
    compteur.classList.toggle('edition__compteur--depasse', nombre > LIMITES.description);
  };
  mettreAJourCompteur();
  infos.append(champ(libelle(E.description, description), description, pied, emplacementErreur('description')));

  // Difficulté : boutons radio stylés en segments (flèches pour changer, Tab pour sortir)
  const difficulte = element('fieldset', 'segmente');
  difficulte.append(element('legend', undefined, E.difficulte));
  const options = element('div', 'segmente__options');
  const radios = DIFFICULTES.map((niveau) => {
    const option = element('label', 'segmente__option');
    const radio = element('input');
    radio.type = 'radio';
    radio.name = 'difficulte';
    radio.value = niveau;
    radio.checked = niveau === (DIFFICULTES.includes(recette.difficulte) ? recette.difficulte : 'facile');
    radio.dataset.champ = 'difficulte';
    option.append(radio, element('span', undefined, E.difficultes[niveau]));
    options.append(option);
    return radio;
  });
  difficulte.append(options, emplacementErreur('difficulte'));
  infos.append(difficulte);

  // Temps en minutes
  const temps = element('fieldset', 'edition__temps');
  temps.append(element('legend', 'champ__libelle', E.temps));
  const grilleTemps = element('div', 'edition__temps-grille');
  const messagesTemps = [];
  const champsTemps = {};
  for (const [cle, texte] of TEMPS) {
    const input = saisie('input', {
      id: `edition-${cle}`, inputmode: 'numeric', pattern: '[0-9]*', autocomplete: 'off',
    });
    input.value = Number.isFinite(recette[cle]) ? String(recette[cle]) : '';
    input.dataset.champ = cle;
    const etiquette = element('label', 'edition__temps-libelle', E[texte]);
    etiquette.htmlFor = input.id;
    etiquette.append(element('span', 'visuellement-cache', ` (${E.enMinutes})`));
    const boite = element('div', 'saisie-unite');
    boite.append(input, element('span', 'saisie-unite__unite', E.minutes));
    boite.lastChild.setAttribute('aria-hidden', 'true');
    const bloc = element('div', 'champ');
    bloc.append(etiquette, boite);
    grilleTemps.append(bloc);
    messagesTemps.push(emplacementErreur(cle));
    champsTemps[cle] = input;
  }
  temps.append(grilleTemps, ...messagesTemps);
  infos.append(temps);

  // Portions
  const selecteur = creerSelecteurPortions({ valeur: recette.portions });
  const ligneportions = element('div', 'edition__portions');
  ligneportions.append(element('span', 'champ__libelle', E.portions), selecteur);
  infos.append(ligneportions, emplacementErreur('portions'));

  // Catégories : puces bascule et création à la volée
  const categories = element('fieldset', 'edition__categories');
  categories.append(element('legend', 'champ__libelle', E.categories));
  const puces = element('div', 'edition__puces');
  const aucune = element('p', 'texte-doux', E.aucuneCategorie);
  const annonce = element('p', 'visuellement-cache');
  annonce.setAttribute('aria-live', 'polite');
  const nouvelle = saisie('input', {
    id: 'edition-nouvelle-categorie', autocomplete: 'off', placeholder: E.nouvelleCategorieIndication,
  });
  nouvelle.dataset.champ = 'categories';
  const creer = element('button', 'bouton bouton--secondaire', E.ajouterCategorie);
  creer.type = 'button';
  const rangeeNouvelle = element('div', 'edition__nouvelle-categorie');
  rangeeNouvelle.append(nouvelle, creer);
  categories.append(
    puces, aucune,
    champ(libelle(E.nouvelleCategorie, nouvelle), rangeeNouvelle),
    emplacementErreur('categories'), annonce,
  );
  infos.append(categories);

  /** Ajoute une puce de catégorie (bouton bascule). */
  function ajouterPuce(nom, choisie) {
    const puce = element('button', 'puce', nom);
    puce.type = 'button';
    puce.dataset.categorie = nom;
    puce.setAttribute('aria-pressed', String(choisie));
    puces.append(puce);
    aucune.hidden = true;
    return puce;
  }
  const choisies = new Set(recette.categories ?? []);
  const nomsCategories = [...new Set([...categoriesConnues, ...choisies])]
    .sort((a, b) => a.localeCompare(b, 'fr', { sensitivity: 'base' }));
  for (const nom of nomsCategories) ajouterPuce(nom, choisies.has(nom));
  aucune.hidden = nomsCategories.length > 0;

  // --- Section Ingrédients ----------------------------------------------------------------
  const blocIngredients = creerSection('ingredients', E.ingredients);
  const listeIngredients = element('ol', 'edition__lignes');
  listeIngredients.setAttribute('role', 'list');
  const unites = element('datalist');
  unites.id = ID_UNITES;
  for (const unite of UNITES) {
    const option = element('option');
    option.value = unite;
    unites.append(option);
  }
  const ajouterIngredient = boutonAjouter(E.ajouterIngredient);
  blocIngredients.append(listeIngredients, emplacementErreur('ingredients'), ajouterIngredient, unites);

  // --- Section Étapes ---------------------------------------------------------------------
  const blocEtapes = creerSection('etapes', E.etapes);
  const listeEtapes = element('ol', 'edition__lignes');
  listeEtapes.setAttribute('role', 'list');
  const ajouterEtape = boutonAjouter(E.ajouterEtape);
  blocEtapes.append(listeEtapes, emplacementErreur('etapes'), ajouterEtape);

  // Lignes : élément <li> → { lire(), champs, premier }
  const lignes = new WeakMap();

  /** Crée une ligne d'ingrédient (quantité, unité, nom, précision, supprimer). */
  function creerLigneIngredient(ingredient = {}) {
    const id = `edition-ingredient-${++numeroLigne}`;
    const item = element('li', 'ligne');
    const groupe = element('div', 'ligne-ingredient');
    groupe.setAttribute('role', 'group');
    const champs = {
      quantite: saisie('input', {
        inputmode: 'decimal', autocomplete: 'off', placeholder: E.quantiteIndication, 'aria-label': E.quantite,
      }),
      unite: saisie('input', {
        list: ID_UNITES, autocomplete: 'off', autocapitalize: 'off', placeholder: E.unite, 'aria-label': E.unite,
      }),
      nom: saisie('input', { autocomplete: 'off', placeholder: E.nomIndication, 'aria-label': E.nom }),
      precision: saisie('input', {
        autocomplete: 'off', placeholder: E.precisionIndication, 'aria-label': E.precision,
      }),
    };
    for (const [cle, input] of Object.entries(champs)) {
      input.id = `${id}-${cle}`;
      input.classList.add(`ligne-ingredient__${cle}`);
      input.dataset.champ = 'ingredients';
    }
    champs.quantite.value = formaterQuantiteSaisie(ingredient.quantite);
    champs.unite.value = ingredient.unite ?? '';
    champs.nom.value = ingredient.nom ?? '';
    champs.precision.value = ingredient.precision ?? '';
    const supprimer = boutonSupprimer();
    groupe.append(champs.quantite, champs.unite, champs.nom, champs.precision, supprimer);
    item.append(groupe);

    // Les champs non modifiables ici (section…) sont conservés tels quels
    const { quantite, unite, nom, precision, ...autres } = ingredient;
    lignes.set(item, {
      champs,
      premier: champs.quantite,
      lire: () => ({
        ...autres,
        quantite: lireQuantiteSaisie(champs.quantite.value),
        unite: champs.unite.value,
        nom: champs.nom.value,
        precision: champs.precision.value,
      }),
      // Même règle que validerRecette : l'unité seule ne compte pas
      vide: () => [champs.quantite, champs.nom, champs.precision].every((c) => c.value.trim() === ''),
    });
    supprimer.addEventListener('click', () => supprimerLigne(item, listeIngredients));
    return item;
  }

  /** Crée une ligne d'étape (numéro, texte auto-redimensionné, supprimer). */
  function creerLigneEtape(etape = {}) {
    const item = element('li', 'ligne ligne-etape');
    const numero = element('span', 'ligne-etape__numero');
    numero.setAttribute('aria-hidden', 'true');
    const texte = saisie('textarea', { rows: '2', placeholder: E.etapeIndication });
    texte.id = `edition-etape-${++numeroLigne}`;
    texte.dataset.champ = 'etapes';
    texte.value = etape.texte ?? '';
    const supprimer = boutonSupprimer();
    item.append(numero, texte, supprimer);
    const { texte: _texte, ...autres } = etape; // minuteur conservé
    lignes.set(item, {
      champs: { texte },
      premier: texte,
      lire: () => ({ ...autres, texte: texte.value }),
      vide: () => texte.value.trim() === '',
    });
    supprimer.addEventListener('click', () => supprimerLigne(item, listeEtapes));
    return item;
  }

  /** Met à jour les numéros et libellés des lignes d'une liste. */
  function numeroter(liste) {
    [...liste.children].forEach((item, index) => {
      const numero = index + 1;
      const { champs } = lignes.get(item);
      const supprimer = item.querySelector('.ligne__supprimer');
      if (liste === listeIngredients) {
        item.querySelector('.ligne-ingredient').setAttribute('aria-label', E.ingredient(numero));
        supprimer.setAttribute('aria-label', E.supprimerIngredient(numero));
      } else {
        item.querySelector('.ligne-etape__numero').textContent = String(numero);
        champs.texte.setAttribute('aria-label', E.etape(numero));
        supprimer.setAttribute('aria-label', E.supprimerEtape(numero));
      }
    });
  }

  /** Ajoute une ligne à une liste et la numérote. */
  function ajouterLigne(liste, donnees) {
    const item = liste === listeIngredients ? creerLigneIngredient(donnees) : creerLigneEtape(donnees);
    liste.append(item);
    numeroter(liste);
    const { champs } = lignes.get(item);
    if (champs.texte) ajusterHauteur(champs.texte);
    return item;
  }

  /** Supprime une ligne ; le focus passe à la ligne suivante (ou précédente). */
  function supprimerLigne(item, liste) {
    const voisine = item.nextElementSibling ?? item.previousElementSibling;
    item.remove();
    effacerErreur(liste === listeIngredients ? 'ingredients' : 'etapes');
    // La liste garde toujours au moins une ligne, prête à être remplie
    const cible = voisine ?? ajouterLigne(liste);
    numeroter(liste);
    lignes.get(cible).premier.focus();
  }

  const ingredientsInitiaux = recette.ingredients?.length > 0 ? recette.ingredients : [{}];
  for (const ingredient of ingredientsInitiaux) listeIngredients.append(creerLigneIngredient(ingredient));
  numeroter(listeIngredients);
  const etapesInitiales = recette.etapes?.length > 0 ? recette.etapes : [{}];
  for (const etape of etapesInitiales) listeEtapes.append(creerLigneEtape(etape));
  numeroter(listeEtapes);

  // --- Section Notes ----------------------------------------------------------------------
  const blocNotes = creerSection('notes', E.notes);
  const notes = saisie('textarea', { id: 'edition-notes', rows: '3', placeholder: E.notesIndication });
  notes.value = recette.notes ?? '';
  notes.dataset.champ = 'notes';
  const source = saisie('input', {
    id: 'edition-source', autocomplete: 'off', inputmode: 'url', placeholder: E.sourceIndication,
  });
  source.value = recette.source ?? '';
  source.dataset.champ = 'source';
  blocNotes.append(
    champ(libelle(E.notesLibelle, notes), notes, emplacementErreur('notes')),
    champ(libelle(E.source, source), source, emplacementErreur('source')),
  );

  // --- Barre d'actions (zone du pouce) ----------------------------------------------------
  const actions = element('div', 'edition__actions');
  actions.setAttribute('role', 'group');
  actions.setAttribute('aria-label', E.actions);
  const annuler = element('button', 'bouton', E.annuler);
  annuler.type = 'button';
  const enregistrer = element('button', 'bouton bouton--principal', E.enregistrer);
  enregistrer.type = 'submit';
  actions.append(annuler, enregistrer);

  formulaire.append(infos, blocIngredients, blocEtapes, blocNotes, actions);
  section.append(h1, formulaire);
  conteneur.append(section);
  for (const zone of formulaire.querySelectorAll('textarea')) ajusterHauteur(zone);

  // Cibles des erreurs (le premier élément reçoit le focus)
  erreurs.get('titre').cibles = [titre];
  erreurs.get('description').cibles = [description];
  erreurs.get('difficulte').cibles = radios;
  for (const [cle] of TEMPS) erreurs.get(cle).cibles = [champsTemps[cle]];
  erreurs.get('notes').cibles = [notes];
  erreurs.get('source').cibles = [source];

  // --- Erreurs ----------------------------------------------------------------------------

  /** Champ d'ingrédient fautif, selon les règles de validerRecette (dans le même ordre). */
  function cibleIngredients() {
    const items = [...listeIngredients.children].map((item) => lignes.get(item));
    const remplies = items.filter((ligne) => !ligne.vide());
    if (remplies.length === 0) return items[0]?.champs.nom;
    const sansNom = remplies.find((ligne) => ligne.champs.nom.value.trim() === '');
    if (sansNom) return sansNom.champs.nom;
    const quantite = remplies.find((ligne) => {
      const valeur = lireQuantiteSaisie(ligne.champs.quantite.value);
      return valeur !== undefined && !(valeur >= 0);
    });
    return quantite?.champs.quantite ?? remplies[0].champs.nom;
  }

  /** Première étape à remplir. */
  function cibleEtapes() {
    const items = [...listeEtapes.children].map((item) => lignes.get(item));
    return (items.find((ligne) => ligne.vide()) ?? items[0])?.champs.texte;
  }

  /** Retire le message d'erreur d'un champ. */
  function effacerErreur(cle) {
    const erreur = erreurs.get(cle);
    if (!erreur || erreur.message.hidden) return;
    erreur.message.hidden = true;
    erreur.message.textContent = '';
    for (const cible of erreur.cibles) {
      cible.removeAttribute('aria-invalid');
      decrirePar(cible, erreur.message.id, false);
    }
    erreur.cibles = erreur.cibles.filter((cible) => cible.isConnected);
  }

  /**
   * Affiche le message d'erreur d'un champ et marque ses cibles.
   * @returns {HTMLElement|undefined} l'élément qui doit recevoir le focus
   */
  function marquerErreur(cle, texte) {
    const erreur = erreurs.get(cle);
    effacerErreur(cle);
    // Ingrédients, étapes, catégories : la cible dépend de la saisie au moment de l'erreur
    if (cle === 'ingredients') erreur.cibles = [cibleIngredients()].filter(Boolean);
    if (cle === 'etapes') erreur.cibles = [cibleEtapes()].filter(Boolean);
    if (cle === 'portions') erreur.cibles = [...selecteur.querySelectorAll('button')].slice(0, 1);
    if (cle === 'categories') erreur.cibles = [nouvelle];
    // Le nom du temps précède le message, commun aux trois champs
    const champTemps = TEMPS.find(([champ]) => champ === cle);
    erreur.message.textContent = champTemps ? `${E[champTemps[1]]} : ${texte}` : texte;
    erreur.message.hidden = false;
    for (const cible of erreur.cibles) {
      cible.setAttribute('aria-invalid', 'true');
      decrirePar(cible, erreur.message.id, true);
    }
    return cle === 'difficulte' ? (radios.find((r) => r.checked) ?? radios[0]) : erreur.cibles[0];
  }

  /** Donne le focus à un champ et le centre (la barre d'actions ne le masque pas). */
  function focaliser(cible) {
    if (!cible) return;
    cible.focus({ preventScroll: true });
    cible.scrollIntoView({ block: 'center' });
  }

  /**
   * Affiche les erreurs de validation sous les champs et donne le focus au premier.
   * @param {Object<string, string>} liste { champ: message }
   */
  function afficherErreurs(liste) {
    for (const cle of erreurs.keys()) effacerErreur(cle);
    let premier;
    for (const cle of ORDRE_CHAMPS) {
      if (liste[cle] && erreurs.has(cle)) {
        const cible = marquerErreur(cle, liste[cle]);
        premier ??= cible;
      }
    }
    // Erreur sans champ visible (identifiant, dates…) : message général
    const horsFormulaire = Object.keys(liste).some((cle) => !erreurs.has(cle));
    afficherToast(horsFormulaire ? T.stockage.recetteInvalide : E.erreursFormulaire, { erreur: true });
    focaliser(premier);
  }

  // --- Lecture et enregistrement ----------------------------------------------------------

  /** Recette telle que saisie (avant nettoyage) ; id, dates, favori et photo sont conservés. */
  function lireFormulaire() {
    const donnees = {
      ...recette,
      titre: titre.value,
      description: description.value,
      difficulte: radios.find((radio) => radio.checked)?.value,
      portions: selecteur.valeur,
      categories: [...puces.querySelectorAll('.puce[aria-pressed="true"]')].map((p) => p.dataset.categorie),
      ingredients: [...listeIngredients.children].map((item) => lignes.get(item).lire()),
      etapes: [...listeEtapes.children].map((item) => lignes.get(item).lire()),
      notes: notes.value,
      source: source.value,
    };
    for (const [cle] of TEMPS) donnees[cle] = lireMinutesSaisie(champsTemps[cle].value);
    return donnees;
  }

  async function soumettre() {
    if (enCours) return;
    const aEnregistrer = nettoyerSaisie(lireFormulaire());
    const { valide, erreurs: liste } = validerRecette(aEnregistrer);
    if (!valide) {
      afficherErreurs(liste);
      return;
    }
    enCours = true;
    enregistrer.setAttribute('aria-disabled', 'true');
    enregistrer.textContent = E.enregistrement;
    try {
      const enregistree = await enregistrerRecette(aEnregistrer);
      afficherToast(E.enregistree);
      // Le formulaire est remplacé par la fiche dans l'historique
      if (actif) location.replace(`#/recette/${encodeURIComponent(enregistree.id)}`);
    } catch (erreur) {
      console.warn(erreur);
      if (!actif) return;
      if (erreur instanceof ErreurValidation) afficherErreurs(erreur.erreurs);
      else afficherToast(erreur?.message || T.stockage.generique, { erreur: true });
    } finally {
      enCours = false;
      enregistrer.removeAttribute('aria-disabled');
      enregistrer.textContent = E.enregistrer;
    }
  }

  // --- Événements -------------------------------------------------------------------------

  formulaire.addEventListener('submit', (evenement) => {
    evenement.preventDefault();
    soumettre();
  });

  // Entrée dans un champ d'une ligne n'envoie pas le formulaire (on enregistre avec le bouton)
  formulaire.addEventListener('keydown', (evenement) => {
    const cible = evenement.target;
    if (evenement.key !== 'Enter' || cible.tagName !== 'INPUT' || cible.type === 'radio') return;
    evenement.preventDefault();
    if (cible === nouvelle) creerCategorie();
  });

  // Une saisie efface l'erreur du champ concerné ; le compteur et la hauteur suivent
  formulaire.addEventListener('input', (evenement) => {
    const cible = evenement.target;
    if (cible.dataset.champ) effacerErreur(cible.dataset.champ);
    if (cible === description) mettreAJourCompteur();
    if (cible.tagName === 'TEXTAREA') ajusterHauteur(cible);
  });
  formulaire.addEventListener('change', (evenement) => {
    if (evenement.target.dataset.champ === 'difficulte') effacerErreur('difficulte');
  });

  puces.addEventListener('click', (evenement) => {
    const puce = evenement.target.closest('.puce');
    if (!puce) return;
    puce.setAttribute('aria-pressed', String(puce.getAttribute('aria-pressed') !== 'true'));
    effacerErreur('categories');
  });

  /** Crée la puce saisie (ou choisit la catégorie existante de même nom). */
  function creerCategorie() {
    const nom = nouvelle.value.trim().replace(/\s+/g, ' ');
    if (nom === '') {
      focaliser(marquerErreur('categories', T.stockage.categorieVide));
      return;
    }
    const existante = [...puces.querySelectorAll('.puce')]
      .find((puce) => normaliser(puce.dataset.categorie) === normaliser(nom));
    const puce = existante ?? ajouterPuce(nom, true);
    puce.setAttribute('aria-pressed', 'true');
    annonce.textContent = E.categorieAjoutee(puce.dataset.categorie);
    nouvelle.value = '';
    effacerErreur('categories');
    nouvelle.focus();
  }
  creer.addEventListener('click', creerCategorie);

  ajouterIngredient.addEventListener('click', () => {
    lignes.get(ajouterLigne(listeIngredients)).premier.focus();
  });
  ajouterEtape.addEventListener('click', () => {
    lignes.get(ajouterLigne(listeEtapes)).premier.focus();
  });

  annuler.addEventListener('click', () => location.replace(urlRetour));

  // La largeur change le retour à la ligne : on réajuste les zones de texte
  const redimensionner = () => {
    for (const zone of formulaire.querySelectorAll('textarea')) ajusterHauteur(zone);
  };
  window.addEventListener('resize', redimensionner);

  return () => {
    actif = false;
    window.removeEventListener('resize', redimensionner);
  };
}

/** Section du formulaire en carte, avec son titre h2. */
function creerSection(nom, titre) {
  const bloc = element('section', 'carte edition__section pile');
  const h2 = element('h2', 'edition__section-titre', titre);
  h2.id = `edition-section-${nom}`;
  bloc.setAttribute('aria-labelledby', h2.id);
  bloc.append(h2);
  return bloc;
}

/** Libellé <label> relié à son champ. */
function libelle(texte, champSaisie) {
  const label = element('label', 'champ__libelle', texte);
  label.htmlFor = champSaisie.id;
  return label;
}

/** Bloc de champ : libellé, saisie, aide et message d'erreur empilés. */
function champ(...enfants) {
  const bloc = element('div', 'champ');
  bloc.append(...enfants);
  return bloc;
}

/** Écran affiché si la recette est introuvable ou si la base ne peut pas être lue. */
function ecranMessage(titre, texte, alerte = false) {
  const section = element('section', 'ecran fiche-introuvable');
  const message = element('p', alerte ? 'carte message-erreur' : 'texte-doux', texte);
  if (alerte) message.setAttribute('role', 'alert');
  const voir = element('a', alerte ? 'bouton' : 'bouton bouton--principal', T.edition.voirRecettes);
  voir.href = '#/';
  section.append(element('h1', 'titre-ecran', titre), message, voir);
  return section;
}
