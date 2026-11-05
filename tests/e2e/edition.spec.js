// E3 — Formulaire de création et de modification : saisie, validation, enregistrement,
// saisie rapide (Entrée, ligne libre, collage, réordonnancement), brouillon et sortie.
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
const LIBRE = 'Quantité, unité et nom';

const titreEcran = (page) => page.getByRole('heading', { level: 1 });
const champTitre = (page) => page.getByRole('textbox', { name: 'Titre (obligatoire)' });
const champTemps = (page, nom) => page.getByRole('textbox', { name: `${nom} (en minutes)` });
const ingredient = (page, numero) => page.getByRole('group', { name: `Ingrédient ${numero}`, exact: true });
const etape = (page, numero) => page.getByRole('textbox', { name: `Étape ${numero}`, exact: true });
const lignesIngredients = (page) => page.locator('.ligne-ingredient');
const lignesEtapes = (page) => page.locator('.ligne-etape');
const enregistrer = (page) => page.getByRole('button', { name: 'Enregistrer' });
const valeurPortions = (page) => page.locator('.selecteur-portions__valeur');
const dialogueSortie = (page) => page.getByRole('dialog', { name: 'Quitter sans enregistrer ?' });

/** Le mode « ligne libre » est le mode par défaut sous 768 px. */
const enLigneLibre = (page) => page.viewportSize().width < 768;

/** Premier champ d'une ligne d'ingrédient (selon le mode). */
const premierChamp = (page, numero) => (enLigneLibre(page)
  ? ingredient(page, numero).getByLabel(LIBRE)
  : ingredient(page, numero).getByLabel('Quantité', { exact: true }));

/** Remplit une ligne d'ingrédient : champ unique en ligne libre, champs détaillés sinon. */
async function remplirIngredient(page, numero, donnees) {
  const ligne = ingredient(page, numero);
  if (enLigneLibre(page)) {
    await ligne.getByLabel(LIBRE).fill(donnees.libre);
    return;
  }
  await ligne.getByLabel('Quantité', { exact: true }).fill(donnees.quantite ?? '');
  await ligne.getByLabel('Unité', { exact: true }).fill(donnees.unite ?? '');
  await ligne.getByLabel('Nom', { exact: true }).fill(donnees.nom ?? '');
  await ligne.getByLabel('Précision').fill(donnees.precision ?? '');
}

/** Vérifie le contenu d'une ligne d'ingrédient (selon le mode). */
async function verifierIngredient(page, numero, donnees) {
  const ligne = ingredient(page, numero);
  if (enLigneLibre(page)) {
    await expect(ligne.getByLabel(LIBRE)).toHaveValue(donnees.ligne);
    return;
  }
  await expect(ligne.getByLabel('Quantité', { exact: true })).toHaveValue(donnees.quantite ?? '');
  await expect(ligne.getByLabel('Unité', { exact: true })).toHaveValue(donnees.unite ?? '');
  await expect(ligne.getByLabel('Nom', { exact: true })).toHaveValue(donnees.nom ?? '');
  await expect(ligne.getByLabel('Précision')).toHaveValue(donnees.precision ?? '');
}

/** Ouvre le menu d'une ligne et choisit une action. */
async function actionLigne(page, menu, action) {
  await page.getByRole('button', { name: menu }).click();
  await page.getByRole('button', { name: action, exact: true }).click();
}

/** Valeurs des champs désignés, dans l'ordre. */
const valeurs = (champs) => champs.evaluateAll((elements) => elements.map((el) => el.value));

/** Lit un réglage (brouillon) directement dans la base. */
const lireReglage = (page, cle) => page.evaluate((c) => import('./js/db.js').then((db) => db.lireReglage(c)), cle);

/** Charge les recettes d'exemple depuis l'accueil vide. */
async function chargerExemples(page) {
  await page.goto('./#/');
  await page.getByRole('button', { name: 'Charger des exemples' }).click();
  await expect(page.locator('.grille-recettes .carte-recette')).toHaveCount(6);
}

