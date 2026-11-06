// Accès aux données dans IndexedDB, sans librairie.
// Base « recette », version 1, trois magasins :
// - recettes   : keyPath id ; index dateModification et favori ;
// - categories : keyPath nom, objets { nom } ;
// - reglages   : paires clé / valeur (clés hors ligne).
//
// Chaque écriture se résout seulement à la fin de sa transaction (oncomplete), avec une
// durabilité « strict » : une fois la promesse résolue, les données sont sur le disque.
// Les erreurs remontent sous forme d'ErreurStockage, avec un message de textes.js.

import { T } from './textes.js';
import { FORMAT_EXPORT, analyserImport, validerRecette } from './modele.js';

const NOM_BASE = 'recette';
const VERSION_BASE = 1;
const MAGASINS = ['recettes', 'categories', 'reglages'];

// IndexedDB n'indexe pas les booléens : l'index « favori » porte sur ce champ technique,
// présent (valeur 1) uniquement sur les recettes favorites. Il n'est jamais renvoyé.
const CHAMP_INDEX_FAVORI = 'indexFavori';

// Réglage technique : résultat de navigator.storage.persist(), conservé par toutEffacer()
const REGLAGE_PERSISTANCE = 'persistance';

/** Format des fichiers d'export (défini dans modele.js, réexporté ici). */
export { FORMAT_EXPORT };

// ---------------------------------------------------------------------------
// Erreurs
// ---------------------------------------------------------------------------

/** Erreur du stockage : message lisible (textes.js), code technique et cause d'origine. */
export class ErreurStockage extends Error {
  /**
   * @param {string} message message destiné à l'utilisateur
   * @param {{ code?: string, cause?: unknown }} [options]
   */
  constructor(message, { code = 'stockage', cause } = {}) {
    super(message, { cause });
    this.name = 'ErreurStockage';
    this.code = code;
  }
}

/** Recette refusée par validerRecette : erreurs contient { champ: message }. */
export class ErreurValidation extends ErreurStockage {
  /** @param {Object<string, string>} erreurs */
  constructor(erreurs) {
    super(T.stockage.recetteInvalide, { code: 'validation' });
    this.name = 'ErreurValidation';
    this.erreurs = erreurs;
  }
}

/** Convertit une erreur d'IndexedDB (DOMException) en ErreurStockage lisible. */
function traduireErreur(erreur) {
  if (erreur instanceof ErreurStockage) return erreur;
  const messages = {
    QuotaExceededError: T.stockage.quota,
    VersionError: T.stockage.version,
  };
  const code = erreur?.name ?? 'stockage';
  return new ErreurStockage(messages[code] ?? T.stockage.generique, { code, cause: erreur });
}

// ---------------------------------------------------------------------------
// Connexion et transactions
// ---------------------------------------------------------------------------

/** Promesse de la connexion ouverte, partagée par tous les appels. */
let connexion = null;

/** Crée les magasins et index (première ouverture). */
function migrer(db, ancienneVersion) {
  if (ancienneVersion < 1) {
    const recettes = db.createObjectStore('recettes', { keyPath: 'id' });
    recettes.createIndex('dateModification', 'dateModification');
    recettes.createIndex('favori', CHAMP_INDEX_FAVORI);
    db.createObjectStore('categories', { keyPath: 'nom' });
    db.createObjectStore('reglages');
  }
}

/**
 * Ouvre la base (une seule fois : les appels suivants réutilisent la connexion).
 * @returns {Promise<IDBDatabase>}
 * @throws {ErreurStockage} code « indisponible », « bloquee », « VersionError »…
 */
