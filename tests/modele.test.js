// Tests unitaires de la logique métier (js/modele.js), avec node:test.
// Ces tests sont aussi les règles de cuisine de l'app : arrondis, unités, durées.

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';

import {
  ESPACE_INSECABLE as E,
  creerRecette,
  validerRecette,
  tempsTotal,
  formaterDuree,
  mettreALEchelle,
  arrondirQuantite,
  formaterQuantite,
  analyserLigneIngredient,
  normaliser,
  rechercher,
  trier,
  trouverIngredientsDansTexte,
  dupliquerRecette,
} from '../js/modele.js';
import { T } from '../js/textes.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

/** Recette valide minimale, modifiable par surcharge. */
const recetteValide = (surcharge = {}) => creerRecette({
  titre: 'Tarte aux poireaux',
  ingredients: [{ quantite: 3, unite: 'pièce', nom: 'poireaux' }],
  etapes: [{ texte: 'Faire fondre les poireaux.' }],
  ...surcharge,
});

// ---------------------------------------------------------------------------
describe('creerRecette', () => {
  test('applique les valeurs par défaut', () => {
    const r = creerRecette();
    assert.match(r.id, UUID);
    assert.equal(r.difficulte, 'facile');
    assert.equal(r.portions, 4);
    assert.equal(r.favori, false);
    assert.deepEqual(r.categories, []);
    assert.deepEqual(r.ingredients, []);
    assert.deepEqual(r.etapes, []);
    assert.equal(r.titre, '');
  });

  test('les dates sont en ISO et identiques à la création', () => {
    const avant = Date.now();
    const r = creerRecette();
    assert.equal(r.dateCreation, new Date(r.dateCreation).toISOString());
    assert.equal(r.dateCreation, r.dateModification);
    assert.ok(Date.parse(r.dateCreation) >= avant - 1);
  });

  test('les données fournies l’emportent, sauf les valeurs undefined', () => {
    const r = creerRecette({ titre: 'Crêpes', portions: 6, difficulte: undefined, tempsCuisson: 20 });
    assert.equal(r.titre, 'Crêpes');
    assert.equal(r.portions, 6);
    assert.equal(r.difficulte, 'facile');
    assert.equal(r.tempsCuisson, 20);
    assert.equal('tempsRepos' in r, false);
  });

  test('chaque recette reçoit un id différent', () => {
    const ids = new Set(Array.from({ length: 50 }, () => creerRecette().id));
    assert.equal(ids.size, 50);
  });

  test('conserve un id et des dates fournis (import)', () => {
    const r = creerRecette({ id: 'abc', dateCreation: '2025-01-01T00:00:00.000Z' });
    assert.equal(r.id, 'abc');
    assert.equal(r.dateCreation, '2025-01-01T00:00:00.000Z');
  });

  test('copie les listes : aucune référence partagée', () => {
    const donnees = { categories: ['Plat'], ingredients: [{ nom: 'sel' }], etapes: [{ texte: 'Saler.' }] };
    const r = creerRecette(donnees);
    r.categories.push('Dessert');
    r.ingredients[0].nom = 'poivre';
    r.etapes[0].texte = 'Poivrer.';
    assert.deepEqual(donnees, { categories: ['Plat'], ingredients: [{ nom: 'sel' }], etapes: [{ texte: 'Saler.' }] });
  });
});

