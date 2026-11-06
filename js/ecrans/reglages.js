// E5 — Réglages (#/reglages) : thème, catégories, données (export, import, effacement), à propos.
//
// Le thème est mémorisé dans localStorage (et non dans IndexedDB) : le script en ligne de
// index.html doit pouvoir le lire de façon synchrone, avant le premier rendu.

import { T } from '../textes.js';
import { VERSION } from '../app.js';
import {
  enregistrerCategorie, listerCategories, listerRecettes, renommerCategorie,
  supprimerCategorie, toutEffacer, toutExporter, toutImporter,
} from '../db.js';
import { analyserImport, formaterMo, nomFichierExport } from '../modele.js';
import { afficherToast } from '../composants/toast.js';
import { icone } from '../icones.js';

const R = T.reglages;


// ---------------------------------------------------------------------------
// Thème
// ---------------------------------------------------------------------------

/** Clé localStorage du thème ; le script en ligne de index.html utilise la même. */
const CLE_THEME = 'recette.theme';
const THEMES = ['clair', 'sombre', 'systeme'];
// Couleur de la barre du navigateur : --fond de chaque thème (comme dans index.html)
const COULEURS_BARRE = { clair: '#f6f0ea', sombre: '#171311' };

/** Thème mémorisé : « clair », « sombre » ou « systeme » (valeur par défaut). */
function lireTheme() {
  try {
    const theme = localStorage.getItem(CLE_THEME);
    return theme === 'clair' || theme === 'sombre' ? theme : 'systeme';
  } catch {
    return 'systeme';
  }
}

/** Applique le thème : data-theme sur <html>, schéma de couleurs et couleur de la barre. */
function appliquerTheme(theme) {
  const racine = document.documentElement;
  if (theme === 'systeme') delete racine.dataset.theme;
  else racine.dataset.theme = theme;
  const schema = document.querySelector('meta[name="color-scheme"]');
  if (schema) schema.content = { clair: 'light', sombre: 'dark' }[theme] ?? 'light dark';
  for (const meta of document.querySelectorAll('meta[name="theme-color"]')) {
    const duSysteme = meta.media.includes('dark') ? 'sombre' : 'clair';
    meta.content = COULEURS_BARRE[theme === 'systeme' ? duSysteme : theme];
  }
}

/** Mémorise le thème (« systeme » efface le choix). */
function memoriserTheme(theme) {
  try {
    if (theme === 'systeme') localStorage.removeItem(CLE_THEME);
    else localStorage.setItem(CLE_THEME, theme);
  } catch {
    // Stockage local inaccessible : le choix vaut pour cette visite seulement
  }
}

// ---------------------------------------------------------------------------
// Petits outils de construction
// ---------------------------------------------------------------------------

/** Crée un élément à partir d'une balise, d'une classe et d'un texte (via textContent). */
function element(balise, classe, texte) {
  const el = document.createElement(balise);
  if (classe) el.className = classe;
  if (texte !== undefined) el.textContent = texte;
  return el;
}

/** Bouton avec une icône suivie d'un libellé. */
function boutonAvecIcone(classe, nomIcone, libelle) {
  const bouton = element('button', classe);
  bouton.type = 'button';
  bouton.append(icone(nomIcone, { taille: 20 }), element('span', undefined, libelle));
  return bouton;
}

/** Bouton rond à icône seule (libellé via aria-label). */
function boutonIcone(nomIcone, libelle) {
  const bouton = element('button', 'bouton bouton--icone');
  bouton.type = 'button';
  bouton.append(icone(nomIcone));
  bouton.setAttribute('aria-label', libelle);
  return bouton;
}

/** Bloc de réglages en carte, titré par un h2 qui peut recevoir le focus. */
function creerBloc(nom, titre) {
  const bloc = element('section', `carte reglages__bloc reglages__${nom}`);
  const h2 = element('h2', 'reglages__bloc-titre', titre);
  h2.id = `reglages-${nom}`;
  h2.tabIndex = -1;
  bloc.setAttribute('aria-labelledby', h2.id);
  bloc.append(h2);
  return { bloc, h2 };
}

let compteurDialogues = 0;

