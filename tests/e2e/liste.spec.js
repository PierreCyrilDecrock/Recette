// E1 — Liste des recettes et onglet Favoris : état vide, exemples, recherche, puces, tri.
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

const NOMBRE_EXEMPLES = 6;

const cartes = (page) => page.locator('.grille-recettes .carte-recette');
const titresCartes = (page) => page.locator('.grille-recettes .carte-recette__titre');
const recherche = (page) => page.getByRole('searchbox', { name: 'Rechercher une recette' });
const compte = (page) => page.getByRole('status');

/** Ouvre l'accueil (base vide) et charge les recettes d'exemple. */
async function chargerExemples(page) {
  await page.goto('./#/');
  await page.getByRole('button', { name: 'Charger des exemples' }).click();
  await expect(cartes(page)).toHaveCount(NOMBRE_EXEMPLES);
}

for (const largeur of [360, 768, 1280]) {
  test.describe(`à ${largeur} px`, () => {
    test.use({ viewport: { width: largeur, height: 900 } });

    test('état vide, exemples, puis recherche insensible à la casse et aux accents', async ({ page }) => {
      await page.goto('./#/');

      // État vide illustré, sans outils de recherche
      await expect(page.getByRole('heading', { level: 2, name: 'Votre carnet est encore vide' })).toBeVisible();
      await expect(page.getByRole('link', { name: 'Créer ma première recette' })).toHaveAttribute('href', '#/nouvelle');
      await expect(page.locator('.etat-vide__illustration')).toBeVisible();
      await expect(recherche(page)).toBeHidden();

      // Chargement des exemples : la grille apparaît, le nombre est annoncé
      await page.getByRole('button', { name: 'Charger des exemples' }).click();
      await expect(cartes(page)).toHaveCount(NOMBRE_EXEMPLES);
      await expect(compte(page)).toHaveText(`${NOMBRE_EXEMPLES} recettes`);
      await expect(compte(page)).toHaveAttribute('aria-live', 'polite');
      await expect(page.getByRole('heading', { name: 'Votre carnet est encore vide' })).toHaveCount(0);

      // Grille : 2 colonnes sous 768 px, 3 jusqu'à 1024 px ; au-delà, la liste partage
      // l'écran avec la fiche (volet de gauche) et revient à 2 colonnes
      const colonnes = await page.locator('.grille-recettes').evaluate(
        (grille) => getComputedStyle(grille).gridTemplateColumns.split(' ').length,
      );
      expect(colonnes).toBe(largeur < 768 ? 2 : largeur < 1024 ? 3 : 2);

      // Aucun défilement horizontal de la page
      const debordement = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(debordement).toBeLessThanOrEqual(0);

      for (const requete of ['poireau', 'POIREAU', 'poireâu']) {
        await recherche(page).fill(requete);
        await expect(titresCartes(page)).toHaveText(['Tarte aux poireaux']);
        await expect(compte(page)).toHaveText('1 recette');
      }
    });
  });
}