export function ouvrir() {
  if (connexion) return connexion;
  connexion = new Promise((resoudre, rejeter) => {
    const fabrique = globalThis.indexedDB;
    if (!fabrique) {
      rejeter(new ErreurStockage(T.stockage.indisponible, { code: 'indisponible' }));
      return;
    }
    let requete;
    try {
      requete = fabrique.open(NOM_BASE, VERSION_BASE);
    } catch (erreur) {
      rejeter(new ErreurStockage(T.stockage.indisponible, { code: 'indisponible', cause: erreur }));
      return;
    }
    let bloquee = false;
    requete.onupgradeneeded = (evenement) => migrer(requete.result, evenement.oldVersion);
    requete.onblocked = () => {
      // Un autre onglet garde une ancienne version ouverte
      bloquee = true;
      rejeter(new ErreurStockage(T.stockage.bloquee, { code: 'bloquee' }));
    };
    requete.onsuccess = () => {
      const db = requete.result;
      if (bloquee) {
        db.close(); // ouverture arrivée trop tard : on a déjà signalé l'erreur
        return;
      }
      // Une nouvelle version s'ouvre dans un autre onglet : on libère la base
      db.onversionchange = () => fermer();
      // Fermeture imposée par le navigateur (effacement des données…) : on rouvrira
      db.onclose = () => { connexion = null; };
      resoudre(db);
    };
    requete.onerror = () => rejeter(traduireErreur(requete.error));
  });
  // Après un échec, le prochain appel retente l'ouverture
  connexion.catch(() => { connexion = null; });
  return connexion;
}

/** Ferme la connexion ; le prochain accès la rouvrira. */
export async function fermer() {
  const enCours = connexion;
  connexion = null;
  if (!enCours) return;
  try {
    (await enCours).close();
  } catch {
    // L'ouverture avait échoué : rien à fermer
  }
}

/** Promesse du résultat d'une requête IndexedDB. */
function attendre(requete) {
  return new Promise((resoudre, rejeter) => {
    requete.onsuccess = () => resoudre(requete.result);
    requete.onerror = () => rejeter(requete.error);
  });
}

/**
 * Exécute un travail dans une transaction et se résout à sa fin (oncomplete), avec la
 * valeur renvoyée par le travail. Le travail reçoit les magasins par leur nom ; il ne
 * doit attendre que des requêtes IndexedDB (sinon la transaction se fermerait).
 * Si le travail échoue, la transaction est annulée : rien n'est écrit.
 * @template R
 * @param {string[]} noms magasins utilisés
 * @param {'readonly'|'readwrite'} mode
 * @param {(magasins: Object<string, IDBObjectStore>) => Promise<R>|R} travail
 * @returns {Promise<R>}
 */
async function transaction(noms, mode, travail) {
  const resultat = await executer(noms, mode, travail);
  // Recettes ou catégories modifiées : les écrans affichés peuvent se rafraîchir
  if (mode === 'readwrite' && noms.some((nom) => nom !== 'reglages')) {
    changements.dispatchEvent(new CustomEvent(EVENEMENT_CHANGEMENT, { detail: { magasins: noms } }));
  }
  return resultat;
}

/**
 * Signale chaque écriture terminée dans les magasins recettes ou categories
 * (événement EVENEMENT_CHANGEMENT, detail.magasins). La liste affichée à côté de la
 * fiche, sur grand écran, l'écoute pour rester à jour (favori, suppression, copie…).
 */
export const changements = new EventTarget();
export const EVENEMENT_CHANGEMENT = 'changement';

/** Corps de transaction() : ouvre la transaction et attend sa fin. */
async function executer(noms, mode, travail) {
  const db = await ouvrir();
  return new Promise((resoudre, rejeter) => {
    let tx;
    try {
      tx = db.transaction(noms, mode, { durability: mode === 'readwrite' ? 'strict' : 'default' });
    } catch (erreur) {
      rejeter(traduireErreur(erreur));
      return;
    }
    const magasins = Object.fromEntries(noms.map((nom) => [nom, tx.objectStore(nom)]));
    let echec = null;
    let resultat;
    try {
      resultat = Promise.resolve(travail(magasins));
    } catch (erreur) {
      resultat = Promise.reject(erreur);
    }
    resultat.catch((erreur) => {
      echec = erreur;
      try {
        tx.abort();
      } catch {
        rejeter(traduireErreur(erreur)); // transaction déjà terminée
      }
    });
    tx.oncomplete = () => resultat.then(resoudre, (erreur) => rejeter(traduireErreur(erreur)));
    tx.onabort = () => rejeter(traduireErreur(echec ?? tx.error));
  });
}

