// E3 — Création (#/nouvelle) et modification (#/edition/:id) d'une recette.
// Un seul formulaire défilant en quatre sections (Infos, Ingrédients, Étapes, Notes) et
// une barre d'actions collée en bas (Annuler, Enregistrer). La validation passe par
// validerRecette : chaque erreur s'affiche sous son champ (aria-invalid, aria-describedby)
// et le focus va au premier champ en erreur. Les lignes vides sont ignorées.
//
// Saisie rapide : Entrée crée la ligne suivante, Retour arrière supprime une ligne vide,
// mode « ligne libre » (« 200 g farine », analysé à la sortie du champ), collage de
// plusieurs lignes, glisser-déposer et menu de ligne (js/composants/liste-lignes.js).
// Le formulaire est décrit par un « état » (valeurs brutes des champs) : il sert au
// pré-remplissage, au brouillon automatique et à la détection des modifications.

import { T } from '../textes.js';
import {
  ErreurValidation, cleBrouillon, ecrireReglage, enregistrerRecette, listerCategories,
  lireRecette, lireReglage,
} from '../db.js';
import {
  DIFFICULTES, LIMITES, UNITES, analyserLigneIngredient, composerLigneIngredient, creerRecette,
  decouperLignesCollees, formaterQuantiteSaisie, lireMinutesSaisie, lireQuantiteSaisie,
  nettoyerSaisie, normaliser, validerRecette,
} from '../modele.js';
import { EVENEMENT_PORTIONS, creerSelecteurPortions } from '../composants/selecteur-portions.js';
import { EVENEMENT_LIGNES, creerListeLignes } from '../composants/liste-lignes.js';
import { afficherToast } from '../composants/toast.js';

// Icônes statiques (aucun texte saisi par l'utilisateur) : innerHTML est sans risque ici.
// Provisoires : elles passeront par js/icones.js à l'étape 11.
const SVG_AJOUTER = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 5v14M5 12h14"/></svg>';
const SVG_LIGNE_LIBRE = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M4 12h16"/><path d="M4 7h10M4 17h7" opacity=".5"/></svg>';
const SVG_CHAMPS = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><rect x="3" y="5" width="5" height="6" rx="1"/><rect x="10" y="5" width="11" height="6" rx="1"/><rect x="3" y="13" width="18" height="6" rx="1"/></svg>';

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

/** Délai du brouillon automatique après la dernière modification (ms). */
const DELAI_BROUILLON = 500;

/** Le mode « ligne libre » est le mode par défaut sur mobile. */
const REQUETE_MOBILE = '(max-width: 767.98px)';

/** Compteur des identifiants de champs des lignes (uniques pour toute la session). */
let numeroChamp = 0;

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

/** Bouton « Ajouter … » sous une liste. */
function boutonAjouter(libelle) {
  const bouton = element('button', 'bouton bouton--secondaire edition__ajouter');
  bouton.type = 'button';
  bouton.innerHTML = SVG_AJOUTER;
  bouton.append(element('span', undefined, libelle));
  return bouton;
}

/** Vrai pour une chaîne vide ou faite d'espaces. */
const blanc = (texte) => String(texte ?? '').trim() === '';

/** Comparaison de deux états du formulaire. */
const memeEtat = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/** Ingrédient analysé (nombres) → valeurs brutes des champs détaillés (chaînes). */
function brutDepuisIngredient({ quantite, unite, nom, precision } = {}) {
  return {
    quantite: formaterQuantiteSaisie(quantite),
    unite: unite ?? '',
    nom: nom ?? '',
    precision: precision ?? '',
  };
}

/** Ligne libre composée à partir des valeurs brutes (une quantité illisible est gardée telle quelle). */
function composerBrut({ quantite, unite, nom, precision }) {
  const lue = lireQuantiteSaisie(quantite);
  const ligne = composerLigneIngredient({ quantite: Number.isNaN(lue) ? undefined : lue, unite, nom, precision });
  return Number.isNaN(lue) ? `${quantite.trim()} ${ligne}`.trim() : ligne;
}

/**
 * État du formulaire à partir d'une recette : valeurs brutes des champs. Les champs que le
 * formulaire n'affiche pas (section, minuteur…) voyagent dans « autres ».
 */
