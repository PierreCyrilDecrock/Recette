// E3 — Formulaire de création et de modification : saisie, validation, enregistrement.
import { test, expect } from '@playwright/test';

// Collecte les erreurs de la console et les exceptions de la page
test.beforeEach(async ({ page }, testInfo) => {
  const erreurs = [];
  page.on('console', (message) => {
    if (message.type() === 'error') erreurs.push(message.text());
  });
  page.on('pageerror', (erreur) => erreurs.push(erreur.message));
  testInfo.erreurs = erreurs;
});

test.afterEach(async ({}, testInfo) => {
  expect(testInfo.erreurs, 'erreurs dans la console').toEqual([]);
});

const E = ' '; // espace insécable entre la quantité et l'unité

const titreEcran = (page) => page.getByRole('heading', { level: 1 });
const champTitre = (page) => page.getByRole('textbox', { name: 'Titre (obligatoire)' });
const champTemps = (page, nom) => page.getByRole('textbox', { name: `${nom} (en minutes)` });
const ingredient = (page, numero) => page.getByRole('group', { name: `Ingrédient ${numero}`, exact: true });
const etape = (page, numero) => page.getByRole('textbox', { name: `Étape ${numero}`, exact: true });
const lignesIngredients = (page) => page.locator('.ligne-ingredient');
const lignesEtapes = (page) => page.locator('.ligne-etape');
const enregistrer = (page) => page.getByRole('button', { name: 'Enregistrer' });
const valeurPortions = (page) => page.locator('.selecteur-portions__valeur');

/** Remplit une ligne d'ingrédient (les valeurs absentes laissent le champ vide). */
async function remplirIngredient(page, numero, { quantite = '', unite = '', nom = '', precision = '' }) {
  const ligne = ingredient(page, numero);
  await ligne.getByLabel('Quantité').fill(quantite);
  await ligne.getByLabel('Unité').fill(unite);
  await ligne.getByLabel('Nom', { exact: true }).fill(nom);
  await ligne.getByLabel('Précision').fill(precision);
}

const INGREDIENTS = [
  { quantite: '250', unite: 'g', nom: 'farine' },
  { quantite: '4', nom: 'œufs' },
  { quantite: '1/2', unite: 'l', nom: 'lait', precision: 'entier' },
  { quantite: '1,5', unite: 'c. à s.', nom: 'sucre' },
  { unite: 'pincée', nom: 'sel' },
];

const ETAPES = [
  'Mélanger la farine, le sucre et le sel.',
  'Ajouter les œufs puis le lait petit à petit en fouettant.',
  'Laisser reposer la pâte 1 h.',
  'Cuire les crêpes dans une poêle chaude.',
];