// ---------------------------------------------------------------------------
// Conversions entre recette et enregistrement stocké
// ---------------------------------------------------------------------------

/** Enregistrement stocké : la recette plus le champ technique de l'index favori. */
function versStockage(recette) {
  const { [CHAMP_INDEX_FAVORI]: _ancien, ...propre } = recette;
  return propre.favori === true ? { ...propre, [CHAMP_INDEX_FAVORI]: 1 } : propre;
}

/** Recette telle que l'app la connaît, sans champ technique. */
function depuisStockage(enregistrement) {
  if (!enregistrement) return null;
  const { [CHAMP_INDEX_FAVORI]: _index, ...recette } = enregistrement;
  return recette;
}

/** Nom de catégorie nettoyé ; lève une erreur s'il est vide. */
function nomCategorie(nom) {
  const propre = typeof nom === 'string' ? nom.trim() : '';
  if (!propre) throw new ErreurStockage(T.stockage.categorieVide, { code: 'categorieVide' });
  return propre;
}

/** Crée dans le magasin les catégories qui n'existent pas encore. */
async function creerCategoriesManquantes(magasin, noms) {
  for (const nom of new Set(noms)) {
    if ((await attendre(magasin.count(nom))) === 0) magasin.put({ nom });
  }
}

const maintenant = () => new Date().toISOString();

// ---------------------------------------------------------------------------
// Recettes
// ---------------------------------------------------------------------------

/**
 * Liste les recettes, de la plus récemment modifiée à la plus ancienne.
 * @param {{ favoris?: boolean }} [options] favoris : seulement les favorites (index favori)
 * @returns {Promise<import('./modele.js').Recette[]>}
 */
export async function listerRecettes({ favoris = false } = {}) {
  const enregistrements = await transaction(['recettes'], 'readonly', ({ recettes }) => attendre(
    favoris ? recettes.index('favori').getAll() : recettes.index('dateModification').getAll(),
  ));
  const liste = enregistrements.map(depuisStockage);
  return favoris
    ? liste.sort((a, b) => b.dateModification.localeCompare(a.dateModification))
    : liste.reverse();
}

/**
 * Lit une recette.
 * @param {string} id
 * @returns {Promise<import('./modele.js').Recette|null>} null si elle n'existe pas
 */
export async function lireRecette(id) {
  if (typeof id !== 'string' || id === '') return null;
  const enregistrement = await transaction(['recettes'], 'readonly', ({ recettes }) => attendre(recettes.get(id)));
  return depuisStockage(enregistrement);
}

/**
 * Enregistre (crée ou remplace) une recette valide. Met à jour dateModification, crée les
 * catégories inconnues et, au premier enregistrement, demande un stockage persistant.
 * @param {import('./modele.js').Recette} recette
 * @returns {Promise<import('./modele.js').Recette>} la recette telle qu'enregistrée
 * @throws {ErreurValidation} si la recette est invalide (rien n'est écrit)
 */
export async function enregistrerRecette(recette) {
  const aEnregistrer = { ...recette, dateModification: maintenant() };
  if (Array.isArray(aEnregistrer.categories)) {
    aEnregistrer.categories = [...new Set(aEnregistrer.categories.map((c) => (typeof c === 'string' ? c.trim() : c)))];
  }
  const { valide, erreurs } = validerRecette(aEnregistrer);
  if (!valide) throw new ErreurValidation(erreurs);

  await transaction(['recettes', 'categories'], 'readwrite', async ({ recettes, categories }) => {
    recettes.put(versStockage(aEnregistrer));
    await creerCategoriesManquantes(categories, aEnregistrer.categories);
  });
  // Sans attendre : persist() peut afficher une demande d'autorisation (Firefox)
  demanderPersistance().catch(() => {});
  return depuisStockage(aEnregistrer);
}