// ---------------------------------------------------------------------------
describe('validerRecette', () => {
  const V = T.validation;

  test('une recette complète est valide', () => {
    assert.deepEqual(validerRecette(recetteValide()), { valide: true, erreurs: {} });
  });

  test('titre obligatoire après trim, 120 caractères au maximum', () => {
    assert.equal(validerRecette(recetteValide({ titre: '   ' })).erreurs.titre, V.titreObligatoire);
    assert.equal(validerRecette(recetteValide({ titre: 'a'.repeat(121) })).erreurs.titre, V.titreTropLong(120));
    assert.equal(validerRecette(recetteValide({ titre: 'a'.repeat(120) })).valide, true);
    assert.equal(validerRecette(recetteValide({ titre: `  ${'a'.repeat(120)}  ` })).valide, true);
    assert.equal(validerRecette(recetteValide({ titre: 'A' })).valide, true);
  });

  test('description : 500 caractères au maximum', () => {
    assert.equal(validerRecette(recetteValide({ description: 'a'.repeat(500) })).valide, true);
    assert.equal(
      validerRecette(recetteValide({ description: 'a'.repeat(501) })).erreurs.description,
      V.descriptionTropLongue(500),
    );
    assert.equal(validerRecette(recetteValide({ description: '' })).valide, true);
  });

  test('difficulté dans l’énumération', () => {
    for (const difficulte of ['facile', 'moyen', 'difficile']) {
      assert.equal(validerRecette(recetteValide({ difficulte })).valide, true);
    }
    assert.equal(validerRecette(recetteValide({ difficulte: 'Facile' })).erreurs.difficulte, V.difficulte);
    assert.equal(validerRecette(recetteValide({ difficulte: null })).erreurs.difficulte, V.difficulte);
  });

  test('temps : entiers facultatifs dans leurs bornes', () => {
    const ok = recetteValide({ tempsPreparation: 0, tempsCuisson: 1440, tempsRepos: 4320 });
    assert.equal(validerRecette(ok).valide, true);
    const ko = validerRecette(recetteValide({ tempsPreparation: 1441, tempsCuisson: 12.5, tempsRepos: -1 }));
    assert.equal(ko.erreurs.tempsPreparation, V.temps(1440));
    assert.equal(ko.erreurs.tempsCuisson, V.temps(1440));
    assert.equal(ko.erreurs.tempsRepos, V.temps(4320));
    assert.equal(validerRecette(recetteValide({ tempsRepos: 4321 })).erreurs.tempsRepos, V.temps(4320));
    assert.equal(validerRecette(recetteValide({ tempsCuisson: '20' })).erreurs.tempsCuisson, V.temps(1440));
    assert.equal(validerRecette(recetteValide({ tempsCuisson: null, tempsRepos: '' })).valide, true);
  });

  test('portions : entier de 1 à 100', () => {
    assert.equal(validerRecette(recetteValide({ portions: 1 })).valide, true);
    assert.equal(validerRecette(recetteValide({ portions: 100 })).valide, true);
    for (const portions of [0, 101, 2.5, '4', null]) {
      assert.equal(validerRecette(recetteValide({ portions })).erreurs.portions, V.portions(1, 100), String(portions));
    }
  });

  test('au moins un ingrédient avec un nom', () => {
    assert.equal(validerRecette(recetteValide({ ingredients: [] })).erreurs.ingredients, V.ingredientsObligatoires);
    assert.equal(
      validerRecette(recetteValide({ ingredients: [{ nom: '  ', unite: 'g' }] })).erreurs.ingredients,
      V.ingredientsObligatoires,
    );
    assert.equal(
      validerRecette(recetteValide({ ingredients: [{ nom: 'sel' }, { quantite: 200, unite: 'g', nom: '' }] })).erreurs.ingredients,
      V.ingredientSansNom,
    );
    // Une ligne restée vide à côté d'un ingrédient nommé est tolérée
    assert.equal(validerRecette(recetteValide({ ingredients: [{ nom: 'sel' }, { nom: '', unite: 'g' }] })).valide, true);
  });

  test('quantités positives', () => {
    const avec = (quantite) => validerRecette(recetteValide({ ingredients: [{ quantite, nom: 'farine' }] }));
    assert.equal(avec(-1).erreurs.ingredients, V.quantite);
    assert.equal(avec(Number.NaN).erreurs.ingredients, V.quantite);
    assert.equal(avec(0.5).valide, true);
    assert.equal(avec(undefined).valide, true);
  });

  test('au moins une étape avec un texte, minuteur entier positif', () => {
    assert.equal(validerRecette(recetteValide({ etapes: [] })).erreurs.etapes, V.etapesObligatoires);
    assert.equal(validerRecette(recetteValide({ etapes: [{ texte: '  ' }] })).erreurs.etapes, V.etapesObligatoires);
    assert.equal(validerRecette(recetteValide({ etapes: [{ texte: 'Cuire.', minuteur: 900 }] })).valide, true);
    assert.equal(validerRecette(recetteValide({ etapes: [{ texte: 'Cuire.', minuteur: -5 }] })).erreurs.etapes, V.minuteur);
  });

  test('champs techniques et types', () => {
    const r = validerRecette(recetteValide({
      id: '', categories: ['Plat', ''], favori: 'oui', photo: 'http://exemple.fr/a.jpg',
      notes: 42, dateModification: 'hier',
    }));
    assert.equal(r.valide, false);
    assert.equal(r.erreurs.id, V.identifiant);
    assert.equal(r.erreurs.categories, V.categories);
    assert.equal(r.erreurs.favori, V.favori);
    assert.equal(r.erreurs.photo, V.photo);
    assert.equal(r.erreurs.notes, V.texte);
    assert.equal(r.erreurs.dateModification, V.date);
    assert.equal(validerRecette(recetteValide({ photo: 'data:image/jpeg;base64,AAAA' })).valide, true);
    assert.equal(validerRecette(recetteValide({ photo: new Blob(['x'], { type: 'image/jpeg' }) })).valide, true);
  });

  test('cumule toutes les erreurs, sans planter sur une entrée vide', () => {
    const { valide, erreurs } = validerRecette(undefined);
    assert.equal(valide, false);
    for (const champ of ['id', 'titre', 'difficulte', 'portions', 'ingredients', 'etapes', 'dateCreation']) {
      assert.ok(champ in erreurs, champ);
    }
  });
});

