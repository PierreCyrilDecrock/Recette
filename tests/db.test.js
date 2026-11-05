// Tests de l'accès aux données (js/db.js) et des recettes d'exemple (js/exemples.js),
// avec une implémentation d'IndexedDB en mémoire (fake-indexeddb).

import 'fake-indexeddb/auto';
import { describe, test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import {
  ouvrir,
  fermer,
  listerRecettes,
  lireRecette,
  enregistrerRecette,
  supprimerRecette,
  basculerFavori,
  listerCategories,
  enregistrerCategorie,
  renommerCategorie,
  supprimerCategorie,
  lireReglage,
  cleBrouillon,
  ecrireReglage,
  demanderPersistance,
  toutExporter,
  toutImporter,
  toutEffacer,
  ErreurStockage,
  ErreurValidation,
} from '../js/db.js';
import { EXEMPLES, chargerExemples } from '../js/exemples.js';
import { creerRecette, validerRecette, normaliser } from '../js/modele.js';
import { T } from '../js/textes.js';

// navigator.storage n'existe pas sous Node : on simule persist() en comptant les appels
let appelsPersist = 0;
Object.defineProperty(globalThis.navigator, 'storage', {
  configurable: true,
  value: { persist: async () => { appelsPersist += 1; return true; } },
});

/** Recette valide minimale. */
const recette = (surcharge = {}) => creerRecette({
  titre: 'Tarte aux poireaux',
  ingredients: [{ quantite: 3, unite: 'pièce', nom: 'poireaux' }],
  etapes: [{ texte: 'Faire fondre les poireaux.' }],
  ...surcharge,
});

/** Attend la milliseconde suivante, pour que deux dates ISO diffèrent. */
const tic = () => new Promise((resoudre) => setTimeout(resoudre, 2));

/** Vérifie qu'une promesse échoue avec une ErreurStockage du code attendu. */
const echoueAvec = (promesse, code) => assert.rejects(promesse, (erreur) => {
  assert.ok(erreur instanceof ErreurStockage, `ErreurStockage attendue, reçu ${erreur}`);
  assert.equal(erreur.code, code);
  return true;
});

beforeEach(() => toutEffacer());

// ---------------------------------------------------------------------------
describe('ouverture', () => {
  test('crée les magasins et les index, et réutilise la connexion', async () => {
    const db = await ouvrir();
    assert.equal(db.name, 'recette');
    assert.equal(db.version, 1);
    assert.deepEqual([...db.objectStoreNames].sort(), ['categories', 'recettes', 'reglages']);
    const tx = db.transaction('recettes');
    assert.deepEqual([...tx.objectStore('recettes').indexNames].sort(), ['dateModification', 'favori']);
    assert.equal(await ouvrir(), db);
  });

  test('rouvre la base après fermeture, sans perte', async () => {
    await enregistrerRecette(recette({ id: 'a' }));
    await fermer();
    assert.equal((await lireRecette('a')).titre, 'Tarte aux poireaux');
  });

  test('IndexedDB absent : erreur « indisponible » avec un message lisible', async () => {
    await fermer();
    const fabrique = globalThis.indexedDB;
    delete globalThis.indexedDB;
    try {
      await echoueAvec(ouvrir(), 'indisponible');
      await assert.rejects(listerRecettes(), { message: T.stockage.indisponible });
    } finally {
      globalThis.indexedDB = fabrique;
    }
    assert.deepEqual(await listerRecettes(), []); // la connexion se rétablit ensuite
  });
});

// ---------------------------------------------------------------------------
describe('recettes : CRUD', () => {
  test('enregistrer puis lire restitue la recette', async () => {
    const r = recette({ categories: ['Plat'], tempsCuisson: 35, notes: 'Bonne' });
    const enregistree = await enregistrerRecette(r);
    assert.deepEqual(await lireRecette(r.id), enregistree);
    assert.deepEqual({ ...enregistree, dateModification: r.dateModification }, r);
  });

  test('met à jour dateModification, sans toucher dateCreation', async () => {
    const r = recette({ dateCreation: '2025-01-01T00:00:00.000Z', dateModification: '2025-01-01T00:00:00.000Z' });
    const enregistree = await enregistrerRecette(r);
    assert.ok(enregistree.dateModification > '2025-01-01T00:00:00.000Z');
    assert.equal(enregistree.dateCreation, '2025-01-01T00:00:00.000Z');
    assert.equal(r.dateModification, '2025-01-01T00:00:00.000Z', 'la recette reçue est inchangée');
  });

  test('modifier remplace la recette existante', async () => {
    const r = await enregistrerRecette(recette());
    await enregistrerRecette({ ...r, titre: 'Tarte aux poireaux et lardons' });
    const liste = await listerRecettes();
    assert.equal(liste.length, 1);
    assert.equal(liste[0].titre, 'Tarte aux poireaux et lardons');
  });

  test('lister : la plus récemment modifiée d’abord', async () => {
    const a = await enregistrerRecette(recette({ titre: 'A' }));
    await tic();
    await enregistrerRecette(recette({ titre: 'B' }));
    await tic();
    await enregistrerRecette({ ...a, titre: 'A modifiée' });
    assert.deepEqual((await listerRecettes()).map((r) => r.titre), ['A modifiée', 'B']);
  });

  test('refuse une recette invalide sans rien écrire', async () => {
    const r = recette({ titre: '  ', ingredients: [] });
    await assert.rejects(enregistrerRecette(r), (erreur) => {
      assert.ok(erreur instanceof ErreurValidation);
      assert.equal(erreur.message, T.stockage.recetteInvalide);
      assert.equal(erreur.erreurs.titre, T.validation.titreObligatoire);
      assert.equal(erreur.erreurs.ingredients, T.validation.ingredientsObligatoires);
      return true;
    });
    assert.equal(await lireRecette(r.id), null);
  });

  test('supprimer, et lire une recette absente', async () => {
    const r = await enregistrerRecette(recette());
    await supprimerRecette(r.id);
    assert.equal(await lireRecette(r.id), null);
    await supprimerRecette('inconnue'); // sans effet ni erreur
    assert.equal(await lireRecette(''), null);
    assert.deepEqual(await listerRecettes(), []);
  });

  test('basculerFavori inverse l’état et alimente l’index favori', async () => {
    const a = await enregistrerRecette(recette({ titre: 'A' }));
    await enregistrerRecette(recette({ titre: 'B' }));
    assert.equal(await basculerFavori(a.id), true);
    assert.equal((await lireRecette(a.id)).favori, true);
    assert.deepEqual((await listerRecettes({ favoris: true })).map((r) => r.titre), ['A']);
    assert.equal(await basculerFavori(a.id), false);
    assert.deepEqual(await listerRecettes({ favoris: true }), []);
    await echoueAvec(basculerFavori('inconnue'), 'recetteInconnue');
  });

  test('le champ technique de l’index favori n’est jamais renvoyé', async () => {
    const r = await enregistrerRecette(recette({ favori: true }));
    assert.equal('indexFavori' in r, false);
    assert.equal('indexFavori' in (await lireRecette(r.id)), false);
    assert.equal('indexFavori' in (await listerRecettes())[0], false);
    assert.equal('indexFavori' in (await toutExporter()).recettes[0], false);
  });

  test('quota dépassé : message lisible, rien n’est écrit', async () => {
    const origine = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function () {
      throw new DOMException('plein', 'QuotaExceededError');
    };
    try {
      const r = recette();
      await assert.rejects(enregistrerRecette(r), { code: 'QuotaExceededError', message: T.stockage.quota });
    } finally {
      IDBObjectStore.prototype.put = origine;
    }
    assert.deepEqual(await listerRecettes(), []);
  });
});

// ---------------------------------------------------------------------------
describe('catégories', () => {
  test('une catégorie inconnue est créée à l’enregistrement de la recette', async () => {
    await enregistrerRecette(recette({ categories: ['Plat', ' Végétarien ', 'Plat'] }));
    assert.deepEqual(await listerCategories(), ['Plat', 'Végétarien']);
    const [r] = await listerRecettes();
    assert.deepEqual(r.categories, ['Plat', 'Végétarien']);
  });

  test('enregistrer et lister, dans l’ordre alphabétique français', async () => {
    assert.equal(await enregistrerCategorie('  Plat '), 'Plat');
    await enregistrerCategorie('Entrée');
    await enregistrerCategorie('dessert');
    await enregistrerCategorie('Plat'); // déjà présente : sans effet
    assert.deepEqual(await listerCategories(), ['dessert', 'Entrée', 'Plat']);
    await echoueAvec(enregistrerCategorie('   '), 'categorieVide');
  });

  test('renommer répercute le changement sur toutes les recettes', async () => {
    const a = await enregistrerRecette(recette({ titre: 'A', categories: ['Plat', 'Rapide'] }));
    const b = await enregistrerRecette(recette({ titre: 'B', categories: ['Plat'] }));
    const c = await enregistrerRecette(recette({ titre: 'C', categories: ['Dessert'] }));
    await tic();
    assert.equal(await renommerCategorie('Plat', 'Plat principal'), 2);
    assert.deepEqual(await listerCategories(), ['Dessert', 'Plat principal', 'Rapide']);
    assert.deepEqual((await lireRecette(a.id)).categories, ['Plat principal', 'Rapide']);
    assert.deepEqual((await lireRecette(b.id)).categories, ['Plat principal']);
    assert.deepEqual(await lireRecette(c.id), c, 'recette sans la catégorie : inchangée');
    assert.ok((await lireRecette(a.id)).dateModification > a.dateModification);
  });

  test('renommer vers une catégorie existante fusionne les deux', async () => {
    const a = await enregistrerRecette(recette({ categories: ['Plats', 'Plat'] }));
    await renommerCategorie('Plats', 'Plat');
    assert.deepEqual(await listerCategories(), ['Plat']);
    assert.deepEqual((await lireRecette(a.id)).categories, ['Plat']);
  });

  test('renommer : erreurs sans aucune modification', async () => {
    const a = await enregistrerRecette(recette({ categories: ['Plat'] }));
    await echoueAvec(renommerCategorie('Inconnue', 'Autre'), 'categorieInconnue');
    await echoueAvec(renommerCategorie('Plat', '  '), 'categorieVide');
    assert.equal(await renommerCategorie('Plat', 'Plat'), 0);
    assert.deepEqual(await listerCategories(), ['Plat']);
    assert.deepEqual(await lireRecette(a.id), a);
  });

  test('supprimer retire la catégorie de toutes les recettes', async () => {
    const a = await enregistrerRecette(recette({ titre: 'A', categories: ['Plat', 'Rapide'] }));
    const b = await enregistrerRecette(recette({ titre: 'B', categories: ['Rapide'] }));
    assert.equal(await supprimerCategorie('Rapide'), 2);
    assert.deepEqual(await listerCategories(), ['Plat']);
    assert.deepEqual((await lireRecette(a.id)).categories, ['Plat']);
    assert.deepEqual((await lireRecette(b.id)).categories, []);
    assert.equal(await supprimerCategorie('Inconnue'), 0);
  });
});

// ---------------------------------------------------------------------------
describe('réglages et persistance', () => {
  test('lire avec valeur par défaut, écrire, supprimer', async () => {
    assert.equal(await lireReglage('theme', 'systeme'), 'systeme');
    assert.equal(await lireReglage('theme'), undefined);
    await ecrireReglage('theme', 'sombre');
    assert.equal(await lireReglage('theme', 'systeme'), 'sombre');
    await ecrireReglage('tri', { critere: 'titre' });
    assert.deepEqual(await lireReglage('tri'), { critere: 'titre' });
    await ecrireReglage('theme', undefined);
    assert.equal(await lireReglage('theme', 'systeme'), 'systeme');
  });

  test('persist() est demandé une seule fois et son résultat mémorisé', async () => {
    await enregistrerRecette(recette());
    await enregistrerRecette(recette());
    const resultat = await demanderPersistance();
    assert.equal(appelsPersist, 1);
    assert.equal(resultat.accordee, true);
    assert.deepEqual(await lireReglage('persistance'), resultat);
    // Conservé par toutEffacer() : pas de nouvelle demande ensuite
    await toutEffacer();
    await enregistrerRecette(recette());
    await demanderPersistance();
    assert.equal(appelsPersist, 1);
    assert.deepEqual(await lireReglage('persistance'), resultat);
  });
});

// ---------------------------------------------------------------------------
describe('export, effacement, import', () => {
  /** Prépare un jeu de données varié : exemples, favori, catégorie vide, réglages. */
  async function preparer() {
    await chargerExemples();
    await basculerFavori('exemple-creme-brulee');
    await enregistrerCategorie('Apéritif');
    await ecrireReglage('theme', 'sombre');
    await ecrireReglage('tri', 'titre');
  }

  /** Photographie complète de la base. */
  const etat = async () => ({
    recettes: await listerRecettes(),
    favoris: (await listerRecettes({ favoris: true })).map((r) => r.id),
    categories: await listerCategories(),
    theme: await lireReglage('theme'),
    tri: await lireReglage('tri'),
  });

  test('aller-retour export → effacement → import : données identiques', async () => {
    await preparer();
    const avant = await etat();
    // Passage par du texte JSON, comme un vrai fichier
    const fichier = JSON.parse(JSON.stringify(await toutExporter()));
    assert.equal(fichier.application, 'recette');
    assert.equal(fichier.version, 1);
    assert.equal(fichier.recettes.length, EXEMPLES.length);
    assert.equal('persistance' in fichier.reglages, false);

    await toutEffacer();
    assert.deepEqual(await etat(), { recettes: [], favoris: [], categories: [], theme: undefined, tri: undefined });

    const bilan = await toutImporter(fichier, { mode: 'remplacer' });
    assert.deepEqual(bilan, { importees: EXEMPLES.length, ignorees: 0, invalides: 0 });
    assert.deepEqual(await etat(), avant);
    assert.deepEqual(
      { ...(await toutExporter()), dateExport: fichier.dateExport },
      fichier,
      'un nouvel export est identique au premier',
    );
  });

  test('remplacer efface d’abord les recettes et catégories existantes', async () => {
    await preparer();
    const fichier = await toutExporter();
    await toutEffacer();
    await enregistrerRecette(recette({ titre: 'Locale', categories: ['Locale'] }));
    await toutImporter(fichier, { mode: 'remplacer' });
    const recettes = await listerRecettes();
    assert.equal(recettes.length, EXEMPLES.length);
    assert.ok(!recettes.some((r) => r.titre === 'Locale'));
    assert.ok(!(await listerCategories()).includes('Locale'));
  });

  test('fusionner garde la version la plus récente de chaque recette', async () => {
    const ancienne = await enregistrerRecette(recette({ id: 'r1', titre: 'Version locale' }));
    const autre = await enregistrerRecette(recette({ id: 'r2', titre: 'Locale récente' }));
    await ecrireReglage('theme', 'clair');
    const fichier = {
      recettes: [
        { ...ancienne, titre: 'Version importée', dateModification: '2099-01-01T00:00:00.000Z' },
        { ...autre, titre: 'Importée ancienne', dateModification: '2000-01-01T00:00:00.000Z' },
        recette({ id: 'r3', titre: 'Nouvelle', categories: ['Importée'] }),
      ],
      reglages: { theme: 'sombre', tri: 'temps' },
    };
    const bilan = await toutImporter(fichier); // mode « fusionner » par défaut
    assert.deepEqual(bilan, { importees: 2, ignorees: 1, invalides: 0 });
    assert.equal((await lireRecette('r1')).titre, 'Version importée');
    assert.equal((await lireRecette('r2')).titre, 'Locale récente');
    assert.equal((await lireRecette('r3')).titre, 'Nouvelle');
    assert.deepEqual(await listerCategories(), ['Importée']);
    assert.equal(await lireReglage('theme'), 'clair', 'un réglage local n’est pas écrasé');
    assert.equal(await lireReglage('tri'), 'temps');
  });

  test('recettes invalides ignorées, liste simple acceptée, valeurs par défaut complétées', async () => {
    const bilan = await toutImporter([
      { id: 'ok', titre: 'Minimale', ingredients: [{ nom: 'sel' }], etapes: [{ texte: 'Saler.' }] },
      { id: 'ko', titre: '', ingredients: [], etapes: [] },
      null,
    ]);
    assert.deepEqual(bilan, { importees: 1, ignorees: 0, invalides: 2 });
    const r = await lireRecette('ok');
    assert.equal(r.portions, 4);
    assert.equal(r.difficulte, 'facile');
    assert.equal(validerRecette(r).valide, true);
  });

  test('fichier ou mode invalides : erreur, rien n’est modifié', async () => {
    await enregistrerRecette(recette({ id: 'garde' }));
    await echoueAvec(toutImporter({ bonjour: 1 }), 'importInvalide');
    await echoueAvec(toutImporter(null), 'importInvalide');
    await echoueAvec(toutImporter({ recettes: [] }, { mode: 'ecraser' }), 'modeImport');
    assert.equal((await listerRecettes()).length, 1);
  });

  test('les photos (Blob) sont exportées en data URL, réimportables', async () => {
    const photo = new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xe0])], { type: 'image/jpeg' });
    await enregistrerRecette(recette({ id: 'photo', photo }));
    assert.ok((await lireRecette('photo')).photo instanceof Blob);
    const fichier = JSON.parse(JSON.stringify(await toutExporter()));
    assert.equal(fichier.recettes[0].photo, 'data:image/jpeg;base64,/9j/4A==');
    await toutEffacer();
    await toutImporter(fichier);
    assert.equal((await lireRecette('photo')).photo, 'data:image/jpeg;base64,/9j/4A==');
  });

  test('toutEffacer vide recettes, catégories et réglages', async () => {
    await preparer();
    await toutEffacer();
    assert.deepEqual(await listerRecettes(), []);
    assert.deepEqual(await listerCategories(), []);
    assert.equal(await lireReglage('theme'), undefined);
  });
});