/**
 * Supprime une recette (sans effet si elle n'existe pas).
 * @param {string} id
 * @returns {Promise<void>}
 */
export async function supprimerRecette(id) {
  await transaction(['recettes'], 'readwrite', ({ recettes }) => {
    recettes.delete(id);
  });
}

/**
 * Inverse l'état favori d'une recette.
 * @param {string} id
 * @returns {Promise<boolean>} le nouvel état
 * @throws {ErreurStockage} code « recetteInconnue »
 */
export async function basculerFavori(id) {
  return transaction(['recettes'], 'readwrite', async ({ recettes }) => {
    const enregistrement = await attendre(recettes.get(id));
    if (!enregistrement) throw new ErreurStockage(T.stockage.recetteInconnue, { code: 'recetteInconnue' });
    const favori = enregistrement.favori !== true;
    recettes.put(versStockage({ ...enregistrement, favori, dateModification: maintenant() }));
    return favori;
  });
}

// ---------------------------------------------------------------------------
// Catégories
// ---------------------------------------------------------------------------

const COLLATEUR = new Intl.Collator('fr', { sensitivity: 'base', numeric: true });

/**
 * Liste les noms des catégories, dans l'ordre alphabétique français.
 * @returns {Promise<string[]>}
 */
export async function listerCategories() {
  const categories = await transaction(['categories'], 'readonly', ({ categories: c }) => attendre(c.getAll()));
  return categories.map((c) => c.nom).sort(COLLATEUR.compare);
}

/**
 * Crée une catégorie (sans effet si elle existe déjà).
 * @param {string} nom
 * @returns {Promise<string>} le nom enregistré (sans espaces aux extrémités)
 * @throws {ErreurStockage} code « categorieVide »
 */
export async function enregistrerCategorie(nom) {
  const propre = nomCategorie(nom);
  await transaction(['categories'], 'readwrite', ({ categories }) => creerCategoriesManquantes(categories, [propre]));
  return propre;
}

/**
 * Renomme une catégorie et répercute le changement sur toutes les recettes, dans une
 * seule transaction. Si le nouveau nom existe déjà, les deux catégories fusionnent.
 * @param {string} ancien
 * @param {string} nouveau
 * @returns {Promise<number>} nombre de recettes modifiées
 * @throws {ErreurStockage} codes « categorieVide », « categorieInconnue »
 */
export async function renommerCategorie(ancien, nouveau) {
  const nouveauNom = nomCategorie(nouveau);
  if (ancien === nouveauNom) return 0;
  return transaction(['recettes', 'categories'], 'readwrite', async ({ recettes, categories }) => {
    const categorie = await attendre(categories.get(ancien));
    if (!categorie) throw new ErreurStockage(T.stockage.categorieInconnue, { code: 'categorieInconnue' });
    categories.delete(ancien);
    if ((await attendre(categories.count(nouveauNom))) === 0) categories.put({ ...categorie, nom: nouveauNom });
    return modifierCategoriesDesRecettes(recettes, ancien, (liste) => liste.map((c) => (c === ancien ? nouveauNom : c)));
  });
}

/**
 * Supprime une catégorie et la retire de toutes les recettes (sans effet si elle n'existe pas).
 * @param {string} nom
 * @returns {Promise<number>} nombre de recettes modifiées
 */
export async function supprimerCategorie(nom) {
  return transaction(['recettes', 'categories'], 'readwrite', ({ recettes, categories }) => {
    categories.delete(nom);
    return modifierCategoriesDesRecettes(recettes, nom, (liste) => liste.filter((c) => c !== nom));
  });
}