// ---------------------------------------------------------------------------
describe('tempsTotal', () => {
  test('additionne préparation, cuisson et repos', () => {
    assert.equal(tempsTotal({ tempsPreparation: 20, tempsCuisson: 35, tempsRepos: 60 }), 115);
  });

  test('ignore les valeurs absentes ou invalides', () => {
    assert.equal(tempsTotal({ tempsPreparation: 20, tempsCuisson: 35 }), 55);
    assert.equal(tempsTotal({ tempsCuisson: null, tempsRepos: '30', tempsPreparation: Number.NaN }), 0);
  });

  test('vaut 0 pour une recette sans temps ou absente', () => {
    assert.equal(tempsTotal({}), 0);
    assert.equal(tempsTotal(undefined), 0);
  });
});

// ---------------------------------------------------------------------------
describe('formaterDuree', () => {
  test('moins d’une heure en minutes', () => {
    assert.equal(formaterDuree(45), `45${E}min`);
    assert.equal(formaterDuree(0), `0${E}min`);
    assert.equal(formaterDuree(59), `59${E}min`);
  });

  test('heures et minutes', () => {
    assert.equal(formaterDuree(60), `1${E}h`);
    assert.equal(formaterDuree(75), `1${E}h${E}15`);
    assert.equal(formaterDuree(65), `1${E}h${E}05`);
    assert.equal(formaterDuree(1439), `23${E}h${E}59`);
  });

  test('au-delà de 24 h : jours et heures', () => {
    assert.equal(formaterDuree(1440), `1${E}j`);
    assert.equal(formaterDuree(2 * 1440 + 3 * 60), `2${E}j${E}3${E}h`);
    assert.equal(formaterDuree(4320), `3${E}j`);
    // Les minutes sont arrondies à l'heure la plus proche
    assert.equal(formaterDuree(1440 + 3 * 60 + 40), `1${E}j${E}4${E}h`);
  });

  test('valeurs invalides', () => {
    assert.equal(formaterDuree(-5), '');
    assert.equal(formaterDuree(undefined), '');
    assert.equal(formaterDuree(Number.NaN), '');
    assert.equal(formaterDuree(44.6), `45${E}min`);
  });
});

// ---------------------------------------------------------------------------
describe('mettreALEchelle', () => {
  const ingredients = [
    { quantite: 200, unite: 'g', nom: 'farine' },
    { quantite: 3, unite: 'pièce', nom: 'œufs' },
    { unite: '', nom: 'sel et poivre' },
  ];

  test('critère du cahier : de 4 à 6 portions, quantités × 1,5 avec un arrondi lisible', () => {
    const base = [
      { quantite: 250, unite: 'g', nom: 'farine' },
      { quantite: 3, unite: 'pièce', nom: 'œufs' },
      { quantite: 1, unite: 'c. à s.', nom: 'huile' },
      { quantite: 0.5, unite: 'l', nom: 'lait' },
      { quantite: 1, unite: 'pincée', nom: 'sel' },
    ];
    const resultat = mettreALEchelle(base, 4, 6);
    assert.deepEqual(resultat.map((i) => i.quantite), [375, 4.5, 1.5, 0.75, 1.5]);
    assert.deepEqual(resultat.map((i) => formaterQuantite(i.quantite, i.unite)), [
      `380${E}g`,
      '5',
      `1${E}½${E}c. à s.`,
      `0,75${E}l`,
      `1${E}½${E}pincée`,
    ]);
  });

  test('renvoie une nouvelle liste sans modifier l’originale', () => {
    const resultat = mettreALEchelle(ingredients, 4, 2);
    assert.notEqual(resultat, ingredients);
    assert.notEqual(resultat[0], ingredients[0]);
    assert.equal(ingredients[0].quantite, 200);
    assert.equal(resultat[0].quantite, 100);
    assert.equal(resultat[1].quantite, 1.5);
  });

  test('les quantités absentes restent absentes', () => {
    const resultat = mettreALEchelle(ingredients, 4, 8);
    assert.equal('quantite' in resultat[2], false);
    assert.deepEqual(resultat[2], ingredients[2]);
    const avecNull = mettreALEchelle([{ quantite: null, nom: 'sel' }], 2, 4);
    assert.equal(avecNull[0].quantite, null);
  });

  test('évite les erreurs d’arrondi binaire', () => {
    assert.equal(mettreALEchelle([{ quantite: 0.1, unite: 'l', nom: 'eau' }], 1, 3)[0].quantite, 0.3);
  });

  test('portions invalides : quantités inchangées', () => {
    assert.deepEqual(mettreALEchelle(ingredients, 0, 6), ingredients);
    assert.deepEqual(mettreALEchelle(ingredients, 4, Number.NaN), ingredients);
    assert.deepEqual(mettreALEchelle(undefined, 4, 6), []);
  });
});