/**
 * Ouvre une fenêtre modale (<dialog>, form method="dialog") et attend sa fermeture.
 * Le bouton de valeur « annuler » reçoit le focus (sauf autre élément marqué autofocus) ;
 * Échap et un clic sur le fond annulent. Le <dialog> est retiré du DOM à la fermeture.
 * @param {HTMLElement} parent
 * @param {{ titre: string, contenu: Node[],
 *   boutons: { texte: string, valeur: string, classe?: string }[],
 *   preparer?: (corps: HTMLFormElement, boutons: Object<string, HTMLButtonElement>) => void }} options
 * @returns {Promise<string>} valeur du bouton choisi, « annuler » par défaut
 */
function ouvrirDialogue(parent, { titre, contenu, boutons, preparer }) {
  return new Promise((resoudre) => {
    const id = `reglages-dialogue-${++compteurDialogues}`;
    const dialogue = element('dialog', 'dialogue');
    dialogue.setAttribute('aria-labelledby', `${id}-titre`);
    dialogue.setAttribute('aria-describedby', `${id}-texte`);

    const corps = element('form', 'dialogue__corps');
    corps.method = 'dialog';
    const h2 = element('h2', 'dialogue__titre', titre);
    h2.id = `${id}-titre`;
    const texte = element('div', 'dialogue__texte reglages__dialogue-texte');
    texte.id = `${id}-texte`;
    texte.append(...contenu);

    const actions = element('div', 'dialogue__actions');
    const parValeur = {};
    for (const { texte: libelle, valeur, classe } of boutons) {
      const bouton = element('button', classe ? `bouton ${classe}` : 'bouton', libelle);
      bouton.value = valeur;
      if (valeur === 'annuler') {
        // Bouton ordinaire : Entrée dans un champ ne doit pas déclencher l'annulation
        bouton.type = 'button';
        bouton.autofocus = true; // l'action sans risque reçoit le focus
        bouton.addEventListener('click', () => dialogue.close('annuler'));
      }
      parValeur[valeur] = bouton;
      actions.append(bouton);
    }
    corps.append(h2, texte, actions);
    dialogue.append(corps);
    preparer?.(corps, parValeur);

    // Un clic sur le fond (hors du corps) annule
    dialogue.addEventListener('click', (evenement) => {
      if (evenement.target === dialogue) dialogue.close('annuler');
    });
    dialogue.addEventListener('close', () => {
      dialogue.remove();
      resoudre(dialogue.returnValue || 'annuler');
    }, { once: true });

    parent.append(dialogue);
    dialogue.showModal();
  });
}

/** Message d'erreur d'une opération de stockage, en toast. */
function signalerErreur(erreur) {
  console.warn(erreur);
  afficherToast(erreur?.message || T.stockage.generique, { erreur: true });
}

// ---------------------------------------------------------------------------
// Écran
// ---------------------------------------------------------------------------

/**
 * @param {HTMLElement} conteneur
 * @returns {Promise<() => void>} nettoyage
 */