test('la carte affiche le titre, le temps total, la difficulté et mène à la fiche', async ({ page }) => {
  await chargerExemples(page);
  await recherche(page).fill('poireau');
  const carte = cartes(page).first();
  await expect(carte).toHaveAttribute('href', '#/recette/exemple-tarte-poireaux');
  await expect(carte.locator('.carte-recette__temps')).toHaveText(/55\s?min/);
  await expect(carte.getByRole('img', { name: 'Difficulté : facile' })).toBeVisible();
  // Une toque remplie sur trois
  await expect(carte.locator('.difficulte__toque')).toHaveCount(3);
  await expect(carte.locator('.difficulte__toque--pleine')).toHaveCount(1);
  await expect(carte.locator('.visuel__initiale')).toHaveText('T');

  // Le visuel par défaut est stable : même couleur après rechargement
  const fond = () => carte.locator('.visuel').evaluate((v) => getComputedStyle(v).backgroundImage);
  const avant = await fond();
  await page.reload();
  await recherche(page).fill('poireau');
  expect(await fond()).toBe(avant);

  await carte.click();
  await expect(page).toHaveURL(/#\/recette\/exemple-tarte-poireaux$/);
});

test('une recherche sans résultat propose de l’effacer', async ({ page }) => {
  await chargerExemples(page);
  await recherche(page).fill('pizza');
  await expect(cartes(page)).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Aucune recette pour « pizza »' })).toBeVisible();
  await expect(compte(page)).toHaveText('Aucune recette');

  await page.getByRole('button', { name: 'Effacer la recherche' }).click();
  await expect(recherche(page)).toHaveValue('');
  await expect(recherche(page)).toBeFocused();
  await expect(cartes(page)).toHaveCount(NOMBRE_EXEMPLES);
});

test('les puces de catégories filtrent en sélection unique', async ({ page }) => {
  await chargerExemples(page);
  const puces = page.getByRole('group', { name: 'Filtrer par catégorie' });
  const toutes = puces.getByRole('button', { name: 'Toutes' });
  const dessert = puces.getByRole('button', { name: 'Dessert' });
  const plat = puces.getByRole('button', { name: 'Plat' });

  await expect(toutes).toHaveAttribute('aria-pressed', 'true');
  await dessert.click();
  await expect(dessert).toHaveAttribute('aria-pressed', 'true');
  await expect(toutes).toHaveAttribute('aria-pressed', 'false');
  await expect(titresCartes(page)).toHaveText(['Crème brûlée']);

  await plat.click();
  await expect(plat).toHaveAttribute('aria-pressed', 'true');
  await expect(dessert).toHaveAttribute('aria-pressed', 'false');
  await expect(puces.locator('[aria-pressed="true"]')).toHaveCount(1);
  await expect(titresCartes(page)).toContainText(['Tarte aux poireaux']);

  // La recherche se combine avec la catégorie
  await recherche(page).fill('gratin');
  await expect(titresCartes(page)).toHaveText(['Gratin dauphinois']);

  await toutes.click();
  await recherche(page).fill('');
  await expect(cartes(page)).toHaveCount(NOMBRE_EXEMPLES);
});

test('le tri est appliqué et mémorisé dans les réglages', async ({ page }) => {
  await chargerExemples(page);
  const tri = page.getByRole('combobox', { name: 'Trier par' });
  await expect(tri).toHaveValue('date');

  await tri.selectOption('titre');
  await expect(titresCartes(page)).toHaveText([
    'Bœuf bourguignon', 'Crème brûlée', 'Gratin dauphinois',
    'Salade de chèvre chaud', 'Tarte aux poireaux', 'Velouté de potimarron',
  ]);

  await tri.selectOption('temps');
  await expect(titresCartes(page).first()).toHaveText('Salade de chèvre chaud');
  await expect(titresCartes(page).last()).toHaveText('Bœuf bourguignon');

  await page.reload();
  await expect(tri).toHaveValue('temps');
  await expect(titresCartes(page).first()).toHaveText('Salade de chèvre chaud');
});

test('l’onglet Favoris a son état vide, puis ne liste que les favoris', async ({ page }) => {
  await chargerExemples(page);
  await page.goto('./#/favoris');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Favoris');
  await expect(page.getByRole('heading', { level: 2, name: 'Pas encore de favori' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Voir mes recettes' })).toHaveAttribute('href', '#/');
  await expect(page.getByRole('button', { name: 'Charger des exemples' })).toHaveCount(0);

  // Le bouton favori de la fiche arrive à l'étape 5 : on passe par db.js
  await page.evaluate(async () => {
    const db = await import('./js/db.js');
    await db.basculerFavori('exemple-creme-brulee');
  });
  await page.reload();
  await expect(titresCartes(page)).toHaveText(['Crème brûlée']);
  await expect(cartes(page).first().getByText('Favori')).toBeAttached();

  // La liste complète signale aussi le favori
  await page.goto('./#/');
  await expect(cartes(page)).toHaveCount(NOMBRE_EXEMPLES);
  await expect(page.locator('.carte-recette__favori')).toHaveCount(1);
});

test('le bouton « + » mène à #/nouvelle', async ({ page }) => {
  await page.goto('./#/');
  await page.getByRole('link', { name: 'Nouvelle recette' }).click();
  await expect(page).toHaveURL(/#\/nouvelle$/);
});

test('les cibles tactiles de la liste mesurent au moins 44 px', async ({ page }) => {
  await chargerExemples(page);
  await page.locator('#app .ecran').evaluateAll((ecrans) => Promise.all(ecrans.flatMap((e) => e.getAnimations()).map((a) => a.finished)));
  const cibles = page.locator('#app a, #app button, #app select, #app input');
  const nombre = await cibles.count();
  expect(nombre).toBeGreaterThan(NOMBRE_EXEMPLES);
  for (let i = 0; i < nombre; i++) {
    const boite = await cibles.nth(i).boundingBox();
    expect(boite.width).toBeGreaterThanOrEqual(44);
    expect(boite.height).toBeGreaterThanOrEqual(44);
  }
});