// ---------------------------------------------------------------------------
describe('arrondirQuantite', () => {
  test('pièce : entier le plus proche, au moins 1 ; ½ ou ¼ en dessous', () => {
    assert.equal(arrondirQuantite(4.5, 'pièce'), 5);
    assert.equal(arrondirQuantite(2.4, 'pièce'), 2);
    assert.equal(arrondirQuantite(0.8, 'pièce'), 1);
    assert.equal(arrondirQuantite(0.5, 'pièce'), 0.5);
    assert.equal(arrondirQuantite(0.6, 'pièce'), 0.5);
    assert.equal(arrondirQuantite(0.3, 'pièce'), 0.25);
    assert.equal(arrondirQuantite(0.05, 'pièce'), 0.25);
    assert.equal(arrondirQuantite(2, ''), 2); // sans unité : compté en pièces
    assert.equal(arrondirQuantite(1.4, undefined), 1);
  });

  test('cuillères, tasse, pincée et unités libres : quart le plus proche', () => {
    assert.equal(arrondirQuantite(1.3, 'c. à s.'), 1.25);
    assert.equal(arrondirQuantite(1.4, 'c. à c.'), 1.5);
    assert.equal(arrondirQuantite(0.6, 'tasse'), 0.5);
    assert.equal(arrondirQuantite(2.9, 'gousse'), 3);
    assert.equal(arrondirQuantite(0.05, 'pincée'), 0.25);
  });

  test('g et ml : 1 décimale sous 10, multiple de 5 jusqu’à 100, de 10 au-delà', () => {
    assert.equal(arrondirQuantite(7.53, 'g'), 7.5);
    assert.equal(arrondirQuantite(0.01, 'g'), 0.1);
    assert.equal(arrondirQuantite(12, 'g'), 10);
    assert.equal(arrondirQuantite(12.5, 'ml'), 15);
    assert.equal(arrondirQuantite(37.5, 'g'), 40);
    assert.equal(arrondirQuantite(98, 'ml'), 100);
    assert.equal(arrondirQuantite(133.3, 'g'), 130);
    assert.equal(arrondirQuantite(375, 'g'), 380);
  });

  test('cl : 1 décimale sous 10, entier au-delà', () => {
    assert.equal(arrondirQuantite(7.55, 'cl'), 7.6);
    assert.equal(arrondirQuantite(37.5, 'cl'), 38);
  });

  test('kg et l : 2 décimales au maximum', () => {
    assert.equal(arrondirQuantite(1.2345, 'kg'), 1.23);
    assert.equal(arrondirQuantite(0.333333, 'l'), 0.33);
    assert.equal(arrondirQuantite(1.5, 'kg'), 1.5);
    assert.equal(arrondirQuantite(0.001, 'l'), 0.01);
  });

  test('cas limites : zéro, négatif, absent', () => {
    assert.equal(arrondirQuantite(0, 'g'), 0);
    assert.equal(arrondirQuantite(-2, 'g'), undefined);
    assert.equal(arrondirQuantite(undefined, 'g'), undefined);
    assert.equal(arrondirQuantite(Number.POSITIVE_INFINITY, 'pièce'), undefined);
  });
});

// ---------------------------------------------------------------------------
describe('formaterQuantite', () => {
  test('fractions pour les cuillères et les unités libres', () => {
    assert.equal(formaterQuantite(0.25, 'c. à c.'), `¼${E}c. à c.`);
    assert.equal(formaterQuantite(0.5, 'c. à s.'), `½${E}c. à s.`);
    assert.equal(formaterQuantite(0.75, 'tasse'), `¾${E}tasse`);
    assert.equal(formaterQuantite(1.5, 'c. à s.'), `1${E}½${E}c. à s.`);
    assert.equal(formaterQuantite(2, 'c. à s.'), `2${E}c. à s.`);
    assert.equal(formaterQuantite(1.3, 'botte'), `1${E}¼${E}botte`);
  });

  test('pièces : sans unité affichée, fractions sous 1', () => {
    assert.equal(formaterQuantite(3, 'pièce'), '3');
    assert.equal(formaterQuantite(0.5, 'pièce'), '½');
    assert.equal(formaterQuantite(0.2, ''), '¼');
    assert.equal(formaterQuantite(4.5, 'pièce'), '5');
  });

  test('virgule décimale et espace insécable', () => {
    assert.equal(formaterQuantite(7.5, 'g'), `7,5${E}g`);
    assert.equal(formaterQuantite(1.25, 'kg'), `1,25${E}kg`);
    assert.equal(formaterQuantite(1.5, 'l'), `1,5${E}l`);
    assert.equal(formaterQuantite(1.0, 'kg'), `1${E}kg`);
    assert.equal(formaterQuantite(200, 'g'), `200${E}g`);
    assert.equal(formaterQuantite(10, 'cl'), `10${E}cl`);
  });

  test('pluriel des unités qui s’accordent', () => {
    assert.equal(formaterQuantite(2, 'pincée'), `2${E}pincées`);
    assert.equal(formaterQuantite(1.75, 'pincée'), `1${E}¾${E}pincée`);
    assert.equal(formaterQuantite(3, 'gousse'), `3${E}gousses`);
    assert.equal(formaterQuantite(3, 'c. à c.'), `3${E}c. à c.`);
  });

  test('quantité absente : unité seule ou rien', () => {
    assert.equal(formaterQuantite(undefined, 'pincée'), 'pincée');
    assert.equal(formaterQuantite(undefined, ''), '');
    assert.equal(formaterQuantite(null, 'pièce'), '');
  });
});