// libre : saisie en ligne libre ; ligne : ce que la ligne libre affiche après analyse
const INGREDIENTS = [
  { quantite: '250', unite: 'g', nom: 'farine', libre: '250 g de farine', ligne: '250 g farine' },
  { quantite: '4', nom: 'œufs', libre: '4 œufs', ligne: '4 œufs' },
  { quantite: '1/2', unite: 'l', nom: 'lait', precision: 'entier', libre: '1/2 l de lait, entier', ligne: '0,5 l lait, entier' },
  { quantite: '1,5', unite: 'c. à s.', nom: 'sucre', libre: '1,5 cuillère à soupe de sucre', ligne: '1,5 c. à s. sucre' },
  { quantite: '1', unite: 'pincée', nom: 'sel', libre: '1 pincée de sel', ligne: '1 pincée sel' },
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
      // Ligne libre par défaut sur mobile, champs détaillés au-delà
      await expect(ingredient(page, 1).getByLabel(LIBRE)).toBeVisible({ visible: largeur < 768 });
      await expect(ingredient(page, 1).getByLabel('Quantité', { exact: true })).toBeVisible({ visible: largeur >= 768 });

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

      // --- Ingrédients : Entrée crée la ligne suivante et y place le focus
      for (const [index, donnees] of INGREDIENTS.entries()) {
        await remplirIngredient(page, index + 1, donnees);
        if (index < INGREDIENTS.length - 1) {
          await page.keyboard.press('Enter');
          await expect(premierChamp(page, index + 2)).toBeFocused();
        }
      }
      // Le bouton ajoute aussi une ligne, qui reste vide (ignorée à l'enregistrement)
      await page.getByRole('button', { name: 'Ajouter un ingrédient' }).click();
      await expect(premierChamp(page, 6)).toBeFocused();
      await expect(lignesIngredients(page)).toHaveCount(6);
      // En ligne libre, la saisie est analysée à la sortie du champ
      if (largeur < 768) await verifierIngredient(page, 3, INGREDIENTS[2]);
      // Clavier décimal pour les quantités, liste d'unités avec saisie libre
      const quantite = ingredient(page, 1).getByLabel('Quantité', { exact: true });
      await expect(quantite).toHaveAttribute('inputmode', 'decimal');
      await expect(ingredient(page, 1).getByLabel('Unité', { exact: true })).toHaveAttribute('list', 'edition-unites');
      await expect(page.locator('#edition-unites option')).toHaveCount(10);
      await expect(champTemps(page, 'Cuisson')).toHaveAttribute('inputmode', 'numeric');
      await expect(champTemps(page, 'Cuisson')).toHaveAttribute('pattern', '[0-9]*');

      // --- Étapes : Entrée crée l'étape suivante ; une étape vide en fin de liste est ignorée
      await etape(page, 1).click();
      for (const [index, texte] of ETAPES.entries()) {
        await page.keyboard.insertText(texte);
        await page.keyboard.press('Enter');
        await expect(etape(page, index + 2)).toBeFocused();
      }
      await expect(page.locator('.ligne-etape__numero')).toHaveText(['1', '2', '3', '4', '5']);
      // Les zones de texte grandissent avec le contenu
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
      await verifierIngredient(page, 1, { ...INGREDIENTS[0] });
      await verifierIngredient(page, 2, INGREDIENTS[1]);
      await verifierIngredient(page, 3, { ...INGREDIENTS[2], quantite: '0,5' });
      await verifierIngredient(page, 4, INGREDIENTS[3]);
      await verifierIngredient(page, 5, INGREDIENTS[4]);
      await expect(lignesEtapes(page)).toHaveCount(4);
      await expect(etape(page, 4)).toHaveValue(ETAPES[3]);
      await expect(page.getByRole('textbox', { name: 'Notes' })).toHaveValue('Ajouter un peu de beurre fondu.');
      await expect(page.getByRole('textbox', { name: 'Source' })).toHaveValue('Livre de Mamie');

      // Modifications : titre, difficulté, cuisson, un ingrédient retiré, une étape ajoutée
      await champTitre(page).fill('Crêpes légères');
      await page.getByRole('radio', { name: 'Facile' }).check();
      await champTemps(page, 'Cuisson').fill('25');
      await actionLigne(page, 'Actions de l’ingrédient 2', 'Supprimer');
      await expect(lignesIngredients(page)).toHaveCount(4);
      // Le focus passe à la ligne suivante, renumérotée
      await expect(premierChamp(page, 2)).toBeFocused();
      await verifierIngredient(page, 2, { ...INGREDIENTS[2], quantite: '0,5' });
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
      await page.getByRole('button', { name: 'Actions de l’ingrédient 2' }).click();
      const debordement = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(debordement).toBeLessThanOrEqual(0);

      const cibles = page.locator([
        '.edition button', '.edition input', '.edition textarea', '.edition .segmente__option', '.ligne__poignee',
      ].join(', '));
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

    test('coller une liste crée un ingrédient par ligne, analysé', async ({ page, context, browserName }) => {
      test.skip(browserName !== 'chromium', 'presse-papiers piloté par les permissions de Chromium');
      await context.grantPermissions(['clipboard-read', 'clipboard-write']);
      await page.goto('./#/nouvelle');
      const liste = '- 250 g de farine\n- 3 œufs\n- 50 cl de lait\n- 1 pincée de sel';
      await page.evaluate((texte) => navigator.clipboard.writeText(texte), liste);
      await premierChamp(page, 1).click();
      await page.keyboard.press('ControlOrMeta+V');

      // La ligne vide est remplacée par les quatre lignes collées
      await expect(lignesIngredients(page)).toHaveCount(4);
      const attendus = [
        { quantite: '250', unite: 'g', nom: 'farine', ligne: '250 g farine' },
        { quantite: '3', unite: 'pièce', nom: 'œufs', ligne: '3 œufs' },
        { quantite: '50', unite: 'cl', nom: 'lait', ligne: '50 cl lait' },
        { quantite: '1', unite: 'pincée', nom: 'sel', ligne: '1 pincée sel' },
      ];
      for (const [index, donnees] of attendus.entries()) await verifierIngredient(page, index + 1, donnees);
      // Le focus est sur la dernière ligne collée ; l'ajout est annoncé
      const dernier = enLigneLibre(page) ? ingredient(page, 4).getByLabel(LIBRE) : ingredient(page, 4).getByLabel('Précision');
      await expect(dernier).toBeFocused();
      await expect(page.locator('.lignes').first().locator('xpath=following-sibling::p[@aria-live]'))
        .toHaveText('4 ingrédients ajoutés.');

      // Collage dans une ligne remplie : les lignes s'insèrent après elle
      await page.evaluate((texte) => navigator.clipboard.writeText(texte), '• sucre\n• beurre');
      await premierChamp(page, 1).click();
      await page.keyboard.press('ControlOrMeta+V');
      await expect(lignesIngredients(page)).toHaveCount(6);
      await verifierIngredient(page, 2, { nom: 'sucre', ligne: 'sucre' });
      await verifierIngredient(page, 3, { nom: 'beurre', ligne: 'beurre' });
      await verifierIngredient(page, 4, attendus[1]);

      await champTitre(page).fill('Pâte');
      await etape(page, 1).fill('Mélanger.');
      await enregistrer(page).click();
      await expect(page.locator('.ingredient')).toHaveText([
        `250${E}g farine`, 'sucre', 'beurre', '3 œufs', `50${E}cl lait`, `1${E}pincée sel`,
      ]);
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
    `1${E}pincée sel`,
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
    `1${E}pincée sel`,
  ]);
  await expect(page.locator('.etape__texte')).toHaveText([...ETAPES, 'Servir aussitôt.']);
}