export async function afficher(conteneur) {
  let actif = true;
  // URL d'objets des exports, révoquées au nettoyage si le délai n'est pas écoulé
  const urlsExport = new Set();
  // État courant : noms des catégories et nombre de recettes
  let nomsCategories = [];
  let nombreRecettes = 0;

  const section = element('section', 'ecran reglages');
  const h1 = element('h1', 'titre-ecran', R.titre);
  const blocs = element('div', 'reglages__blocs');

  // --- Apparence : boutons segmentés Clair / Sombre / Système ----------------------------
  const apparence = creerBloc('apparence', R.apparence);
  const groupeTheme = element('fieldset', 'segmente');
  groupeTheme.append(element('legend', undefined, R.theme));
  const optionsTheme = element('div', 'segmente__options');
  const themeActuel = lireTheme();
  for (const theme of THEMES) {
    const option = element('label', 'segmente__option');
    const radio = element('input');
    radio.type = 'radio';
    radio.name = 'theme';
    radio.value = theme;
    radio.checked = theme === themeActuel;
    radio.addEventListener('change', () => {
      if (!radio.checked) return;
      appliquerTheme(theme);
      memoriserTheme(theme);
    });
    option.append(radio, element('span', undefined, R.themes[theme]));
    optionsTheme.append(option);
  }
  const aideTheme = element('p', 'champ__aide', R.themeAide);
  aideTheme.id = 'reglages-theme-aide';
  groupeTheme.setAttribute('aria-describedby', aideTheme.id);
  groupeTheme.append(optionsTheme);
  apparence.bloc.append(groupeTheme, aideTheme);

  // --- Catégories : liste avec nombre de recettes, renommage en ligne, création ------------
  const categories = creerBloc('categories', R.categories);
  const listeCategories = element('ul', 'reglages__categories');
  listeCategories.setAttribute('role', 'list');
  const aucuneCategorie = element('p', 'texte-doux', R.aucuneCategorie);
  // Consigne du renommage, lue avec le champ (aria-describedby)
  const aideRenommage = element('span', 'visuellement-cache', R.renommerAide);
  aideRenommage.id = 'reglages-renommer-aide';

  const creation = element('form', 'reglages__creation');
  creation.noValidate = true;
  const champCreation = element('div', 'champ reglages__creation-champ');
  const saisieCreation = element('input', 'champ__saisie');
  saisieCreation.id = 'reglages-nouvelle-categorie';
  saisieCreation.type = 'text';
  saisieCreation.autocomplete = 'off';
  saisieCreation.enterKeyHint = 'done';
  saisieCreation.placeholder = R.nouvelleCategorieIndication;
  const libelleCreation = element('label', 'champ__libelle', R.nouvelleCategorie);
  libelleCreation.htmlFor = saisieCreation.id;
  const erreurCreation = element('p', 'champ__erreur');
  erreurCreation.id = 'reglages-nouvelle-categorie-erreur';
  erreurCreation.hidden = true;
  champCreation.append(libelleCreation, saisieCreation, erreurCreation);
  const boutonCreer = element('button', 'bouton bouton--secondaire', R.creer);
  boutonCreer.type = 'submit';
  creation.append(champCreation, boutonCreer);
  categories.bloc.append(listeCategories, aucuneCategorie, aideRenommage, creation);

  // --- Données : export, import, effacement ------------------------------------------------
  const donnees = creerBloc('donnees', R.donnees);
  const actionsDonnees = element('div', 'reglages__actions');
  const boutonExporter = boutonAvecIcone('bouton bouton--principal', 'telecharger', R.exporter);

  // Le champ fichier, visuellement caché, est habillé par son libellé en forme de bouton
  const libelleImport = element('label', 'bouton reglages__import');
  libelleImport.append(icone('importer', { taille: 20 }));
  const saisieImport = element('input', 'visuellement-cache');
  saisieImport.type = 'file';
  saisieImport.accept = '.json,application/json';
  const aideImport = element('p', 'champ__aide', R.importerAide);
  aideImport.id = 'reglages-import-aide';
  saisieImport.setAttribute('aria-describedby', aideImport.id);
  libelleImport.append(element('span', undefined, R.importer), saisieImport);

  const boutonEffacer = element('button', 'bouton reglages__effacer', R.toutEffacer);
  boutonEffacer.type = 'button';
  actionsDonnees.append(boutonExporter, libelleImport, aideImport, boutonEffacer);
  donnees.bloc.append(element('p', 'texte-doux', R.donneesAide), actionsDonnees);

  // --- À propos ---------------------------------------------------------------------------
  const aPropos = creerBloc('a-propos', R.aPropos);
  const infos = element('dl', 'reglages__infos');
  const ajouterInfo = (libelle, valeur = '') => {
    const ligne = element('div', 'reglages__info');
    const dd = element('dd', undefined, valeur);
    ligne.append(element('dt', undefined, libelle), dd);
    infos.append(ligne);
    return dd;
  };
  ajouterInfo(R.version, VERSION);
  const espaceUtilise = ajouterInfo(R.espaceUtilise);
  const espaceDisponible = ajouterInfo(R.espaceDisponible);
  const persistance = ajouterInfo(R.persistance);
  aPropos.bloc.append(infos);

  // Deux colonnes indépendantes à partir de 1024 px (empilées en dessous), sans vide sous
  // un bloc court ; l'ordre de lecture reste celui de l'affichage mobile.
  const colonneGauche = element('div', 'reglages__colonne');
  colonneGauche.append(apparence.bloc, categories.bloc);
  const colonneDroite = element('div', 'reglages__colonne');
  colonneDroite.append(donnees.bloc, aPropos.bloc);
  blocs.append(colonneGauche, colonneDroite);
  section.append(h1, blocs);

  // -------------------------------------------------------------------------------------
  // Catégories
  // -------------------------------------------------------------------------------------

  /** Relit catégories et recettes, puis reconstruit la liste. */
  async function rafraichirCategories() {
    let noms;
    let recettes;
    try {
      [noms, recettes] = await Promise.all([listerCategories(), listerRecettes()]);
    } catch (erreur) {
      signalerErreur(erreur);
      return;
    }
    if (!actif) return;
    nomsCategories = noms;
    nombreRecettes = recettes.length;
    const comptes = new Map();
    for (const recette of recettes) {
      for (const nom of new Set(recette.categories ?? [])) comptes.set(nom, (comptes.get(nom) ?? 0) + 1);
    }
    listeCategories.replaceChildren(...noms.map((nom) => creerLigneCategorie(nom, comptes.get(nom) ?? 0)));
    listeCategories.hidden = noms.length === 0;
    aucuneCategorie.hidden = noms.length > 0;
  }

  /** Donne le focus à un bouton de la ligne d'une catégorie (après reconstruction). */
  function focaliserLigne(nom, action) {
    const ligne = [...listeCategories.children].find((li) => li.dataset.nom === nom);
    const bouton = ligne?.querySelector(`[data-action="${action}"]`);
    if (bouton) bouton.focus();
    else categories.h2.focus();
  }

  /** Ligne d'une catégorie : nom, nombre de recettes, Renommer, Supprimer. */
  function creerLigneCategorie(nom, nombre) {
    const ligne = element('li', 'reglages__categorie');
    ligne.dataset.nom = nom;
    const textes = element('div', 'reglages__categorie-textes');
    const libelle = element('span', 'reglages__categorie-nom', nom);
    textes.append(libelle, element('span', 'reglages__categorie-nombre', R.nombreRecettes(nombre)));
    const renommer = boutonIcone('crayon', R.renommer(nom));
    renommer.dataset.action = 'renommer';
    const supprimer = boutonIcone('poubelle', R.supprimer(nom));
    supprimer.dataset.action = 'supprimer';
    ligne.append(textes, renommer, supprimer);

    renommer.addEventListener('click', () => commencerRenommage(ligne, libelle, nom));
    supprimer.addEventListener('click', () => demanderSuppression(nom, nombre));
    return ligne;
  }

  /** Remplace le nom par un champ : Entrée (ou sortie du champ) valide, Échap annule. */
  function commencerRenommage(ligne, libelle, nom) {
    const saisie = element('input', 'champ__saisie reglages__renommer');
    saisie.type = 'text';
    saisie.value = nom;
    saisie.autocomplete = 'off';
    saisie.enterKeyHint = 'done';
    saisie.setAttribute('aria-label', R.nouveauNom(nom));
    saisie.setAttribute('aria-describedby', aideRenommage.id);
    libelle.replaceWith(saisie);
    ligne.classList.add('reglages__categorie--edition');
    saisie.focus();
    saisie.select();

    let termine = false;
    const terminer = async (valider, garderFocus) => {
      if (termine) return;
      termine = true;
      const nouveau = saisie.value.trim();
      if (!valider || nouveau === '' || nouveau === nom) {
        saisie.replaceWith(libelle);
        ligne.classList.remove('reglages__categorie--edition');
        if (garderFocus) focaliserLigne(nom, 'renommer');
        return;
      }
      const fusion = nomsCategories.includes(nouveau);
      try {
        await renommerCategorie(nom, nouveau);
        afficherToast(fusion ? R.categoriesFusionnees(nom, nouveau) : R.categorieRenommee(nom, nouveau));
      } catch (erreur) {
        signalerErreur(erreur);
      }
      await rafraichirCategories();
      if (actif && garderFocus) focaliserLigne(nouveau, 'renommer');
    };
    saisie.addEventListener('keydown', (evenement) => {
      if (evenement.key === 'Enter') {
        evenement.preventDefault();
        terminer(true, true);
      } else if (evenement.key === 'Escape') {
        evenement.preventDefault();
        terminer(false, true);
      }
    });
    saisie.addEventListener('blur', () => terminer(true, false));
  }

  /** Confirmation de suppression, avec le nombre de recettes concernées. */
  async function demanderSuppression(nom, nombre) {
    const choix = await ouvrirDialogue(section, {
      titre: R.supprimerCategorieTitre(nom),
      contenu: [element('p', undefined, R.supprimerCategorieTexte(nombre))],
      boutons: [
        { texte: R.annuler, valeur: 'annuler' },
        { texte: T.fiche.confirmerSuppression, valeur: 'supprimer', classe: 'bouton--danger' },
      ],
    });
    if (choix !== 'supprimer' || !actif) return;
    try {
      await supprimerCategorie(nom);
      afficherToast(R.categorieSupprimee(nom));
    } catch (erreur) {
      signalerErreur(erreur);
    }
    await rafraichirCategories();
    // La ligne a disparu : le focus revient au titre du bloc
    if (actif) categories.h2.focus();
  }

  /** Erreur affichée sous le champ de création (vide pour l'effacer). */
  function erreurDeCreation(message) {
    erreurCreation.textContent = message;
    erreurCreation.hidden = !message;
    if (message) {
      saisieCreation.setAttribute('aria-invalid', 'true');
      saisieCreation.setAttribute('aria-describedby', erreurCreation.id);
    } else {
      saisieCreation.removeAttribute('aria-invalid');
      saisieCreation.removeAttribute('aria-describedby');
    }
  }

  creation.addEventListener('submit', async (evenement) => {
    evenement.preventDefault();
    const nom = saisieCreation.value.trim();
    if (nom === '') {
      erreurDeCreation(T.stockage.categorieVide);
      saisieCreation.focus();
      return;
    }
    if (nomsCategories.includes(nom)) {
      erreurDeCreation(R.categorieExiste(nom));
      saisieCreation.focus();
      return;
    }
    erreurDeCreation('');
    try {
      await enregistrerCategorie(nom);
      saisieCreation.value = '';
      afficherToast(R.categorieCreee(nom));
    } catch (erreur) {
      signalerErreur(erreur);
    }
    await rafraichirCategories();
  });
  saisieCreation.addEventListener('input', () => {
    if (!erreurCreation.hidden) erreurDeCreation('');
  });

  // -------------------------------------------------------------------------------------
  // Données
  // -------------------------------------------------------------------------------------

  boutonExporter.addEventListener('click', async () => {
    boutonExporter.disabled = true;
    try {
      const contenu = await toutExporter();
      const fichier = new Blob([JSON.stringify(contenu, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(fichier);
      const lien = element('a');
      lien.href = url;
      lien.download = nomFichierExport();
      lien.hidden = true;
      document.body.append(lien);
      lien.click();
      lien.remove();
      // Le téléchargement démarre de façon asynchrone : on garde l'URL quelques instants
      urlsExport.add(url);
      setTimeout(() => {
        URL.revokeObjectURL(url);
        urlsExport.delete(url);
      }, 10_000);
      afficherToast(R.exportees(contenu.recettes.length));
    } catch (erreur) {
      signalerErreur(erreur);
    } finally {
      boutonExporter.disabled = false;
    }
  });

  saisieImport.addEventListener('change', async () => {
    const fichier = saisieImport.files?.[0];
    // Remis à zéro : choisir de nouveau le même fichier déclenchera « change »
    saisieImport.value = '';
    if (!fichier) return;

    let contenu;
    try {
      contenu = JSON.parse(await fichier.text());
    } catch {
      afficherToast(R.fichierIllisible, { erreur: true });
      return;
    }
    const analyse = analyserImport(contenu);
    if (analyse.erreur) {
      afficherToast(analyse.erreur === 'version' ? T.stockage.versionImport : T.stockage.importInvalide, { erreur: true });
      return;
    }
    let presentes = 0;
    try {
      const ids = new Set((await listerRecettes()).map((recette) => recette.id));
      presentes = analyse.recettes.filter((recette) => ids.has(recette.id)).length;
    } catch (erreur) {
      signalerErreur(erreur);
      return;
    }
    if (!actif) return;

    const choix = await ouvrirDialogue(section, {
      titre: R.importTitre,
      contenu: contenuResumeImport(analyse, presentes),
      boutons: analyse.recettes.length > 0
        ? [
          { texte: R.annuler, valeur: 'annuler' },
          { texte: R.remplacer, valeur: 'remplacer', classe: 'bouton--danger' },
          { texte: R.fusionner, valeur: 'fusionner', classe: 'bouton--principal' },
        ]
        : [{ texte: R.fermer, valeur: 'annuler' }],
    });
    if ((choix !== 'fusionner' && choix !== 'remplacer') || !actif) return;
    try {
      const bilan = await toutImporter(contenu, { mode: choix });
      afficherToast(R.importees(bilan.importees, bilan.ignorees));
    } catch (erreur) {
      signalerErreur(erreur);
    }
    await rafraichir();
  });

  boutonEffacer.addEventListener('click', async () => {
    const premier = await ouvrirDialogue(section, {
      titre: R.effacerTitre,
      contenu: [element('p', undefined, R.effacerTexte(nombreRecettes))],
      boutons: [
        { texte: R.annuler, valeur: 'annuler' },
        { texte: R.continuer, valeur: 'continuer', classe: 'bouton--danger' },
      ],
    });
    if (premier !== 'continuer' || !actif) return;

    // Seconde confirmation : le bouton ne s'active qu'une fois « EFFACER » tapé
    const saisie = element('input', 'champ__saisie');
    saisie.id = 'reglages-effacer-saisie';
    saisie.type = 'text';
    saisie.autocomplete = 'off';
    saisie.spellcheck = false;
    saisie.setAttribute('autocapitalize', 'characters');
    saisie.enterKeyHint = 'done';
    const libelle = element('label', 'champ__libelle', R.effacerSaisie);
    libelle.htmlFor = saisie.id;
    const champ = element('div', 'champ');
    champ.append(libelle, saisie);
    const second = await ouvrirDialogue(section, {
      titre: R.effacerConfirmationTitre,
      contenu: [element('p', undefined, R.effacerConfirmationTexte), champ],
      boutons: [
        { texte: R.annuler, valeur: 'annuler' },
        { texte: R.effacerDefinitivement, valeur: 'effacer', classe: 'bouton--danger' },
      ],
      preparer: (_corps, boutons) => {
        const confirmer = boutons.effacer;
        confirmer.disabled = true;
        saisie.addEventListener('input', () => {
          confirmer.disabled = saisie.value.trim() !== R.motConfirmation;
        });
        // Le champ est l'étape attendue : il reçoit le focus (sans risque, rien n'est effacé)
        boutons.annuler.autofocus = false;
        saisie.autofocus = true;
      },
    });
    if (second !== 'effacer' || saisie.value.trim() !== R.motConfirmation || !actif) return;
    try {
      await toutEffacer();
      afficherToast(R.toutEfface);
    } catch (erreur) {
      signalerErreur(erreur);
    }
    await rafraichir();
  });

  // -------------------------------------------------------------------------------------
  // À propos : espace de stockage et persistance
  // -------------------------------------------------------------------------------------

  async function rafraichirAPropos() {
    const stockage = globalThis.navigator?.storage;
    let estimation = null;
    let persiste = null;
    try {
      estimation = await stockage?.estimate?.();
    } catch {
      // Estimation indisponible (navigateur ancien, contexte non sécurisé)
    }
    try {
      persiste = await stockage?.persisted?.();
    } catch {
      // Information indisponible
    }
    if (!actif) return;
    const { usage, quota } = estimation ?? {};
    espaceUtilise.textContent = Number.isFinite(usage) ? formaterMo(usage) : R.espaceInconnu;
    espaceDisponible.textContent = Number.isFinite(usage) && Number.isFinite(quota)
      ? formaterMo(Math.max(0, quota - usage))
      : R.espaceInconnu;
    persistance.textContent = persiste === true ? R.persistanceAccordee : persiste === false ? R.persistanceRefusee : R.espaceInconnu;
  }

  /** Relit tout ce qui dépend des données (après un import ou un effacement). */
  function rafraichir() {
    return Promise.all([rafraichirCategories(), rafraichirAPropos()]);
  }

  await rafraichir();
  conteneur.append(section);

  return () => {
    actif = false;
    for (const dialogue of section.querySelectorAll('dialog[open]')) dialogue.close();
    for (const url of urlsExport) URL.revokeObjectURL(url);
    urlsExport.clear();
  };
}

/** Contenu du résumé d'import : nombre de recettes, recettes invalides, explication des modes. */
function contenuResumeImport(analyse, presentes) {
  const contenu = [];
  const nombre = analyse.recettes.length;
  contenu.push(element('p', 'reglages__resume', nombre > 0 ? R.importResume(nombre, presentes) : R.importAucune));
  if (analyse.invalides.length > 0) {
    contenu.push(element('p', undefined, R.importInvalides(analyse.invalides.length)));
    const liste = element('ul', 'reglages__invalides');
    for (const { position, titre, erreurs } of analyse.invalides) {
      const ligne = element('li');
      ligne.append(
        element('strong', undefined, titre ? R.recetteInvalide(position, titre) : R.recetteSansTitre(position)),
        element('span', 'texte-doux', ` — ${erreurs.join(' ')}`),
      );
      liste.append(ligne);
    }
    contenu.push(liste);
  }
  if (nombre > 0) {
    contenu.push(element('p', 'champ__aide', R.fusionnerAide), element('p', 'champ__aide', R.remplacerAide));
  }
  return contenu;
}