// ---------------------------------------------------------------------------
describe('recettes d’exemple', () => {
  test('six recettes valides, dont la tarte aux poireaux du cahier', () => {
    assert.equal(EXEMPLES.length, 6);
    for (const donnees of EXEMPLES) {
      const { valide, erreurs } = validerRecette(creerRecette(donnees));
      assert.ok(valide, `${donnees.titre} : ${JSON.stringify(erreurs)}`);
    }
    const tarte = EXEMPLES.find((r) => r.titre === 'Tarte aux poireaux');
    assert.ok(tarte);
    assert.deepEqual(tarte.ingredients[1], { quantite: 3, unite: 'pièce', nom: 'poireaux', precision: 'émincés' });
    assert.equal(tarte.portions, 6);
  });

  test('variété : difficultés, catégories, repos, durées dans les étapes', () => {
    assert.deepEqual(new Set(EXEMPLES.map((r) => r.difficulte)), new Set(['facile', 'moyen', 'difficile']));
    const categories = new Set(EXEMPLES.flatMap((r) => r.categories));
    for (const c of ['Entrée', 'Plat', 'Dessert', 'Végétarien', 'Rapide']) assert.ok(categories.has(c), c);
    assert.ok(EXEMPLES.some((r) => r.tempsRepos > 0));
    const etapes = EXEMPLES.flatMap((r) => r.etapes);
    assert.ok(etapes.some((e) => /\d+ min\b/.test(e.texte)));
    // Chaque minuteur correspond à une durée écrite dans le texte de l'étape
    for (const e of etapes.filter((x) => x.minuteur)) assert.match(normaliser(e.texte), /\d+ (min|h)\b/, e.texte);
  });

  test('chargerExemples enregistre les six recettes sans doublon au second appel', async () => {
    assert.equal((await chargerExemples()).length, 6);
    assert.equal((await listerRecettes()).length, 6);
    assert.deepEqual(await listerCategories(), ['Dessert', 'Entrée', 'Plat', 'Rapide', 'Végétarien']);
    // Un exemple modifié par l'utilisateur n'est pas écrasé
    const tarte = await lireRecette('exemple-tarte-poireaux');
    await enregistrerRecette({ ...tarte, titre: 'Ma tarte' });
    assert.deepEqual(await chargerExemples(), []);
    assert.equal((await lireRecette('exemple-tarte-poireaux')).titre, 'Ma tarte');
    assert.equal((await listerRecettes()).length, 6);
  });
});

describe('brouillons du formulaire', () => {
  test('clé par recette ou pour une nouvelle recette', () => {
    assert.equal(cleBrouillon('abc'), 'brouillon:abc');
    assert.equal(cleBrouillon(), 'brouillon:nouvelle');
  });

  test('les brouillons ne sont ni exportés ni importés', async () => {
    await toutEffacer();
    await ecrireReglage(cleBrouillon(), { etat: { titre: 'En cours' } });
    await ecrireReglage('tri', 'titre');
    const fichier = await toutExporter();
    assert.deepEqual(Object.keys(fichier.reglages), ['tri']);

    await toutImporter({ recettes: [], reglages: { 'brouillon:x': { etat: {} }, theme: 'sombre' } });
    assert.equal(await lireReglage('brouillon:x'), undefined);
    assert.equal(await lireReglage('theme'), 'sombre');
    assert.deepEqual(await lireReglage(cleBrouillon()), { etat: { titre: 'En cours' } });
  });
});