// Champs détaillés (bureau) pour les tests qui suivent, sauf mention contraire
test.describe('champs détaillés', () => {
  test.use({ viewport: { width: 1024, height: 800 } });

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
    await ingredient(page, 2).getByLabel('Quantité', { exact: true }).fill('beaucoup');
    await enregistrer(page).click();
    await expect(page.locator('#edition-erreur-ingredients')).toHaveText('Les quantités doivent être des nombres positifs.');
    await expect(ingredient(page, 2).getByLabel('Quantité', { exact: true })).toBeFocused();

    await ingredient(page, 2).getByLabel('Quantité', { exact: true }).fill('4');
    await ingredient(page, 2).getByLabel('Unité', { exact: true }).fill('tranche');
    await enregistrer(page).click();
    await expect(titreEcran(page)).toHaveText('Pain perdu');
    // Unité libre conservée
    await expect(page.locator('.ingredient')).toHaveText(['2 œufs', `4${E}tranches pain rassis`]);
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
    await actionLigne(page, 'Actions de l’ingrédient 1', 'Supprimer');
    await expect(lignesIngredients(page)).toHaveCount(1);
    await expect(ingredient(page, 1).getByLabel('Nom', { exact: true })).toHaveValue('');
    await expect(ingredient(page, 1).getByLabel('Quantité', { exact: true })).toBeFocused();
    await actionLigne(page, 'Actions de l’étape 1', 'Supprimer');
    await expect(lignesEtapes(page)).toHaveCount(1);
    await expect(etape(page, 1)).toBeFocused();
  });

  test('Entrée, Maj+Entrée et Retour arrière dans les lignes', async ({ page }) => {
    await page.goto('./#/nouvelle');

    // Ingrédients : Entrée depuis le nom ou la précision, pas depuis la quantité
    await ingredient(page, 1).getByLabel('Quantité', { exact: true }).fill('2');
    await page.keyboard.press('Enter');
    await expect(lignesIngredients(page)).toHaveCount(1);
    await expect(page).toHaveURL(/#\/nouvelle$/); // le formulaire n'est pas envoyé
    await ingredient(page, 1).getByLabel('Nom', { exact: true }).fill('œufs');
    await page.keyboard.press('Enter');
    await expect(lignesIngredients(page)).toHaveCount(2);
    await expect(ingredient(page, 2).getByLabel('Quantité', { exact: true })).toBeFocused();
    await page.keyboard.type('100');
    await ingredient(page, 2).getByLabel('Précision').fill('fondu');
    await page.keyboard.press('Enter');
    await expect(ingredient(page, 3).getByLabel('Quantité', { exact: true })).toBeFocused();
    // Entrée au milieu de la liste insère la ligne juste après
    await ingredient(page, 1).getByLabel('Nom', { exact: true }).press('Enter');
    await expect(lignesIngredients(page)).toHaveCount(4);
    await expect(ingredient(page, 2).getByLabel('Quantité', { exact: true })).toBeFocused();
    await expect(ingredient(page, 3).getByLabel('Quantité', { exact: true })).toHaveValue('100');

    // Retour arrière dans une ligne vide : elle disparaît, le focus remonte en fin de ligne
    await page.keyboard.press('Backspace');
    await expect(lignesIngredients(page)).toHaveCount(3);
    await expect(ingredient(page, 1).getByLabel('Précision')).toBeFocused();
    // Une ligne qui contient du texte (même une unité seule) n'est pas supprimée
    await ingredient(page, 3).getByLabel('Unité', { exact: true }).fill('g');
    await ingredient(page, 3).getByLabel('Quantité', { exact: true }).press('Backspace');
    await expect(lignesIngredients(page)).toHaveCount(3);
    await ingredient(page, 3).getByLabel('Unité', { exact: true }).fill('');
    await ingredient(page, 3).getByLabel('Unité', { exact: true }).press('Backspace');
    await expect(lignesIngredients(page)).toHaveCount(2);
    await expect(ingredient(page, 2).getByLabel('Précision')).toBeFocused();
    await page.keyboard.type(' et refroidi');
    await expect(ingredient(page, 2).getByLabel('Précision')).toHaveValue('fondu et refroidi');
    // La première ligne n'est jamais supprimée ainsi
    await ingredient(page, 1).getByLabel('Nom', { exact: true }).fill('');
    await ingredient(page, 1).getByLabel('Quantité', { exact: true }).fill('');
    await page.keyboard.press('Backspace');
    await expect(lignesIngredients(page)).toHaveCount(2);

    // Étapes : Entrée crée l'étape suivante, Maj+Entrée insère un retour à la ligne
    await etape(page, 1).click();
    await page.keyboard.type('Couper');
    await page.keyboard.press('Enter');
    await expect(etape(page, 2)).toBeFocused();
    await page.keyboard.type('Cuire');
    await page.keyboard.press('Shift+Enter');
    await page.keyboard.type('doucement');
    await expect(etape(page, 2)).toHaveValue('Cuire\ndoucement');
    await expect(lignesEtapes(page)).toHaveCount(2);
    await page.keyboard.press('Enter');
    await expect(etape(page, 3)).toBeFocused();
    await page.keyboard.press('Backspace');
    await expect(lignesEtapes(page)).toHaveCount(2);
    await expect(etape(page, 2)).toBeFocused();
    await page.keyboard.type('.');
    await expect(etape(page, 2)).toHaveValue('Cuire\ndoucement.');
  });

  test('coller des étapes : une par paragraphe, ou une par ligne', async ({ page, context, browserName }) => {
    test.skip(browserName !== 'chromium', 'presse-papiers piloté par les permissions de Chromium');
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await page.goto('./#/nouvelle');
    await page.evaluate((texte) => navigator.clipboard.writeText(texte),
      '1. Préchauffer le four.\nBeurrer le moule.\n\n2. Verser la pâte.\n\n3. Cuire 30 min.');
    await etape(page, 1).click();
    await page.keyboard.press('ControlOrMeta+V');
    await expect(lignesEtapes(page)).toHaveCount(3);
    await expect(etape(page, 1)).toHaveValue('Préchauffer le four. Beurrer le moule.');
    await expect(etape(page, 2)).toHaveValue('Verser la pâte.');
    await expect(etape(page, 3)).toHaveValue('Cuire 30 min.');
    await expect(etape(page, 3)).toBeFocused();

    await page.evaluate((texte) => navigator.clipboard.writeText(texte), '- Démouler\n- Servir tiède');
    await page.getByRole('button', { name: 'Ajouter une étape' }).click();
    await page.keyboard.press('ControlOrMeta+V');
    await expect(lignesEtapes(page)).toHaveCount(5);
    await expect(etape(page, 4)).toHaveValue('Démouler');
    await expect(etape(page, 5)).toHaveValue('Servir tiède');

    // Une seule ligne se colle normalement, dans le champ
    await page.evaluate((texte) => navigator.clipboard.writeText(texte), ' avec une salade');
    await page.keyboard.press('ControlOrMeta+V');
    await expect(etape(page, 5)).toHaveValue('Servir tiède avec une salade');
  });

  test('Monter et Descendre réordonnent les lignes et annoncent la position', async ({ page }) => {
    await page.goto('./#/nouvelle');
    for (const [index, nom] of ['farine', 'sucre', 'beurre'].entries()) {
      if (index > 0) await page.getByRole('button', { name: 'Ajouter un ingrédient' }).click();
      await ingredient(page, index + 1).getByLabel('Nom', { exact: true }).fill(nom);
    }
    const noms = page.locator('.ligne-ingredient__nom');

    // La première ligne ne peut pas monter, la dernière ne peut pas descendre
    await page.getByRole('button', { name: 'Actions de l’ingrédient 1' }).click();
    await expect(page.getByRole('button', { name: 'Monter', exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Descendre', exact: true })).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('button', { name: 'Actions de l’ingrédient 1' })).toBeFocused();

    await actionLigne(page, 'Actions de l’ingrédient 3', 'Monter');
    await expect.poll(() => valeurs(noms)).toEqual(['farine', 'beurre', 'sucre']);
    // Le focus suit la ligne déplacée ; la nouvelle position est annoncée
    await expect(page.getByRole('button', { name: 'Actions de l’ingrédient 2' })).toBeFocused();
    const annonce = page.locator('.lignes').first().locator('xpath=following-sibling::p[@aria-live]');
    await expect(annonce).toHaveText('Ingrédient déplacé en position 2 sur 3.');

    // Au clavier : flèches dans le menu, Entrée pour choisir
    await page.keyboard.press('Enter');
    await page.keyboard.press('ArrowDown');
    await expect(page.getByRole('button', { name: 'Descendre', exact: true })).toBeFocused();
    await page.keyboard.press('Enter');
    await expect.poll(() => valeurs(noms)).toEqual(['farine', 'sucre', 'beurre']);
    await expect(annonce).toHaveText('Ingrédient déplacé en position 3 sur 3.');

    // Étapes
    await etape(page, 1).fill('Un');
    await page.getByRole('button', { name: 'Ajouter une étape' }).click();
    await etape(page, 2).fill('Deux');
    await actionLigne(page, 'Actions de l’étape 2', 'Monter');
    await expect.poll(() => valeurs(lignesEtapes(page).locator('textarea'))).toEqual(['Deux', 'Un']);
    await expect(page.locator('.ligne-etape__numero')).toHaveText(['1', '2']);
  });

  test('basculer entre ligne libre et champs détaillés', async ({ page }) => {
    await page.goto('./#/nouvelle');
    await ingredient(page, 1).getByLabel('Nom', { exact: true }).fill('ail');
    await ingredient(page, 1).getByLabel('Quantité', { exact: true }).fill('2');
    await ingredient(page, 1).getByLabel('Unité', { exact: true }).fill('gousse');
    await ingredient(page, 1).getByLabel('Précision').fill('écrasées');

    await actionLigne(page, 'Actions de l’ingrédient 1', 'Saisir en une ligne');
    const libre = ingredient(page, 1).getByLabel(LIBRE);
    await expect(libre).toBeFocused();
    await expect(libre).toHaveValue('2 gousses d’ail, écrasées');
    await expect(ingredient(page, 1).getByLabel('Quantité', { exact: true })).toBeHidden();

    // La saisie est analysée à la sortie du champ
    await libre.fill('3 c. à soupe d’huile d’olive (vierge)');
    await libre.blur();
    await expect(libre).toHaveValue('3 c. à s. huile d’olive, vierge');
    // Les nouvelles lignes suivent le dernier mode choisi
    await libre.press('Enter');
    await expect(ingredient(page, 2).getByLabel(LIBRE)).toBeFocused();

    await actionLigne(page, 'Actions de l’ingrédient 1', 'Saisir en champs détaillés');
    await expect(ingredient(page, 1).getByLabel('Quantité', { exact: true })).toBeFocused();
    await verifierIngredient(page, 1, { quantite: '3', unite: 'c. à s.', nom: 'huile d’olive', precision: 'vierge' });
  });
});

test('glisser-déposer une ligne avec la poignée (souris ou doigt)', async ({ page, isMobile }) => {
  await page.goto('./#/nouvelle');
  await champTitre(page).fill('Ordre');
  for (const [index, texte] of ['Un', 'Deux', 'Trois'].entries()) {
    if (index > 0) await page.getByRole('button', { name: 'Ajouter une étape' }).click();
    await etape(page, index + 1).fill(texte);
  }
  const zones = lignesEtapes(page).locator('textarea');
  const poignees = page.locator('.lignes').nth(1).locator('.ligne__poignee');
  await poignees.first().scrollIntoViewIfNeeded();
  const depart = await poignees.nth(0).boundingBox();
  const arrivee = await poignees.nth(2).boundingBox();
  const x = depart.x + depart.width / 2;
  const y0 = depart.y + depart.height / 2;
  const y1 = arrivee.y + arrivee.height / 2 + 30;

  if (isMobile) {
    // Doigt : événements tactiles bruts, que Chromium convertit en Pointer Events
    const cdp = await page.context().newCDPSession(page);
    const toucher = (type, y) => cdp.send('Input.dispatchTouchEvent', {
      type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }],
    });
    await toucher('touchStart', y0);
    for (let i = 1; i <= 10; i++) await toucher('touchMove', y0 + ((y1 - y0) * i) / 10);
    await expect(page.locator('.ligne--glissee')).toHaveCount(1); // retour visuel
    await toucher('touchEnd', y1);
  } else {
    await page.mouse.move(x, y0);
    await page.mouse.down();
    for (let i = 1; i <= 10; i++) await page.mouse.move(x, y0 + ((y1 - y0) * i) / 10);
    await expect(page.locator('.ligne--glissee')).toHaveCount(1); // retour visuel
    await page.mouse.up();
  }
  await expect(page.locator('.ligne--glissee')).toHaveCount(0);
  await expect.poll(() => valeurs(zones)).toEqual(['Deux', 'Trois', 'Un']);
  await expect(page.locator('.ligne-etape__numero')).toHaveText(['1', '2', '3']);
  await expect(page.locator('.lignes').nth(1).locator('xpath=following-sibling::p[@aria-live]'))
    .toHaveText('Étape déplacée en position 3 sur 3.');

  await remplirIngredient(page, 1, { nom: 'farine', libre: 'farine' });
  await enregistrer(page).click();
  await expect(page.locator('.etape__texte')).toHaveText(['Deux', 'Trois', 'Un']);
});