for (const largeur of [360, 1024]) {
  test.describe(`à ${largeur} px`, () => {
    test.use({ viewport: { width: largeur, height: 800 } });

    test('créer une recette complète, la retrouver après rechargement, puis la modifier', async ({ page }) => {
      await page.goto('./#/nouvelle');
      await expect(titreEcran(page)).toHaveText('Nouvelle recette');
      // Une ligne vide d'ingrédient et d'étape est prête à être remplie
      await expect(lignesIngredients(page)).toHaveCount(1);
      await expect(lignesEtapes(page)).toHaveCount(1);

      // --- Infos
      await champTitre(page).fill('Crêpes de la Chandeleur');
      await page.getByRole('textbox', { name: 'Description' }).fill('Fines et dorées.');
      await expect(page.locator('.edition__compteur')).toHaveText('16 / 500');
      await page.getByRole('radio', { name: 'Moyen' }).check();
      await champTemps(page, 'Préparation').fill('10');
      await champTemps(page, 'Cuisson').fill('20');
      await champTemps(page, 'Repos').fill('60');
      await page.getByRole('button', { name: 'Une portion de plus' }).click();
      await page.getByRole('button', { name: 'Une portion de plus' }).click();
      await expect(valeurPortions(page)).toHaveText('6 portions');
      // Nouvelle catégorie : la puce est créée et sélectionnée
      await page.getByRole('textbox', { name: 'Nouvelle catégorie' }).fill('Goûter');
      await page.getByRole('button', { name: 'Créer' }).click();
      await expect(page.getByRole('button', { name: 'Goûter' })).toHaveAttribute('aria-pressed', 'true');
      await expect(page.getByRole('textbox', { name: 'Nouvelle catégorie' })).toHaveValue('');

      // --- Ingrédients : 5 lignes remplies et une ligne vide, ignorée à l'enregistrement
      for (const [index, donnees] of INGREDIENTS.entries()) {
        if (index > 0) {
          await page.getByRole('button', { name: 'Ajouter un ingrédient' }).click();
          // Le focus va au champ quantité de la nouvelle ligne
          await expect(ingredient(page, index + 1).getByLabel('Quantité')).toBeFocused();
        }
        await remplirIngredient(page, index + 1, donnees);
      }
      await page.getByRole('button', { name: 'Ajouter un ingrédient' }).click();
      await expect(lignesIngredients(page)).toHaveCount(6);
      // Clavier décimal pour les quantités, liste d'unités avec saisie libre
      const quantite = ingredient(page, 1).getByLabel('Quantité');
      await expect(quantite).toHaveAttribute('inputmode', 'decimal');
      await expect(ingredient(page, 1).getByLabel('Unité')).toHaveAttribute('list', 'edition-unites');
      await expect(page.locator('#edition-unites option')).toHaveCount(10);
      await expect(champTemps(page, 'Cuisson')).toHaveAttribute('inputmode', 'numeric');
      await expect(champTemps(page, 'Cuisson')).toHaveAttribute('pattern', '[0-9]*');

      // --- Étapes : 4 remplies et une vide ; les zones de texte grandissent avec le contenu
      for (const [index, texte] of ETAPES.entries()) {
        if (index > 0) await page.getByRole('button', { name: 'Ajouter une étape' }).click();
        await etape(page, index + 1).fill(texte);
      }
      await page.getByRole('button', { name: 'Ajouter une étape' }).click();
      await expect(page.locator('.ligne-etape__numero')).toHaveText(['1', '2', '3', '4', '5']);
      const hauteurAvant = (await etape(page, 5).boundingBox()).height;
      await etape(page, 5).fill('Une\nlongue\nétape\nsur\nplusieurs\nlignes');
      expect((await etape(page, 5).boundingBox()).height).toBeGreaterThan(hauteurAvant + 40);
      await etape(page, 5).fill('');

      // --- Notes et source
      await page.getByRole('textbox', { name: 'Notes' }).fill('Ajouter un peu de beurre fondu.');
      await page.getByRole('textbox', { name: 'Source' }).fill('Livre de Mamie');

      // La barre d'actions reste visible en bas de l'écran
      const barre = await page.locator('.edition__actions').boundingBox();
      expect(barre.y + barre.height).toBeGreaterThan(800 - 2);

      await enregistrer(page).click();

      // --- Fiche
      await expect(page).toHaveURL(/#\/recette\/[0-9a-f-]{36}$/);
      const urlFiche = page.url();
      await verifierFicheCreee(page);

      // --- Toujours là après un rechargement
      await page.reload();
      await verifierFicheCreee(page);

      // --- Modification : formulaire pré-rempli
      await page.getByRole('button', { name: 'Plus d’actions' }).click();
      await page.getByRole('link', { name: 'Modifier' }).click();
      await expect(titreEcran(page)).toHaveText('Modifier la recette');
      await expect(champTitre(page)).toHaveValue('Crêpes de la Chandeleur');
      await expect(page.getByRole('textbox', { name: 'Description' })).toHaveValue('Fines et dorées.');
      await expect(page.getByRole('radio', { name: 'Moyen' })).toBeChecked();
      await expect(champTemps(page, 'Préparation')).toHaveValue('10');
      await expect(champTemps(page, 'Cuisson')).toHaveValue('20');
      await expect(champTemps(page, 'Repos')).toHaveValue('60');
      await expect(valeurPortions(page)).toHaveText('6 portions');
      await expect(page.getByRole('button', { name: 'Goûter' })).toHaveAttribute('aria-pressed', 'true');
      await expect(lignesIngredients(page)).toHaveCount(5);
      await expect(ingredient(page, 3).getByLabel('Quantité')).toHaveValue('0,5');
      await expect(ingredient(page, 3).getByLabel('Unité')).toHaveValue('l');
      await expect(ingredient(page, 3).getByLabel('Précision')).toHaveValue('entier');
      await expect(ingredient(page, 4).getByLabel('Quantité')).toHaveValue('1,5');
      await expect(ingredient(page, 5).getByLabel('Quantité')).toHaveValue('');
      await expect(lignesEtapes(page)).toHaveCount(4);
      await expect(etape(page, 4)).toHaveValue(ETAPES[3]);
      await expect(page.getByRole('textbox', { name: 'Notes' })).toHaveValue('Ajouter un peu de beurre fondu.');
      await expect(page.getByRole('textbox', { name: 'Source' })).toHaveValue('Livre de Mamie');

      // Modifications : titre, difficulté, cuisson, un ingrédient retiré, une étape ajoutée
      await champTitre(page).fill('Crêpes légères');
      await page.getByRole('radio', { name: 'Facile' }).check();
      await champTemps(page, 'Cuisson').fill('25');
      await page.getByRole('button', { name: 'Supprimer l’ingrédient 2' }).click();
      await expect(lignesIngredients(page)).toHaveCount(4);
      // Le focus passe à la ligne suivante, renumérotée
      await expect(ingredient(page, 2).getByLabel('Quantité')).toBeFocused();
      await expect(ingredient(page, 2).getByLabel('Nom', { exact: true })).toHaveValue('lait');
      await page.getByRole('button', { name: 'Ajouter une étape' }).click();
      await expect(etape(page, 5)).toBeFocused();
      await etape(page, 5).fill('Servir aussitôt.');
      await enregistrer(page).click();

      await expect(page).toHaveURL(urlFiche);
      await verifierFicheModifiee(page);
      await page.reload();
      await verifierFicheModifiee(page);

      // La nouvelle catégorie a été enregistrée : elle sert de filtre dans la liste
      await page.goto('./#/');
      await expect(page.getByRole('button', { name: 'Goûter' })).toBeVisible();
    });

    test('le formulaire tient dans la largeur et ses cibles mesurent au moins 44 px', async ({ page }) => {
      await page.goto('./#/nouvelle');
      await page.getByRole('button', { name: 'Ajouter un ingrédient' }).click();
      await page.getByRole('textbox', { name: 'Nouvelle catégorie' }).fill('Dessert');
      await page.getByRole('button', { name: 'Créer' }).click();
      const debordement = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(debordement).toBeLessThanOrEqual(0);

      const cibles = page.locator('.edition button, .edition input, .edition textarea, .edition .segmente__option');
      const nombre = await cibles.count();
      expect(nombre).toBeGreaterThan(15);
      for (let i = 0; i < nombre; i++) {
        const cible = cibles.nth(i);
        // Les boutons radio, transparents, couvrent leur segment (mesuré à part)
        if (!(await cible.isVisible()) || (await cible.getAttribute('type')) === 'radio') continue;
        const boite = await cible.boundingBox();
        const nom = await cible.evaluate((el) => el.getAttribute('aria-label') ?? el.textContent ?? el.id);
        expect(boite.width, nom).toBeGreaterThanOrEqual(44);
        expect(boite.height, nom).toBeGreaterThanOrEqual(44);
      }
    });
  });
}

/** Fiche de la recette telle que créée. */
async function verifierFicheCreee(page) {
  await expect(titreEcran(page)).toHaveText('Crêpes de la Chandeleur');
  await expect(page.locator('.fiche__description')).toHaveText('Fines et dorées.');
  await expect(page.locator('.etiquette')).toHaveText(['Goûter']);
  await expect(page.locator('.info')).toHaveText([
    'DifficultéMoyen',
    `Préparation10${E}min`,
    `Cuisson20${E}min`,
    `Repos1${E}h`,
    `Total1${E}h${E}30`,
  ]);
  await expect(valeurPortions(page)).toHaveText('6 portions');
  await expect(page.locator('.ingredient')).toHaveText([
    `250${E}g farine`,
    '4 œufs',
    `0,5${E}l lait entier`,
    `1${E}½${E}c. à s. sucre`,
    'pincée sel',
  ]);
  await expect(page.locator('.etape__texte')).toHaveText(ETAPES);
  await expect(page.locator('.fiche__notes-texte')).toHaveText('Ajouter un peu de beurre fondu.');
  await expect(page.locator('.fiche__source')).toHaveText('Source : Livre de Mamie');
}

/** Fiche de la recette après modification. */
async function verifierFicheModifiee(page) {
  await expect(titreEcran(page)).toHaveText('Crêpes légères');
  await expect(page.locator('.info').first()).toHaveText('DifficultéFacile');
  await expect(page.locator('.info--total')).toHaveText(`Total1${E}h${E}35`);
  await expect(page.locator('.ingredient')).toHaveText([
    `250${E}g farine`,
    `0,5${E}l lait entier`,
    `1${E}½${E}c. à s. sucre`,
    'pincée sel',
  ]);
  await expect(page.locator('.etape__texte')).toHaveText([...ETAPES, 'Servir aussitôt.']);
}

test('les erreurs s’affichent sous les champs et le focus va au premier', async ({ page }) => {
  await page.goto('./#/nouvelle');
  await enregistrer(page).click();

  // Titre : message relié au champ, focus
  const erreurTitre = page.locator('#edition-erreur-titre');
  await expect(erreurTitre).toHaveText('Donnez un titre à la recette.');
  await expect(champTitre(page)).toHaveAttribute('aria-invalid', 'true');
  await expect(champTitre(page)).toHaveAttribute('aria-describedby', /edition-erreur-titre/);
  await expect(champTitre(page)).toBeFocused();
  // Ingrédients et étapes : au moins une ligne remplie
  await expect(page.locator('#edition-erreur-ingredients')).toHaveText('Ajoutez au moins un ingrédient.');
  await expect(ingredient(page, 1).getByLabel('Nom', { exact: true })).toHaveAttribute('aria-invalid', 'true');
  await expect(page.locator('#edition-erreur-etapes')).toHaveText('Ajoutez au moins une étape.');
  await expect(etape(page, 1)).toHaveAttribute('aria-invalid', 'true');
  await expect(page).toHaveURL(/#\/nouvelle$/);

  // La saisie efface l'erreur du champ
  await champTitre(page).fill('Pain perdu');
  await expect(erreurTitre).toBeHidden();
  await expect(champTitre(page)).not.toHaveAttribute('aria-invalid');
  await expect(champTitre(page)).not.toHaveAttribute('aria-describedby');

  // Quantité sans nom : le focus va au nom de la ligne concernée
  await remplirIngredient(page, 1, { quantite: '2', unite: 'pièce', nom: 'œufs' });
  await page.getByRole('button', { name: 'Ajouter un ingrédient' }).click();
  await remplirIngredient(page, 2, { quantite: '200', unite: 'g' });
  await etape(page, 1).fill('Tremper le pain.');
  await champTemps(page, 'Cuisson').fill('1,5');
  await page.getByRole('textbox', { name: 'Description' }).fill('a'.repeat(501));
  await expect(page.locator('.edition__compteur')).toHaveText('501 / 500');
  await expect(page.locator('.edition__compteur')).toHaveClass(/edition__compteur--depasse/);
  await enregistrer(page).click();

  const description = page.getByRole('textbox', { name: 'Description' });
  await expect(page.locator('#edition-erreur-description')).toHaveText('La description ne doit pas dépasser 500 caractères.');
  await expect(description).toBeFocused();
  await expect(description).toHaveAttribute('aria-describedby', /edition-erreur-description/);
  await expect(page.locator('#edition-erreur-tempsCuisson')).toHaveText('Cuisson : Indiquez un nombre entier de minutes, entre 0 et 1440.');
  await expect(champTemps(page, 'Cuisson')).toHaveAttribute('aria-invalid', 'true');
  const nom2 = ingredient(page, 2).getByLabel('Nom', { exact: true });
  await expect(page.locator('#edition-erreur-ingredients')).toHaveText('Chaque ingrédient doit avoir un nom.');
  await expect(nom2).toHaveAttribute('aria-invalid', 'true');
  await expect(nom2).toHaveAttribute('aria-describedby', 'edition-erreur-ingredients');
  await expect(page.locator('#edition-erreur-etapes')).toBeHidden();

  await description.fill('Le goûter des enfants.');
  await champTemps(page, 'Cuisson').fill('5');
  await enregistrer(page).click();
  await expect(nom2).toBeFocused();

  // Quantité illisible : le focus va à la quantité
  await nom2.fill('pain rassis');
  await ingredient(page, 2).getByLabel('Quantité').fill('beaucoup');
  await enregistrer(page).click();
  await expect(page.locator('#edition-erreur-ingredients')).toHaveText('Les quantités doivent être des nombres positifs.');
  await expect(ingredient(page, 2).getByLabel('Quantité')).toBeFocused();

  await ingredient(page, 2).getByLabel('Quantité').fill('4');
  await ingredient(page, 2).getByLabel('Unité').fill('tranche');
  await enregistrer(page).click();
  await expect(titreEcran(page)).toHaveText('Pain perdu');
  // Unité libre conservée
  await expect(page.locator('.ingredient')).toHaveText([`2 œufs`, `4${E}tranches pain rassis`]);
});

test('une catégorie vide est refusée sous le champ', async ({ page }) => {
  await page.goto('./#/nouvelle');
  const nouvelle = page.getByRole('textbox', { name: 'Nouvelle catégorie' });
  await nouvelle.fill('   ');
  await nouvelle.press('Enter');
  await expect(page.locator('#edition-erreur-categories')).toHaveText('Donnez un nom à la catégorie.');
  await expect(nouvelle).toHaveAttribute('aria-invalid', 'true');
  await expect(nouvelle).toBeFocused();
  // Entrée crée la puce sans envoyer le formulaire ; un nom existant n'est pas dupliqué
  await nouvelle.fill('Brunch');
  await nouvelle.press('Enter');
  await nouvelle.fill('brunch');
  await nouvelle.press('Enter');
  await expect(page.locator('.edition__puces .puce')).toHaveText(['Brunch']);
  await expect(page.locator('#edition-erreur-categories')).toBeHidden();
  await expect(page.locator('#edition-erreur-titre')).toBeHidden();
  // Un toucher désélectionne la puce
  await page.getByRole('button', { name: 'Brunch' }).click();
  await expect(page.getByRole('button', { name: 'Brunch' })).toHaveAttribute('aria-pressed', 'false');
});

test('la difficulté se choisit au clavier et la dernière ligne supprimée laisse une ligne vide', async ({ page }) => {
  await page.goto('./#/nouvelle');
  await page.getByRole('radio', { name: 'Facile' }).focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('radio', { name: 'Moyen' })).toBeChecked();
  await expect(page.getByRole('radio', { name: 'Moyen' })).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('radio', { name: 'Difficile' })).toBeChecked();

  await remplirIngredient(page, 1, { nom: 'farine' });
  await page.getByRole('button', { name: 'Supprimer l’ingrédient 1' }).click();
  await expect(lignesIngredients(page)).toHaveCount(1);
  await expect(ingredient(page, 1).getByLabel('Nom', { exact: true })).toHaveValue('');
  await expect(ingredient(page, 1).getByLabel('Quantité')).toBeFocused();
  await page.getByRole('button', { name: 'Supprimer l’étape 1' }).click();
  await expect(lignesEtapes(page)).toHaveCount(1);
  await expect(etape(page, 1)).toBeFocused();
});