function etatDepuisRecette(recette) {
  return {
    titre: recette.titre ?? '',
    description: recette.description ?? '',
    difficulte: DIFFICULTES.includes(recette.difficulte) ? recette.difficulte : 'facile',
    temps: Object.fromEntries(TEMPS.map(([cle]) => [cle, Number.isFinite(recette[cle]) ? String(recette[cle]) : ''])),
    portions: recette.portions,
    categories: [...(recette.categories ?? [])],
    ingredients: (recette.ingredients ?? []).map(({ quantite, unite, nom, precision, ...autres }) => ({
      ...brutDepuisIngredient({ quantite, unite, nom, precision }),
      autres,
    })),
    etapes: (recette.etapes ?? []).map(({ texte, ...autres }) => ({ texte: texte ?? '', autres })),
    notes: recette.notes ?? '',
    source: recette.source ?? '',
  };
}

/**
 * @param {HTMLElement} conteneur
 * @param {{ id?: string }} params id absent : nouvelle recette
 * @returns {Promise<(() => void) | undefined>} nettoyage, avec la garde de sortie confirmerSortie()
 */
export async function afficher(conteneur, params) {
  const modification = params.id !== undefined;
  const cle = cleBrouillon(modification ? params.id : undefined);
  let recette;
  let categoriesConnues;
  let brouillon;
  try {
    [recette, categoriesConnues, brouillon] = await Promise.all([
      modification ? lireRecette(params.id) : creerRecette(),
      listerCategories(),
      lireReglage(cle).catch((erreur) => {
        console.warn(erreur);
        return undefined;
      }),
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
  // Sortie autorisée sans confirmation (après Enregistrer ou « Quitter »)
  let sortieAutorisee = false;
  const urlRetour = modification ? `#/recette/${encodeURIComponent(recette.id)}` : '#/';
  // Mode des nouvelles lignes d'ingrédients : suit le dernier choix fait dans le formulaire
  let modeIngredients = window.matchMedia?.(REQUETE_MOBILE).matches ? 'libre' : 'detail';

  const section = element('section', 'ecran edition');
  const formulaire = element('form', 'edition__formulaire');
  formulaire.noValidate = true; // validation maison : messages sous les champs
  formulaire.setAttribute('aria-labelledby', 'edition-titre-ecran');
  const h1 = element('h1', 'titre-ecran', modification ? E.titreModification : E.titreNouvelle);
  h1.id = 'edition-titre-ecran';

  // Emplacements des messages d'erreur et champs concernés, par clé de validerRecette
  const erreurs = new Map();
  /** Crée l'emplacement du message d'erreur d'un champ. */
  function emplacementErreur(cleErreur) {
    const message = element('p', 'champ__erreur');
    message.id = `edition-erreur-${cleErreur}`;
    message.hidden = true;
    erreurs.set(cleErreur, { message, cibles: [] });
    return message;
  }

  // --- Section Infos ------------------------------------------------------------------
  const infos = creerSection('infos', E.infos);

  // Titre (obligatoire)
  const titre = saisie('input', { id: 'edition-titre', autocomplete: 'off', placeholder: E.titreIndication });
  titre.required = true;
  titre.dataset.champ = 'titre';
  const libelleTitre = element('label', 'champ__libelle', E.titre);
  libelleTitre.htmlFor = titre.id;
  libelleTitre.append(' ', element('span', 'champ__obligatoire', E.obligatoire));
  infos.append(champ(libelleTitre, titre, emplacementErreur('titre')));

  // Description et compteur de caractères
  const description = saisie('textarea', {
    id: 'edition-description', rows: '3', placeholder: E.descriptionIndication,
  });
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
  for (const [cleTemps, texte] of TEMPS) {
    const input = saisie('input', {
      id: `edition-${cleTemps}`, inputmode: 'numeric', pattern: '[0-9]*', autocomplete: 'off',
    });
    input.dataset.champ = cleTemps;
    const etiquette = element('label', 'edition__temps-libelle', E[texte]);
    etiquette.htmlFor = input.id;
    etiquette.append(element('span', 'visuellement-cache', ` (${E.enMinutes})`));
    const boite = element('div', 'saisie-unite');
    const unite = element('span', 'saisie-unite__unite', E.minutes);
    unite.setAttribute('aria-hidden', 'true');
    boite.append(input, unite);
    const bloc = element('div', 'champ');
    bloc.append(etiquette, boite);
    grilleTemps.append(bloc);
    messagesTemps.push(emplacementErreur(cleTemps));
    champsTemps[cleTemps] = input;
  }
  temps.append(grilleTemps, ...messagesTemps);
  infos.append(temps);

  // Portions
  const selecteur = creerSelecteurPortions({ valeur: recette.portions });
  const lignePortions = element('div', 'edition__portions');
  lignePortions.append(element('span', 'champ__libelle', E.portions), selecteur);
  infos.append(lignePortions, emplacementErreur('portions'));

  // Catégories : puces bascule et création à la volée
  const categories = element('fieldset', 'edition__categories');
  categories.append(element('legend', 'champ__libelle', E.categories));
  const puces = element('div', 'edition__puces');
  const aucune = element('p', 'texte-doux', E.aucuneCategorie);
  const annonceCategorie = element('p', 'visuellement-cache');
  annonceCategorie.setAttribute('aria-live', 'polite');
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
    emplacementErreur('categories'), annonceCategorie,
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
  const pucesExistantes = () => [...puces.querySelectorAll('.puce')];
  const nomsCategories = [...new Set([...categoriesConnues, ...(recette.categories ?? [])])]
    .sort((a, b) => a.localeCompare(b, 'fr', { sensitivity: 'base' }));
  for (const nom of nomsCategories) ajouterPuce(nom, false);
  aucune.hidden = nomsCategories.length > 0;

  // --- Section Ingrédients ----------------------------------------------------------------
  const blocIngredients = creerSection('ingredients', E.ingredients);
  const unites = element('datalist');
  unites.id = ID_UNITES;
  for (const unite of UNITES) {
    const option = element('option');
    option.value = unite;
    unites.append(option);
  }

  /** Contenu d'une ligne d'ingrédient : champs détaillés et champ « ligne libre ». */
  function contenuIngredient(donnees = {}) {
    const autres = donnees.autres ?? {};
    const prefixe = `edition-ingredient-${++numeroChamp}`;
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
    const libre = saisie('input', {
      autocomplete: 'off', placeholder: E.ligneLibreIndication, 'aria-label': E.ligneLibreLibelle,
    });
    for (const [nomChamp, input] of Object.entries({ ...champs, libre })) {
      input.id = `${prefixe}-${nomChamp}`;
      input.classList.add(`ligne-ingredient__${nomChamp}`);
      input.dataset.champ = 'ingredients';
    }
    for (const nomChamp of Object.keys(champs)) champs[nomChamp].value = donnees[nomChamp] ?? '';
    groupe.append(champs.quantite, champs.unite, champs.nom, champs.precision, libre);

    let mode = modeIngredients;
    // Le champ libre a été modifié depuis sa dernière analyse
    let libreModifie = false;

    /** Valeurs brutes des champs détaillés ; en ligne libre modifiée, celles de son analyse. */
    function detaillees() {
      if (mode === 'libre' && libreModifie) return brutDepuisIngredient(analyserLigneIngredient(libre.value));
      return Object.fromEntries(Object.entries(champs).map(([nomChamp, input]) => [nomChamp, input.value]));
    }

    /** Sortie du champ libre : la saisie est décomposée dans les champs détaillés, puis réécrite. */
    function synchroniser() {
      if (!(mode === 'libre' && libreModifie)) return;
      const valeurs = detaillees();
      for (const [nomChamp, input] of Object.entries(champs)) input.value = valeurs[nomChamp];
      libreModifie = false;
      libre.value = composerBrut(valeurs);
    }

    function appliquerMode() {
      const enLigne = mode === 'libre';
      groupe.classList.toggle('ligne-ingredient--libre', enLigne);
      for (const input of Object.values(champs)) input.hidden = enLigne;
      libre.hidden = !enLigne;
      if (enLigne) {
        libre.value = composerBrut(detaillees());
        libreModifie = false;
      }
    }

    libre.addEventListener('input', () => { libreModifie = true; });
    libre.addEventListener('change', synchroniser);
    appliquerMode();

    return {
      element: groupe,
      premier: () => (mode === 'libre' ? libre : champs.quantite),
      dernier: () => (mode === 'libre' ? libre : champs.precision),
      numeroter: (numero) => groupe.setAttribute('aria-label', E.ingredient(numero)),
      actions: [{
        libelle: () => (mode === 'libre' ? E.champsDetailles : E.ligneLibre),
        icone: () => (mode === 'libre' ? SVG_CHAMPS : SVG_LIGNE_LIBRE),
        executer: () => {
          synchroniser();
          mode = mode === 'libre' ? 'detail' : 'libre';
          modeIngredients = mode;
          appliquerMode();
          (mode === 'libre' ? libre : champs.quantite).focus();
        },
      }],
      // Champ à marquer en erreur (en ligne libre, le champ unique)
      cible: (nomChamp) => (mode === 'libre' ? libre : champs[nomChamp]),
      // Entrée crée la ligne suivante depuis ces champs
      continueSurEntree: (input) => [champs.nom, champs.precision, libre].includes(input),
      detaillees,
      etat: () => ({ ...detaillees(), autres }),
      lire: () => {
        const valeurs = detaillees();
        return { ...autres, ...valeurs, quantite: lireQuantiteSaisie(valeurs.quantite) };
      },
      // Même règle que validerRecette : l'unité seule ne compte pas
      vide: () => {
        const valeurs = detaillees();
        return blanc(valeurs.quantite) && blanc(valeurs.nom) && blanc(valeurs.precision);
      },
      // Pour le retour arrière : aucun caractère dans la ligne, unité comprise
      entierementVide: () => (mode === 'libre'
        ? blanc(libre.value)
        : Object.values(champs).every((input) => blanc(input.value))),
    };
  }

  const listeIngredients = creerListeLignes({
    creerContenu: contenuIngredient,
    libelles: { menu: E.menuIngredient, position: E.positionIngredient },
  });
  const ajouterIngredient = boutonAjouter(E.ajouterIngredient);
  blocIngredients.append(
    listeIngredients.element, listeIngredients.annonce, emplacementErreur('ingredients'), ajouterIngredient, unites,
  );

  // --- Section Étapes ---------------------------------------------------------------------
  const blocEtapes = creerSection('etapes', E.etapes);

  /** Contenu d'une ligne d'étape : numéro et texte auto-redimensionné. */
  function contenuEtape(donnees = {}) {
    const autres = donnees.autres ?? {}; // minuteur conservé
    const bloc = element('div', 'ligne-etape');
    const numero = element('span', 'ligne-etape__numero');
    numero.setAttribute('aria-hidden', 'true');
    const texte = saisie('textarea', { rows: '2', placeholder: E.etapeIndication });
    texte.id = `edition-etape-${++numeroChamp}`;
    texte.dataset.champ = 'etapes';
    texte.value = donnees.texte ?? '';
    bloc.append(numero, texte);
    return {
      element: bloc,
      premier: () => texte,
      dernier: () => texte,
      numeroter: (n) => {
        numero.textContent = String(n);
        texte.setAttribute('aria-label', E.etape(n));
      },
      cible: () => texte,
      etat: () => ({ texte: texte.value, autres }),
      lire: () => ({ ...autres, texte: texte.value }),
      vide: () => blanc(texte.value),
      entierementVide: () => texte.value === '',
    };
  }

  const listeEtapes = creerListeLignes({
    creerContenu: contenuEtape,
    libelles: { menu: E.menuEtape, position: E.positionEtape },
  });
  const ajouterEtape = boutonAjouter(E.ajouterEtape);
  blocEtapes.append(listeEtapes.element, listeEtapes.annonce, emplacementErreur('etapes'), ajouterEtape);

  /** Liste (ingrédients ou étapes) qui contient un élément, et sa ligne. */
  function ligneDe(noeud) {
    for (const liste of [listeIngredients, listeEtapes]) {
      const item = liste.ligneDe(noeud);
      if (item) return { liste, item, contenu: liste.contenu(item), etapes: liste === listeEtapes };
    }
    return null;
  }

  // --- Section Notes ----------------------------------------------------------------------
  const blocNotes = creerSection('notes', E.notes);
  const notes = saisie('textarea', { id: 'edition-notes', rows: '3', placeholder: E.notesIndication });
  notes.dataset.champ = 'notes';
  const source = saisie('input', {
    id: 'edition-source', autocomplete: 'off', inputmode: 'url', placeholder: E.sourceIndication,
  });
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

  const dialogueSortie = creerDialogueSortie();
  formulaire.append(infos, blocIngredients, blocEtapes, blocNotes, actions);
  section.append(h1, formulaire, dialogueSortie);

  // --- État du formulaire ------------------------------------------------------------------

  /** Valeurs brutes de tous les champs (comparables, enregistrables comme brouillon). */
  function etatFormulaire() {
    return {
      titre: titre.value,
      description: description.value,
      difficulte: radios.find((radio) => radio.checked)?.value ?? '',
      temps: Object.fromEntries(TEMPS.map(([cleTemps]) => [cleTemps, champsTemps[cleTemps].value])),
      portions: selecteur.valeur,
      categories: pucesExistantes()
        .filter((puce) => puce.getAttribute('aria-pressed') === 'true')
        .map((puce) => puce.dataset.categorie),
      ingredients: listeIngredients.items().map((item) => listeIngredients.contenu(item).etat()),
      etapes: listeEtapes.items().map((item) => listeEtapes.contenu(item).etat()),
      notes: notes.value,
      source: source.value,
    };
  }

  /** Remplit le formulaire à partir d'un état (recette ou brouillon). */
  function appliquerEtat(etat) {
    titre.value = etat.titre ?? '';
    description.value = etat.description ?? '';
    for (const radio of radios) radio.checked = radio.value === etat.difficulte;
    if (!radios.some((radio) => radio.checked)) radios[0].checked = true;
    for (const [cleTemps] of TEMPS) champsTemps[cleTemps].value = etat.temps?.[cleTemps] ?? '';
    selecteur.valeur = etat.portions;
    const choisies = new Set(etat.categories ?? []);
    for (const puce of pucesExistantes()) puce.setAttribute('aria-pressed', String(choisies.has(puce.dataset.categorie)));
    const connues = new Set(pucesExistantes().map((puce) => puce.dataset.categorie));
    for (const nom of choisies) if (!connues.has(nom)) ajouterPuce(nom, true);
    listeIngredients.remplacer(etat.ingredients);
    listeEtapes.remplacer(etat.etapes);
    notes.value = etat.notes ?? '';
    source.value = etat.source ?? '';
    mettreAJourCompteur();
    for (const cleErreur of erreurs.keys()) effacerErreur(cleErreur);
    ajusterZones();
  }

  /** Recette telle que saisie (avant nettoyage) ; id, dates, favori et photo sont conservés. */
  function lireFormulaire() {
    const donnees = {
      ...recette,
      titre: titre.value,
      description: description.value,
      difficulte: radios.find((radio) => radio.checked)?.value,
      portions: selecteur.valeur,
      categories: etatFormulaire().categories,
      ingredients: listeIngredients.items().map((item) => listeIngredients.contenu(item).lire()),
      etapes: listeEtapes.items().map((item) => listeEtapes.contenu(item).lire()),
      notes: notes.value,
      source: source.value,
    };
    for (const [cleTemps] of TEMPS) donnees[cleTemps] = lireMinutesSaisie(champsTemps[cleTemps].value);
    return donnees;
  }

  function ajusterZones() {
    for (const zone of formulaire.querySelectorAll('textarea')) ajusterHauteur(zone);
  }

  appliquerEtat(etatDepuisRecette(recette));
  conteneur.append(section);
  ajusterZones();
  // Référence pour savoir si le formulaire a été modifié
  const etatInitial = etatFormulaire();
  const modifie = () => !memeEtat(etatFormulaire(), etatInitial);

  // Cibles des erreurs (le premier élément reçoit le focus)
  erreurs.get('titre').cibles = [titre];
  erreurs.get('description').cibles = [description];
  erreurs.get('difficulte').cibles = radios;
  for (const [cleTemps] of TEMPS) erreurs.get(cleTemps).cibles = [champsTemps[cleTemps]];
  erreurs.get('notes').cibles = [notes];
  erreurs.get('source').cibles = [source];

  // --- Brouillon automatique et modifications non enregistrées ---------------------------

  // Les écritures du brouillon passent par une file : une suppression suit toujours
  // l'écriture en cours, et ne peut pas être écrasée par elle.
  let fileBrouillon = Promise.resolve();
  let minuterie = null;
  let bandeau = null;

  function mettreEnFile(tache) {
    fileBrouillon = fileBrouillon.then(tache).catch((erreur) => console.warn(erreur));
    return fileBrouillon;
  }

  /** Enregistre l'état courant comme brouillon (ou supprime le brouillon s'il n'y a plus de modification). */
  function sauverBrouillon() {
    clearTimeout(minuterie);
    minuterie = null;
    if (bandeau || sortieAutorisee) return;
    const etat = etatFormulaire();
    const valeur = memeEtat(etat, etatInitial) ? undefined : { date: new Date().toISOString(), etat };
    mettreEnFile(() => ecrireReglage(cle, valeur));
  }

  function oublierBrouillon() {
    clearTimeout(minuterie);
    minuterie = null;
    return mettreEnFile(() => ecrireReglage(cle, undefined));
  }

  // Fermeture de l'onglet avec des modifications : le navigateur demande confirmation
  const avertirFermeture = (evenement) => {
    evenement.preventDefault();
    evenement.returnValue = '';
  };
  let avertissementActif = false;
  function mettreAJourAvertissement() {
    const voulu = actif && !sortieAutorisee && modifie();
    if (voulu === avertissementActif) return;
    avertissementActif = voulu;
    if (voulu) window.addEventListener('beforeunload', avertirFermeture);
    else window.removeEventListener('beforeunload', avertirFermeture);
  }

  /** À chaque modification : brouillon 500 ms plus tard, avertissement de fermeture à jour. */
  function signalerModification() {
    if (!actif) return;
    clearTimeout(minuterie);
    minuterie = setTimeout(sauverBrouillon, DELAI_BROUILLON);
    mettreAJourAvertissement();
  }

  // Brouillon trouvé à l'ouverture : un bandeau propose de le reprendre
  if (brouillon?.etat && !memeEtat(brouillon.etat, etatInitial)) {
    bandeau = creerBandeauBrouillon(brouillon.date);
    h1.after(bandeau);
    bandeau.querySelector('[data-action="reprendre"]').addEventListener('click', () => {
      fermerBandeau();
      appliquerEtat(brouillon.etat);
      afficherToast(E.brouillonRepris);
      titre.focus();
      signalerModification();
    });
    bandeau.querySelector('[data-action="ignorer"]').addEventListener('click', () => {
      fermerBandeau();
      oublierBrouillon();
      titre.focus();
      // Ce qui a été saisi pendant l'affichage du bandeau devient le nouveau brouillon
      if (modifie()) signalerModification();
    });
  } else if (brouillon !== undefined) {
    oublierBrouillon(); // brouillon identique à la recette : inutile
  }

  function fermerBandeau() {
    bandeau?.remove();
    bandeau = null;
  }

  /**
   * Garde de sortie (routeur, Annuler) : vrai tout de suite s'il n'y a rien à perdre,
   * sinon une promesse résolue après la réponse à la fenêtre de confirmation.
   * @returns {true | Promise<boolean>}
   */
  function confirmerSortie() {
    if (sortieAutorisee || !actif || !modifie()) return true;
    if (dialogueSortie.open) return Promise.resolve(false);
    dialogueSortie.returnValue = '';
    dialogueSortie.showModal();
    return new Promise((resoudre) => {
      dialogueSortie.addEventListener('close', () => {
        if (dialogueSortie.returnValue !== 'quitter') {
          resoudre(false);
          return;
        }
        sortieAutorisee = true;
        mettreAJourAvertissement();
        oublierBrouillon();
        resoudre(true);
      }, { once: true });
    });
  }

  // --- Erreurs ----------------------------------------------------------------------------

  /** Champ d'ingrédient fautif, selon les règles de validerRecette (dans le même ordre). */
  function cibleIngredients() {
    const contenus = listeIngredients.items().map((item) => listeIngredients.contenu(item));
    const remplies = contenus.filter((contenu) => !contenu.vide());
    if (remplies.length === 0) return contenus[0]?.cible('nom');
    const sansNom = remplies.find((contenu) => blanc(contenu.detaillees().nom));
    if (sansNom) return sansNom.cible('nom');
    const quantite = remplies.find((contenu) => {
      const valeur = lireQuantiteSaisie(contenu.detaillees().quantite);
      return valeur !== undefined && !(valeur >= 0);
    });
    return quantite?.cible('quantite') ?? remplies[0].cible('nom');
  }

  /** Première étape à remplir. */
  function cibleEtapes() {
    const contenus = listeEtapes.items().map((item) => listeEtapes.contenu(item));
    return (contenus.find((contenu) => contenu.vide()) ?? contenus[0])?.cible();
  }

  /** Retire le message d'erreur d'un champ. */
  function effacerErreur(cleErreur) {
    const erreur = erreurs.get(cleErreur);
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
  function marquerErreur(cleErreur, texte) {
    const erreur = erreurs.get(cleErreur);
    effacerErreur(cleErreur);
    // Ingrédients, étapes, catégories : la cible dépend de la saisie au moment de l'erreur
    if (cleErreur === 'ingredients') erreur.cibles = [cibleIngredients()].filter(Boolean);
    if (cleErreur === 'etapes') erreur.cibles = [cibleEtapes()].filter(Boolean);
    if (cleErreur === 'portions') erreur.cibles = [...selecteur.querySelectorAll('button')].slice(0, 1);
    if (cleErreur === 'categories') erreur.cibles = [nouvelle];
    // Le nom du temps précède le message, commun aux trois champs
    const champTemps = TEMPS.find(([cleTemps]) => cleTemps === cleErreur);
    erreur.message.textContent = champTemps ? `${E[champTemps[1]]} : ${texte}` : texte;
    erreur.message.hidden = false;
    for (const cible of erreur.cibles) {
      cible.setAttribute('aria-invalid', 'true');
      decrirePar(cible, erreur.message.id, true);
    }
    return cleErreur === 'difficulte' ? (radios.find((r) => r.checked) ?? radios[0]) : erreur.cibles[0];
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
    for (const cleErreur of erreurs.keys()) effacerErreur(cleErreur);
    let premier;
    for (const cleErreur of ORDRE_CHAMPS) {
      if (liste[cleErreur] && erreurs.has(cleErreur)) {
        const cible = marquerErreur(cleErreur, liste[cleErreur]);
        premier ??= cible;
      }
    }
    // Erreur sans champ visible (identifiant, dates…) : message général
    const horsFormulaire = Object.keys(liste).some((cleErreur) => !erreurs.has(cleErreur));
    afficherToast(horsFormulaire ? T.stockage.recetteInvalide : E.erreursFormulaire, { erreur: true });
    focaliser(premier);
  }

  // --- Enregistrement ---------------------------------------------------------------------

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
      sortieAutorisee = true;
      mettreAJourAvertissement();
      oublierBrouillon();
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

  formulaire.addEventListener('keydown', (evenement) => {
    if (evenement.isComposing || evenement.defaultPrevented) return;
    const cible = evenement.target;
    const estChamp = cible.tagName === 'INPUT' || cible.tagName === 'TEXTAREA';
    const ligne = estChamp ? ligneDe(cible) : null;

    if (evenement.key === 'Enter') {
      // Étape : Entrée crée l'étape suivante, Maj+Entrée insère un retour à la ligne
      if (cible.tagName === 'TEXTAREA') {
        if (!ligne?.etapes || evenement.shiftKey) return;
        evenement.preventDefault();
        listeEtapes.ajouter({}, { apres: ligne.item, focaliser: true });
        return;
      }
      // Dans un champ, Entrée n'envoie jamais le formulaire (on enregistre avec le bouton)
      if (cible.tagName !== 'INPUT') return;
      evenement.preventDefault();
      if (ligne && !ligne.etapes && ligne.contenu.continueSurEntree(cible)) {
        listeIngredients.ajouter({}, { apres: ligne.item, focaliser: true });
      } else if (cible === nouvelle) {
        creerCategorie();
      }
      return;
    }

    // Retour arrière dans une ligne entièrement vide : elle disparaît, le focus remonte.
    // La répétition de la touche ne supprime pas les lignes en cascade.
    if (evenement.key === 'Backspace' && ligne && !evenement.repeat
      && ligne.item.previousElementSibling && ligne.contenu.entierementVide()) {
      evenement.preventDefault();
      ligne.liste.supprimer(ligne.item, { remonter: true });
    }
  });

  // Collage de plusieurs lignes : un ingrédient (analysé) ou une étape par ligne
  formulaire.addEventListener('paste', (evenement) => {
    const ligne = ligneDe(evenement.target);
    const texte = evenement.clipboardData?.getData('text/plain') ?? '';
    if (!ligne || !texte.trim().includes('\n')) return;
    const morceaux = decouperLignesCollees(texte, { paragraphes: ligne.etapes });
    if (morceaux.length === 0) return;
    evenement.preventDefault();
    const donnees = ligne.etapes
      ? morceaux.map((morceau) => ({ texte: morceau }))
      : morceaux.map((morceau) => brutDepuisIngredient(analyserLigneIngredient(morceau)));
    let apres = ligne.item;
    for (const valeurs of donnees) apres = ligne.liste.ajouter(valeurs, { apres });
    // Une ligne vide est remplacée par les lignes collées
    if (ligne.contenu.entierementVide()) ligne.liste.retirer(ligne.item);
    const champ = ligne.liste.contenu(apres).dernier();
    champ.focus();
    champ.setSelectionRange?.(champ.value.length, champ.value.length);
    ligne.liste.annoncer(ligne.etapes ? E.etapesCollees(donnees.length) : E.ingredientsColles(donnees.length));
  });

  // Une saisie efface l'erreur du champ concerné ; compteur, hauteur et brouillon suivent
  formulaire.addEventListener('input', (evenement) => {
    const cible = evenement.target;
    if (cible.dataset.champ) effacerErreur(cible.dataset.champ);
    if (cible === description) mettreAJourCompteur();
    if (cible.tagName === 'TEXTAREA') ajusterHauteur(cible);
    if (cible !== nouvelle) signalerModification();
  });
  formulaire.addEventListener('change', (evenement) => {
    if (evenement.target.dataset.champ === 'difficulte') effacerErreur('difficulte');
    if (evenement.target !== nouvelle) signalerModification();
  });
  formulaire.addEventListener(EVENEMENT_PORTIONS, signalerModification);
  formulaire.addEventListener(EVENEMENT_LIGNES, () => {
    ajusterZones();
    signalerModification();
  });

  puces.addEventListener('click', (evenement) => {
    const puce = evenement.target.closest('.puce');
    if (!puce) return;
    puce.setAttribute('aria-pressed', String(puce.getAttribute('aria-pressed') !== 'true'));
    effacerErreur('categories');
    signalerModification();
  });

  /** Crée la puce saisie (ou choisit la catégorie existante de même nom). */
  function creerCategorie() {
    const nom = nouvelle.value.trim().replace(/\s+/g, ' ');
    if (nom === '') {
      focaliser(marquerErreur('categories', T.stockage.categorieVide));
      return;
    }
    const existante = pucesExistantes().find((puce) => normaliser(puce.dataset.categorie) === normaliser(nom));
    const puce = existante ?? ajouterPuce(nom, true);
    puce.setAttribute('aria-pressed', 'true');
    annonceCategorie.textContent = E.categorieAjoutee(puce.dataset.categorie);
    nouvelle.value = '';
    effacerErreur('categories');
    nouvelle.focus();
    signalerModification();
  }
  creer.addEventListener('click', creerCategorie);

  ajouterIngredient.addEventListener('click', () => listeIngredients.ajouter({}, { focaliser: true }));
  ajouterEtape.addEventListener('click', () => listeEtapes.ajouter({}, { focaliser: true }));

  annuler.addEventListener('click', async () => {
    if (await confirmerSortie()) location.replace(urlRetour);
  });

  // La largeur change le retour à la ligne : on réajuste les zones de texte
  window.addEventListener('resize', ajusterZones);

  const nettoyage = () => {
    // Une modification pas encore sauvegardée part dans le brouillon
    if (minuterie !== null) sauverBrouillon();
    actif = false;
    mettreAJourAvertissement();
    window.removeEventListener('resize', ajusterZones);
    listeIngredients.nettoyer();
    listeEtapes.nettoyer();
    if (dialogueSortie.open) dialogueSortie.close();
  };
  nettoyage.confirmerSortie = confirmerSortie;
  return nettoyage;
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

/** Bandeau « Brouillon retrouvé » : Reprendre le brouillon ou Ignorer. */
function creerBandeauBrouillon(date) {
  const E = T.edition;
  const bandeau = element('section', 'carte bandeau-brouillon');
  bandeau.setAttribute('aria-labelledby', 'edition-brouillon-titre');
  const titre = element('h2', 'bandeau-brouillon__titre', E.brouillonTitre);
  titre.id = 'edition-brouillon-titre';
  const quand = Date.parse(date);
  const dateLisible = Number.isNaN(quand)
    ? ''
    : new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeStyle: 'short' }).format(quand);
  const texte = element('p', 'texte-doux', E.brouillonTexte(dateLisible));
  const boutons = element('div', 'rangee');
  const reprendre = element('button', 'bouton bouton--principal', E.reprendreBrouillon);
  reprendre.type = 'button';
  reprendre.dataset.action = 'reprendre';
  const ignorer = element('button', 'bouton', E.ignorerBrouillon);
  ignorer.type = 'button';
  ignorer.dataset.action = 'ignorer';
  boutons.append(reprendre, ignorer);
  bandeau.append(titre, texte, boutons);
  return bandeau;
}

/** Confirmation de sortie avec des modifications non enregistrées (<dialog> modal). */
function creerDialogueSortie() {
  const E = T.edition;
  const dialogue = element('dialog', 'dialogue');
  dialogue.setAttribute('aria-labelledby', 'dialogue-sortie-titre');
  dialogue.setAttribute('aria-describedby', 'dialogue-sortie-texte');
  const corps = element('form', 'dialogue__corps');
  corps.method = 'dialog';
  const h2 = element('h2', 'dialogue__titre', E.quitterTitre);
  h2.id = 'dialogue-sortie-titre';
  const texte = element('p', 'dialogue__texte', E.quitterTexte);
  texte.id = 'dialogue-sortie-texte';
  const boutons = element('div', 'dialogue__actions');
  const continuer = element('button', 'bouton', E.continuer);
  continuer.value = 'continuer';
  continuer.autofocus = true; // l'action sans risque reçoit le focus
  const quitter = element('button', 'bouton bouton--danger', E.quitter);
  quitter.value = 'quitter';
  boutons.append(continuer, quitter);
  corps.append(h2, texte, boutons);
  dialogue.append(corps);
  // Un clic sur le fond (hors du corps) revient à la saisie
  dialogue.addEventListener('click', (evenement) => {
    if (evenement.target === dialogue) dialogue.close('continuer');
  });
  return dialogue;
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