test.describe('modifications non enregistrées', () => {
  test.use({ viewport: { width: 1024, height: 800 } });

  test('Annuler et le bouton retour demandent confirmation', async ({ page }) => {
    await chargerExemples(page);
    await page.goto('./#/recette/exemple-tarte-poireaux');
    await expect(titreEcran(page)).toHaveText('Tarte aux poireaux');
    await page.goto('./#/edition/exemple-tarte-poireaux');
    await expect(champTitre(page)).toHaveValue('Tarte aux poireaux');

    // Sans modification, on part sans question
    await page.goBack();
    await expect(titreEcran(page)).toHaveText('Tarte aux poireaux');
    await page.goForward();
    await expect(champTitre(page)).toHaveValue('Tarte aux poireaux');

    // Bouton retour : le formulaire reste affiché tant qu'on n'a pas répondu
    await champTitre(page).fill('Tarte modifiée');
    await page.goBack();
    await expect(dialogueSortie(page)).toBeVisible();
    await expect(page).toHaveURL(/#\/edition\/exemple-tarte-poireaux$/);
    await expect(dialogueSortie(page).getByRole('button', { name: 'Continuer la saisie' })).toBeFocused();
    await dialogueSortie(page).getByRole('button', { name: 'Continuer la saisie' }).click();
    await expect(dialogueSortie(page)).toBeHidden();
    await expect(champTitre(page)).toHaveValue('Tarte modifiée');
    await expect(page).toHaveURL(/#\/edition\/exemple-tarte-poireaux$/);

    // Annuler : même question
    await page.getByRole('button', { name: 'Annuler' }).click();
    await expect(dialogueSortie(page)).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(dialogueSortie(page)).toBeHidden();
    await expect(page.getByRole('button', { name: 'Annuler' })).toBeFocused();

    // Quitter : retour à la fiche, rien n'est enregistré, le brouillon est effacé
    await page.goBack();
    await dialogueSortie(page).getByRole('button', { name: 'Quitter' }).click();
    await expect(page).toHaveURL(/#\/recette\/exemple-tarte-poireaux$/);
    await expect(titreEcran(page)).toHaveText('Tarte aux poireaux');
    await expect.poll(() => lireReglage(page, 'brouillon:exemple-tarte-poireaux')).toBeUndefined();

    // Annuler, puis Quitter
    await page.goto('./#/nouvelle');
    await champTitre(page).fill('Brouillon');
    await page.getByRole('button', { name: 'Annuler' }).click();
    await dialogueSortie(page).getByRole('button', { name: 'Quitter' }).click();
    await expect(page).toHaveURL(/#\/$/);
    await expect(page.locator('.grille-recettes .carte-recette')).toHaveCount(6);
  });

  test('fermer l’onglet avec des modifications déclenche l’alerte du navigateur', async ({ page }) => {
    await page.goto('./#/nouvelle');
    await champTitre(page).click();
    await page.keyboard.type('Gratin');
    const dialogue = page.waitForEvent('dialog');
    page.close({ runBeforeUnload: true });
    const alerte = await dialogue;
    expect(alerte.type()).toBe('beforeunload');
    await alerte.accept();
  });

  test('le brouillon est enregistré, proposé à la réouverture, puis effacé à l’enregistrement', async ({ page }) => {
    // Le rechargement passe outre l'alerte de fermeture
    page.on('dialog', (dialogue) => dialogue.accept());
    await page.goto('./#/nouvelle');
    await champTitre(page).fill('Soupe de saison');
    await remplirIngredient(page, 1, { quantite: '1', unite: 'kg', nom: 'courge' });
    await page.getByRole('textbox', { name: 'Nouvelle catégorie' }).fill('Hiver');
    await page.getByRole('button', { name: 'Créer' }).click();
    // Le brouillon suit la dernière modification (500 ms après)
    await expect.poll(() => lireReglage(page, 'brouillon:nouvelle').then((b) => b?.etat))
      .toMatchObject({ titre: 'Soupe de saison', categories: ['Hiver'] });

    // Réouverture : le bandeau propose le brouillon
    await page.reload();
    const bandeau = page.getByRole('region', { name: 'Brouillon retrouvé' });
    await expect(bandeau).toBeVisible();
    await expect(champTitre(page)).toHaveValue('');
    await bandeau.getByRole('button', { name: 'Reprendre le brouillon' }).click();
    await expect(bandeau).toBeHidden();
    await expect(champTitre(page)).toHaveValue('Soupe de saison');
    await expect(champTitre(page)).toBeFocused();
    await verifierIngredient(page, 1, { quantite: '1', unite: 'kg', nom: 'courge' });
    await expect(page.getByRole('button', { name: 'Hiver' })).toHaveAttribute('aria-pressed', 'true');

    // Enregistrer efface le brouillon
    await etape(page, 1).fill('Cuire et mixer.');
    await enregistrer(page).click();
    await expect(titreEcran(page)).toHaveText('Soupe de saison');
    await expect.poll(() => lireReglage(page, 'brouillon:nouvelle')).toBeUndefined();
    await page.goto('./#/nouvelle');
    await expect(champTitre(page)).toBeVisible();
    await expect(page.getByRole('region', { name: 'Brouillon retrouvé' })).toHaveCount(0);
  });

  test('« Ignorer » efface le brouillon d’une recette modifiée', async ({ page }) => {
    page.on('dialog', (dialogue) => dialogue.accept());
    await chargerExemples(page);
    await page.goto('./#/edition/exemple-veloute-potimarron');
    await page.getByRole('textbox', { name: 'Notes' }).fill('Avec des graines de courge.');
    await expect.poll(() => lireReglage(page, 'brouillon:exemple-veloute-potimarron').then((b) => b?.etat?.notes))
      .toBe('Avec des graines de courge.');

    await page.reload();
    const bandeau = page.getByRole('region', { name: 'Brouillon retrouvé' });
    await bandeau.getByRole('button', { name: 'Ignorer' }).click();
    await expect(bandeau).toBeHidden();
    await expect(page.getByRole('textbox', { name: 'Notes' })).not.toHaveValue('Avec des graines de courge.');
    await expect.poll(() => lireReglage(page, 'brouillon:exemple-veloute-potimarron')).toBeUndefined();
    // Rien n'a été modifié : on peut partir sans confirmation
    await page.getByRole('button', { name: 'Annuler' }).click();
    await expect(titreEcran(page)).toHaveText('Velouté de potimarron');
  });

  test('Annuler revient à la fiche sans rien enregistrer ; les champs non affichés sont conservés', async ({ page }) => {
    await chargerExemples(page);
    const avant = await page.evaluate(() => import('./js/db.js').then((db) => db.lireRecette('exemple-tarte-poireaux')));
    await page.goto('./#/recette/exemple-tarte-poireaux');
    await page.getByRole('button', { name: 'Favori' }).click();
    await expect(page.getByRole('button', { name: 'Favori' })).toHaveAttribute('aria-pressed', 'true');

    await page.goto('./#/edition/exemple-tarte-poireaux');
    await expect(lignesIngredients(page)).toHaveCount(8);
    await expect(ingredient(page, 8).getByLabel('Quantité', { exact: true })).toHaveValue('');
    await page.getByRole('button', { name: 'Annuler' }).click();
    await expect(page).toHaveURL(/#\/recette\/exemple-tarte-poireaux$/);

    // Enregistrer sans changement : section, minuteur, favori et date de création conservés
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
});