// ---------------------------------------------------------------------------
describe('analyserLigneIngredient', () => {
  const ligne = (quantite, unite, nom, precision = '') => ({ quantite, unite, nom, precision });

  test('exemples du plan de développement', () => {
    const cas = [
      ['200 g farine', ligne(200, 'g', 'farine')],
      ['200g de farine', ligne(200, 'g', 'farine')],
      ["2 c. à s. d'huile d'olive", ligne(2, 'c. à s.', "huile d'olive")],
      ['1/2 citron', ligne(0.5, 'pièce', 'citron')],
      ['½ citron', ligne(0.5, 'pièce', 'citron')],
      ['1,5 kg de pommes de terre', ligne(1.5, 'kg', 'pommes de terre')],
      ['3 œufs', ligne(3, 'pièce', 'œufs')],
      ['1 pincée de sel', ligne(1, 'pincée', 'sel')],
      ['sel et poivre', ligne(undefined, '', 'sel et poivre')],
      ['2 oignons, émincés', ligne(2, 'pièce', 'oignons', 'émincés')],
      ['10 cl de lait', ligne(10, 'cl', 'lait')],
    ];
    for (const [texte, attendu] of cas) assert.deepEqual(analyserLigneIngredient(texte), attendu, texte);
  });

  test('variantes de cuillères ramenées aux unités canoniques', () => {
    const cas = [
      ['2 cs de miel', 'c. à s.', 'miel'],
      ['1 càs huile', 'c. à s.', 'huile'],
      ['1 c.à.s de sucre', 'c. à s.', 'sucre'],
      ['1 CS de sucre', 'c. à s.', 'sucre'],
      ['3 cuillères à soupe de crème', 'c. à s.', 'crème'],
      ['1 cuillerée à soupe de rhum', 'c. à s.', 'rhum'],
      ['1 cuillère à café de cannelle', 'c. à c.', 'cannelle'],
      ['2 cc de levure', 'c. à c.', 'levure'],
      ['1 c. à c. de sel', 'c. à c.', 'sel'],
      ['1 càc de vanille', 'c. à c.', 'vanille'],
    ];
    for (const [texte, unite, nom] of cas) {
      const r = analyserLigneIngredient(texte);
      assert.equal(r.unite, unite, texte);
      assert.equal(r.nom, nom, texte);
    }
  });

  test('variantes de masses et de volumes', () => {
    assert.deepEqual(analyserLigneIngredient('500 gr de bœuf'), ligne(500, 'g', 'bœuf'));
    assert.deepEqual(analyserLigneIngredient('250 grammes de sucre'), ligne(250, 'g', 'sucre'));
    assert.deepEqual(analyserLigneIngredient('1 litre de lait'), ligne(1, 'l', 'lait'));
    assert.deepEqual(analyserLigneIngredient('2 litres d’eau'), ligne(2, 'l', 'eau'));
    assert.deepEqual(analyserLigneIngredient('1 kilo de tomates'), ligne(1, 'kg', 'tomates'));
    assert.deepEqual(analyserLigneIngredient('300 ml de bouillon'), ligne(300, 'ml', 'bouillon'));
    assert.deepEqual(analyserLigneIngredient('2 dl de crème'), ligne(20, 'cl', 'crème'));
  });

  test('ne confond pas une unité avec le début d’un nom', () => {
    assert.deepEqual(analyserLigneIngredient('2 gousses'), ligne(2, 'pièce', 'gousses'));
    assert.deepEqual(analyserLigneIngredient('4 lardons'), ligne(4, 'pièce', 'lardons'));
    assert.deepEqual(analyserLigneIngredient('2 carottes'), ligne(2, 'pièce', 'carottes'));
    assert.deepEqual(analyserLigneIngredient('6 cassis'), ligne(6, 'pièce', 'cassis'));
  });

  test('unités libres courantes devant « de »', () => {
    assert.deepEqual(analyserLigneIngredient("2 gousses d'ail"), ligne(2, 'gousse', 'ail'));
    assert.deepEqual(analyserLigneIngredient('1 boîte de tomates pelées'), ligne(1, 'boîte', 'tomates pelées'));
  });

  test('quantités : fractions mixtes, décimales, nombres en lettres', () => {
    assert.equal(analyserLigneIngredient('1 ½ tasse de riz').quantite, 1.5);
    assert.equal(analyserLigneIngredient('1 1/2 tasse de riz').quantite, 1.5);
    assert.equal(analyserLigneIngredient('2.5 kg de farine').quantite, 2.5);
    assert.deepEqual(analyserLigneIngredient('une pincée de sel'), ligne(1, 'pincée', 'sel'));
    assert.deepEqual(analyserLigneIngredient('deux oignons'), ligne(2, 'pièce', 'oignons'));
    assert.deepEqual(analyserLigneIngredient('un peu de sel'), ligne(undefined, '', 'un peu de sel'));
  });

  test('précision après la virgule ou entre parenthèses', () => {
    assert.deepEqual(analyserLigneIngredient('100 g de beurre, mou'), ligne(100, 'g', 'beurre', 'mou'));
    assert.deepEqual(analyserLigneIngredient('4 carottes (bio)'), ligne(4, 'pièce', 'carottes', 'bio'));
    assert.deepEqual(
      analyserLigneIngredient('2 poireaux, coupés en rondelles, lavés'),
      ligne(2, 'pièce', 'poireaux', 'coupés en rondelles, lavés'),
    );
  });

  test('cas limites : vide, espaces, puce de liste, fraction invalide', () => {
    assert.deepEqual(analyserLigneIngredient(''), ligne(undefined, '', ''));
    assert.deepEqual(analyserLigneIngredient(undefined), ligne(undefined, '', ''));
    assert.deepEqual(analyserLigneIngredient('  200   g   farine  '), ligne(200, 'g', 'farine'));
    assert.deepEqual(analyserLigneIngredient('- 3 œufs'), ligne(3, 'pièce', 'œufs'));
    assert.deepEqual(analyserLigneIngredient('200 g'), ligne(200, 'g', ''));
    assert.equal(analyserLigneIngredient('1/0 citron').quantite, 1);
  });
});