/** Applique une transformation aux catégories des recettes qui contiennent « nom ». */
async function modifierCategoriesDesRecettes(recettes, nom, transformer) {
  const date = maintenant();
  let modifiees = 0;
  for (const enregistrement of await attendre(recettes.getAll())) {
    if (!enregistrement.categories?.includes(nom)) continue;
    const categories = [...new Set(transformer(enregistrement.categories))];
    recettes.put({ ...enregistrement, categories, dateModification: date });
    modifiees += 1;
  }
  return modifiees;
}

// ---------------------------------------------------------------------------
// Réglages
// ---------------------------------------------------------------------------

/**
 * Lit un réglage.
 * @param {string} cle
 * @param {*} [defaut] valeur renvoyée si le réglage n'existe pas
 * @returns {Promise<*>}
 */
export async function lireReglage(cle, defaut) {
  const valeur = await transaction(['reglages'], 'readonly', ({ reglages }) => attendre(reglages.get(cle)));
  return valeur === undefined ? defaut : valeur;
}

/**
 * Écrit un réglage ; la valeur undefined le supprime.
 * @param {string} cle
 * @param {*} valeur valeur clonable (objet, nombre, chaîne…)
 * @returns {Promise<void>}
 */
export async function ecrireReglage(cle, valeur) {
  await transaction(['reglages'], 'readwrite', ({ reglages }) => {
    if (valeur === undefined) reglages.delete(cle);
    else reglages.put(valeur, cle);
  });
}

/** Préfixe des brouillons du formulaire E3, rangés dans les réglages. */
export const PREFIXE_BROUILLON = 'brouillon:';

/**
 * Clé du brouillon d'un formulaire : « brouillon:<id> » en modification,
 * « brouillon:nouvelle » en création. Les brouillons restent sur l'appareil :
 * ils ne sont ni exportés ni importés.
 * @param {string} [id] identifiant de la recette modifiée
 * @returns {string}
 */
export function cleBrouillon(id) {
  return `${PREFIXE_BROUILLON}${id ?? 'nouvelle'}`;
}

/** Promesse de la demande de persistance, pour ne la faire qu'une fois. */
let demandePersistance = null;

/**
 * Demande au navigateur de ne pas effacer les données (navigator.storage.persist()),
 * une seule fois : le résultat est mémorisé dans le réglage « persistance ».
 * Appelée automatiquement après le premier enregistrement d'une recette.
 * @returns {Promise<{ accordee: boolean, date: string }>}
 */
export function demanderPersistance() {
  demandePersistance ??= (async () => {
    const dejaDemandee = await lireReglage(REGLAGE_PERSISTANCE);
    if (dejaDemandee) return dejaDemandee;
    let accordee = false;
    try {
      accordee = (await globalThis.navigator?.storage?.persist?.()) === true;
    } catch {
      // API absente ou refusée : les données restent, sans garantie contre l'effacement
    }
    const resultat = { accordee, date: maintenant() };
    await ecrireReglage(REGLAGE_PERSISTANCE, resultat);
    return resultat;
  })();
  demandePersistance.catch(() => { demandePersistance = null; });
  return demandePersistance;
}

// ---------------------------------------------------------------------------
// Export, import, effacement
// ---------------------------------------------------------------------------

/** Convertit un Blob en data URL (base64), pour qu'une photo passe dans un fichier JSON. */
async function blobEnDataUrl(blob) {
  const octets = new Uint8Array(await blob.arrayBuffer());
  let binaire = '';
  for (let i = 0; i < octets.length; i += 0x8000) {
    binaire += String.fromCharCode(...octets.subarray(i, i + 0x8000));
  }
  return `data:${blob.type || 'image/jpeg'};base64,${btoa(binaire)}`;
}