test('Annuler revient à la fiche (modification) ou à la liste (création) sans rien enregistrer', async ({ page }) => {
  await page.goto('./#/');
  await page.getByRole('button', { name: 'Charger des exemples' }).click();
  await expect(page.locator('.grille-recettes .carte-recette')).toHaveCount(6);

  await page.goto('./#/edition/exemple-tarte-poireaux');
  await expect(champTitre(page)).toHaveValue('Tarte aux poireaux');
  // Les champs que le formulaire ne montre pas (section, minuteur) sont conservés
  await expect(lignesIngredients(page)).toHaveCount(8);
  await expect(ingredient(page, 8).getByLabel('Quantité')).toHaveValue('');
  await champTitre(page).fill('Titre abandonné');
  await page.getByRole('button', { name: 'Annuler' }).click();
  await expect(page).toHaveURL(/#\/recette\/exemple-tarte-poireaux$/);
  await expect(titreEcran(page)).toHaveText('Tarte aux poireaux');

  await page.goto('./#/nouvelle');
  await champTitre(page).fill('Brouillon');
  await page.getByRole('button', { name: 'Annuler' }).click();
  await expect(page).toHaveURL(/#\/$/);
  await expect(page.locator('.grille-recettes .carte-recette')).toHaveCount(6);
});

test('enregistrer sans changement conserve les champs non affichés (section, minuteur, favori)', async ({ page }) => {
  await page.goto('./#/');
  await page.getByRole('button', { name: 'Charger des exemples' }).click();
  await expect(page.locator('.grille-recettes .carte-recette')).toHaveCount(6);
  const avant = await page.evaluate(() => import('./js/db.js').then((db) => db.lireRecette('exemple-tarte-poireaux')));

  await page.goto('./#/recette/exemple-tarte-poireaux');
  await page.getByRole('button', { name: 'Favori' }).click();
  await expect(page.getByRole('button', { name: 'Favori' })).toHaveAttribute('aria-pressed', 'true');
  await page.goto('./#/edition/exemple-tarte-poireaux');
  await expect(champTitre(page)).toHaveValue('Tarte aux poireaux');
  await enregistrer(page).click();
  await expect(page).toHaveURL(/#\/recette\/exemple-tarte-poireaux$/);

  const apres = await page.evaluate(() => import('./js/db.js').then((db) => db.lireRecette('exemple-tarte-poireaux')));
  expect(apres.favori).toBe(true);
  expect(apres.dateCreation).toBe(avant.dateCreation);
  expect(apres.dateModification > avant.dateModification).toBe(true);
  const sansDates = ({ dateModification, favori, ...reste }) => reste;
  expect(sansDates(apres)).toEqual(sansDates(avant));
});