// ---------------------------------------------------------------------------
describe('normaliser', () => {
  test('minuscules et sans accents', () => {
    assert.equal(normaliser('Crème Brûlée'), 'creme brulee');
    assert.equal(normaliser('ÉPICES À L’ÂNE'), "epices a l'ane");
  });

  test('espaces réduits et retirés aux extrémités', () => {
    assert.equal(normaliser('  tarte \n aux\t poireaux  '), 'tarte aux poireaux');
  });

  test('ligatures et texte décomposé (NFD)', () => {
    assert.equal(normaliser('Œufs'), 'oeufs');
    assert.equal(normaliser('crème'), 'creme');
  });

  test('valeurs vides', () => {
    assert.equal(normaliser(''), '');
    assert.equal(normaliser(undefined), '');
    assert.equal(normaliser(null), '');
  });
});

// ---------------------------------------------------------------------------
describe('rechercher', () => {
  const recettes = [
    creerRecette({ titre: 'Tarte aux poireaux', ingredients: [{ nom: 'poireaux' }, { nom: 'crème fraîche' }] }),
    creerRecette({ titre: 'Soupe du jour', ingredients: [{ nom: 'Poireau' }, { nom: 'pommes de terre' }] }),
    creerRecette({ titre: 'Crème brûlée', ingredients: [{ nom: 'œufs' }, { nom: 'sucre' }], notes: 'Caraméliser au chalumeau.' }),
    creerRecette({ titre: 'Gratin dauphinois', ingredients: [{ nom: 'pommes de terre' }, { nom: 'lait' }] }),
  ];
  const titres = (liste) => liste.map((r) => r.titre);

  test('critère du cahier : « poireau » trouve titre et ingrédients', () => {
    assert.deepEqual(titres(rechercher(recettes, 'poireau')), ['Tarte aux poireaux', 'Soupe du jour']);
  });

  test('insensible aux accents et à la casse', () => {
    assert.deepEqual(titres(rechercher(recettes, 'CREME')), ['Tarte aux poireaux', 'Crème brûlée']);
    assert.deepEqual(titres(rechercher(recettes, 'oeufs')), ['Crème brûlée']);
  });

  test('tous les mots doivent être présents, dans n’importe quel champ', () => {
    assert.deepEqual(titres(rechercher(recettes, 'pommes lait')), ['Gratin dauphinois']);
    assert.deepEqual(titres(rechercher(recettes, 'brûlée chalumeau')), ['Crème brûlée']);
    assert.deepEqual(titres(rechercher(recettes, 'poireau chocolat')), []);
  });

  test('requête vide : toutes les recettes, dans une nouvelle liste', () => {
    const resultat = rechercher(recettes, '   ');
    assert.deepEqual(resultat, recettes);
    assert.notEqual(resultat, recettes);
    assert.deepEqual(rechercher(undefined, 'tarte'), []);
  });

  test('suit une recette modifiée sur place (pas de cache périmé)', () => {
    const r = creerRecette({ titre: 'Quiche', ingredients: [{ nom: 'lardons' }] });
    assert.equal(rechercher([r], 'lardons').length, 1);
    r.ingredients[0].nom = 'saumon';
    assert.equal(rechercher([r], 'lardons').length, 0);
    assert.equal(rechercher([r], 'saumon').length, 1);
  });

  test('performance : moins de 100 ms pour 500 recettes', () => {
    const mots = ['tomate', 'poireau', 'carotte', 'farine', 'beurre', 'crème', 'œuf', 'sucre', 'oignon', 'ail'];
    const grandes = Array.from({ length: 500 }, (_, i) => creerRecette({
      titre: `Recette n° ${i} aux ${mots[i % mots.length]}s`,
      ingredients: Array.from({ length: 12 }, (_, j) => ({
        quantite: j + 1, unite: 'g', nom: `${mots[(i + j) % mots.length]} variété ${j}`,
      })),
      etapes: [{ texte: 'Mélanger.' }],
      notes: 'Une note assez longue pour ressembler à une vraie astuce de cuisine, avec des accents : é è à ç. '.repeat(3),
    }));
    rechercher(grandes, 'chauffe'); // préchauffage du moteur JavaScript
    const debut = performance.now();
    const resultat = rechercher(grandes, 'Crème poireau');
    const duree = performance.now() - debut;
    assert.ok(resultat.length > 0);
    assert.ok(duree < 100, `recherche en ${duree.toFixed(1)} ms`);
  });
});