/**
 * Exporte recettes (photos en data URL) et catégories dans un objet sérialisable en JSON.
 * Les réglages (tri, brouillons, persistance) et le thème sont propres à l'appareil : ils
 * ne sont pas exportés.
 * @returns {Promise<{ app: string, version: number, dateExport: string,
 *   recettes: object[], categories: string[] }>}
 */
export async function toutExporter() {
  const { recettes, categories } = await transaction(['recettes', 'categories'], 'readonly', async (m) => ({
    recettes: await attendre(m.recettes.getAll()),
    categories: await attendre(m.categories.getAll()),
  }));
  // Les conversions asynchrones se font après la transaction
  const recettesExportees = [];
  for (const enregistrement of recettes) {
    const recette = depuisStockage(enregistrement);
    if (typeof Blob !== 'undefined' && recette.photo instanceof Blob) recette.photo = await blobEnDataUrl(recette.photo);
    recettesExportees.push(recette);
  }
  return {
    ...FORMAT_EXPORT,
    dateExport: maintenant(),
    recettes: recettesExportees,
    categories: categories.map((c) => c.nom).sort(COLLATEUR.compare),
  };
}

/**
 * Importe un fichier exporté (ou une simple liste de recettes), dans une seule transaction :
 * en cas d'erreur, rien n'est importé. Le fichier est d'abord analysé par analyserImport.
 * - « fusionner » (par défaut) : ajoute les recettes ; pour un id déjà présent, garde la
 *   version modifiée le plus récemment ;
 * - « remplacer » : efface d'abord recettes et catégories, puis importe tout.
 * Les recettes invalides sont ignorées et comptées. Les réglages ne sont pas touchés.
 * @param {unknown} donnees
 * @param {{ mode?: 'fusionner'|'remplacer' }} [options]
 * @returns {Promise<{ importees: number, ignorees: number, invalides: number }>}
 *   ignorees : recettes plus anciennes que la version locale (fusion)
 * @throws {ErreurStockage} codes « importInvalide », « versionImport », « modeImport »
 */
export async function toutImporter(donnees, { mode = 'fusionner' } = {}) {
  if (mode !== 'fusionner' && mode !== 'remplacer') {
    throw new ErreurStockage(T.stockage.modeImport, { code: 'modeImport' });
  }
  const analyse = analyserImport(donnees);
  if (analyse.erreur === 'version') {
    throw new ErreurStockage(T.stockage.versionImport, { code: 'versionImport' });
  }
  if (analyse.erreur) throw new ErreurStockage(T.stockage.importInvalide, { code: 'importInvalide' });

  return transaction(['recettes', 'categories'], 'readwrite', async ({ recettes, categories }) => {
    if (mode === 'remplacer') {
      recettes.clear();
      categories.clear();
    }
    let importees = 0;
    let ignorees = 0;
    for (const recette of analyse.recettes) {
      if (mode === 'fusionner') {
        const existante = await attendre(recettes.get(recette.id));
        if (existante && existante.dateModification > recette.dateModification) {
          ignorees += 1;
          continue;
        }
      }
      recettes.put(versStockage(recette));
      importees += 1;
    }
    await creerCategoriesManquantes(categories, [
      ...analyse.categories,
      ...analyse.recettes.flatMap((r) => r.categories),
    ]);
    return { importees, ignorees, invalides: analyse.invalides.length };
  });
}

/**
 * Efface recettes, catégories et réglages, dans une seule transaction. Le résultat de
 * la demande de persistance est conservé : il concerne le navigateur, pas les données.
 * @returns {Promise<void>}
 */
export async function toutEffacer() {
  await transaction(MAGASINS, 'readwrite', async ({ recettes, categories, reglages }) => {
    const persistance = await attendre(reglages.get(REGLAGE_PERSISTANCE));
    recettes.clear();
    categories.clear();
    reglages.clear();
    if (persistance !== undefined) reglages.put(persistance, REGLAGE_PERSISTANCE);
  });
}