// ---------------------------------------------------------------------------
describe('trier', () => {
  const a = { titre: 'Écrasé de pommes de terre', dateCreation: '2026-01-03T10:00:00.000Z', tempsPreparation: 10, tempsCuisson: 20 };
  const b = { titre: 'avocat farci', dateCreation: '2026-03-01T10:00:00.000Z', tempsPreparation: 5 };
  const c = { titre: 'Zébra', dateCreation: '2026-02-01T10:00:00.000Z' };
  const d = { titre: 'Recette 10', dateCreation: '2025-12-01T10:00:00.000Z', tempsRepos: 120 };
  const e = { titre: 'Recette 9', dateCreation: '2025-12-01T10:00:00.000Z', tempsCuisson: 120 };
  const liste = [a, b, c, d, e];
  const titres = (l) => l.map((r) => r.titre);

  test('par date : la plus récente d’abord, titre en cas d’égalité', () => {
    assert.deepEqual(titres(trier(liste, 'date')), ['avocat farci', 'Zébra', 'Écrasé de pommes de terre', 'Recette 9', 'Recette 10']);
  });

  test('par titre : ordre français, accents et casse ignorés, nombres naturels', () => {
    assert.deepEqual(titres(trier(liste, 'titre')), ['avocat farci', 'Écrasé de pommes de terre', 'Recette 9', 'Recette 10', 'Zébra']);
  });

  test('par temps total croissant, sans temps en dernier', () => {
    assert.deepEqual(titres(trier(liste, 'temps')), ['avocat farci', 'Écrasé de pommes de terre', 'Recette 9', 'Recette 10', 'Zébra']);
  });

  test('ne modifie pas la liste reçue ; critère inconnu ou liste absente', () => {
    const copie = [...liste];
    trier(liste, 'titre');
    assert.deepEqual(liste, copie);
    assert.deepEqual(trier(liste, 'couleur'), liste);
    assert.notEqual(trier(liste, 'couleur'), liste);
    assert.deepEqual(trier(undefined, 'date'), []);
  });

  test('par date : dates absentes ou invalides en dernier', () => {
    const sansDate = { titre: 'Sans date' };
    const invalide = { titre: 'Date invalide', dateCreation: 'hier' };
    assert.deepEqual(titres(trier([sansDate, invalide, c], 'date')), ['Zébra', 'Date invalide', 'Sans date']);
  });
});

// ---------------------------------------------------------------------------
describe('trouverIngredientsDansTexte', () => {
  /** Renvoie les extraits trouvés avec l'index de leur ingrédient. */
  const extraits = (texte, ingredients) => trouverIngredientsDansTexte(texte, ingredients)
    .map(({ debut, fin, indexIngredient }) => [texte.slice(debut, fin), indexIngredient]);

  test('trouve un ingrédient en ignorant accents et casse', () => {
    const ingredients = [{ nom: 'crème fraîche' }, { nom: 'Lait' }];
    assert.deepEqual(extraits('Ajouter la CREME FRAICHE et le lait.', ingredients), [['CREME FRAICHE', 0], ['lait', 1]]);
  });

  test('tolère le singulier et le pluriel', () => {
    const ingredients = [{ nom: 'poireaux' }, { nom: 'œuf' }];
    assert.deepEqual(extraits('Laver le poireau, puis battre les œufs.', ingredients), [['poireau', 0], ['œufs', 1]]);
    assert.deepEqual(extraits('Ajouter les poireaux et l’oeuf.', ingredients), [['poireaux', 0], ['oeuf', 1]]);
  });

  test('préfère la correspondance la plus longue', () => {
    const ingredients = [{ nom: 'pomme' }, { nom: 'pommes de terre' }];
    assert.deepEqual(
      extraits('Éplucher les pommes de terre, puis couper la pomme.', ingredients),
      [['pommes de terre', 1], ['pomme', 0]],
    );
  });

  test('positions exactes dans le texte d’origine', () => {
    const texte = 'Faire fondre les poireaux 15 min.';
    assert.deepEqual(trouverIngredientsDansTexte(texte, [{ nom: 'poireaux' }]), [{ debut: 17, fin: 25, indexIngredient: 0 }]);
    // Texte décomposé (NFD) : l'accent combinant fait partie de la plage
    const nfd = 'Ajouter la crème.';
    const [plage] = trouverIngredientsDansTexte(nfd, [{ nom: 'crème' }]);
    assert.equal(nfd.slice(plage.debut, plage.fin), 'crème');
  });

  test('premier mot d’un nom composé, mais ni adjectif ni morceau de mot', () => {
    const ingredients = [{ nom: 'crème fraîche' }, { nom: 'petits pois' }, { nom: 'sel' }];
    assert.deepEqual(
      extraits('Verser la crème sur les petits pois, en petits morceaux, sans le sélectionner.', ingredients),
      [['crème', 0], ['petits pois', 1]],
    );
  });

  test('toutes les occurrences, le nom complet avant le premier mot', () => {
    const ingredients = [{ nom: 'huile d’olive' }, { nom: 'huile' }];
    assert.deepEqual(
      extraits("Chauffer l'huile d'olive, puis ajouter l'huile.", ingredients),
      [["huile d'olive", 0], ['huile', 1]],
    );
  });

  test('cas limites : texte vide, ingrédients sans nom, caractères spéciaux', () => {
    assert.deepEqual(trouverIngredientsDansTexte('', [{ nom: 'sel' }]), []);
    assert.deepEqual(trouverIngredientsDansTexte('Saler.', undefined), []);
    assert.deepEqual(trouverIngredientsDansTexte('Saler.', [{ nom: '' }, {}, null]), []);
    // Les caractères spéciaux des expressions régulières sont échappés
    assert.deepEqual(extraits('Ajouter le sucre (vanillé).', [{ nom: 'sucre (vanillé' }]), [['sucre (vanillé', 0]]);
    assert.deepEqual(extraits('Ajouter le sucre.', [{ nom: 'sucre.*' }]), []);
  });
});

// ---------------------------------------------------------------------------
describe('dupliquerRecette', () => {
  const originale = recetteValide({
    id: 'original',
    titre: 'Tarte aux poireaux',
    favori: true,
    categories: ['Plat'],
    dateCreation: '2025-01-01T00:00:00.000Z',
    dateModification: '2025-06-01T00:00:00.000Z',
  });

  test('nouvel id, titre suivi de « (copie) », favori faux', () => {
    const copie = dupliquerRecette(originale);
    assert.match(copie.id, UUID);
    assert.notEqual(copie.id, originale.id);
    assert.equal(copie.titre, 'Tarte aux poireaux (copie)');
    assert.equal(copie.favori, false);
  });

  test('nouvelles dates, contenu identique', () => {
    const copie = dupliquerRecette(originale);
    assert.notEqual(copie.dateCreation, originale.dateCreation);
    assert.equal(copie.dateCreation, copie.dateModification);
    assert.deepEqual(copie.ingredients, originale.ingredients);
    assert.deepEqual(copie.categories, originale.categories);
    assert.equal(validerRecette(copie).valide, true);
  });

  test('aucune référence partagée avec l’originale', () => {
    const copie = dupliquerRecette(originale);
    copie.ingredients[0].nom = 'navets';
    copie.categories.push('Dessert');
    assert.equal(originale.ingredients[0].nom, 'poireaux');
    assert.deepEqual(originale.categories, ['Plat']);
  });

  test('un titre long est raccourci pour rester sous 120 caractères', () => {
    const copie = dupliquerRecette({ ...originale, titre: 'a'.repeat(120) });
    assert.equal(copie.titre.length, 120);
    assert.ok(copie.titre.endsWith(' (copie)'));
    assert.equal(validerRecette(copie).valide, true);
  });
});
