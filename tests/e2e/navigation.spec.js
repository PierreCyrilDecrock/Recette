// Squelette de l'application : routeur, barre d'onglets, bouton « + », thèmes.
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

const onglet = (page, nom) => page.getByRole('navigation', { name: 'Navigation principale' }).getByRole('link', { name: nom });

test("l'accueil affiche la liste avec l'onglet Recettes actif", async ({ page }) => {
  await page.goto('./');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Mes recettes');
  await expect(page).toHaveTitle('Mes recettes — Recette');
  await expect(onglet(page, 'Recettes')).toHaveAttribute('aria-current', 'page');
  await expect(onglet(page, 'Favoris')).not.toHaveAttribute('aria-current');
  await expect(page.getByRole('link', { name: 'Nouvelle recette' })).toBeVisible();
});

test("les onglets naviguent, déplacent aria-current et le focus", async ({ page }) => {
  await page.goto('./#/');
  await onglet(page, 'Favoris').click();
  await expect(page).toHaveURL(/#\/favoris$/);
  const titre = page.getByRole('heading', { level: 1 });
  await expect(titre).toHaveText('Favoris');
  await expect(titre).toBeFocused();
  await expect(onglet(page, 'Favoris')).toHaveAttribute('aria-current', 'page');
  await expect(onglet(page, 'Recettes')).not.toHaveAttribute('aria-current');

  await onglet(page, 'Réglages').click();
  await expect(titre).toHaveText('Réglages');
  await expect(onglet(page, 'Réglages')).toHaveAttribute('aria-current', 'page');

  // Le bouton retour du navigateur revient à l'écran précédent
  await page.goBack();
  await expect(titre).toHaveText('Favoris');
  await expect(onglet(page, 'Favoris')).toHaveAttribute('aria-current', 'page');
});

test("le bouton « + » ouvre l'édition et masque la navigation", async ({ page }) => {
  await page.goto('./#/');
  await page.getByRole('link', { name: 'Nouvelle recette' }).click();
  await expect(page).toHaveURL(/#\/nouvelle$/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Nouvelle recette');
  await expect(page.locator('.barre-onglets')).toBeHidden();
  await expect(page.locator('.bouton-flottant')).toBeHidden();

  await page.goBack();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Mes recettes');
  await expect(page.locator('.barre-onglets')).toBeVisible();
  await expect(page.locator('.bouton-flottant')).toBeVisible();
});

test('les routes à paramètre transmettent leur identifiant et leur requête', async ({ page }) => {
  await page.goto('./#/recette/tarte%20aux%20poireaux');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Recette introuvable');
  // La fiche n'est pas un onglet : aucun n'est actif
  await expect(page.locator('.barre-onglets [aria-current]')).toHaveCount(0);

  // Une requête inconnue est sans effet sur l'écran
  await page.goto('./#/reglages?section=theme');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Réglages');
  await expect(onglet(page, 'Réglages')).toHaveAttribute('aria-current', 'page');

  // Mode cuisine : immersif, même pour un identifiant inconnu
  await page.goto('./#/cuisine/tarte%20aux%20poireaux?portions=6');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Recette introuvable');
  await expect(page.locator('.barre-onglets')).toBeHidden();
  await expect(page.locator('.bouton-flottant')).toBeHidden();

  // Identifiant inconnu : l'édition l'annonce, sans afficher le formulaire
  await page.goto('./#/edition/42');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Recette introuvable');
  await expect(page.locator('.barre-onglets')).toBeHidden();
});

test("une route inconnue renvoie vers l'accueil", async ({ page }) => {
  for (const hash of ['#/inconnue', '#/recette/', '#/recette/%E0']) {
    await page.goto(`./${hash}`);
    await expect(page).toHaveURL(/#\/$/);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Mes recettes');
  }
});

test('le thème suit le système et peut être forcé', async ({ page }) => {
  const fond = () => page.evaluate(() => getComputedStyle(document.body).backgroundColor);

  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto('./');
  expect(await fond()).toBe('rgb(250, 246, 242)');

  await page.emulateMedia({ colorScheme: 'dark' });
  expect(await fond()).toBe('rgb(23, 19, 17)');

  // data-theme force le thème, quel que soit le réglage du système
  await page.evaluate(() => { document.documentElement.dataset.theme = 'clair'; });
  expect(await fond()).toBe('rgb(250, 246, 242)');

  await page.emulateMedia({ colorScheme: 'light' });
  await page.evaluate(() => { document.documentElement.dataset.theme = 'sombre'; });
  expect(await fond()).toBe('rgb(23, 19, 17)');
});

test('les cibles tactiles de la coquille mesurent au moins 44 px', async ({ page }) => {
  await page.goto('./');
  // Attendre la fin de l'animation d'apparition de l'écran : pendant le glissement,
  // la position sous-pixel fausse la mesure (43,99997 px au lieu de 44).
  await page.locator('#app .ecran').evaluate((ecran) => Promise.all(ecran.getAnimations().map((a) => a.finished)));
  const cibles = page.locator('.barre-onglets a, .bouton-flottant, .entete a, #app a, #app button');
  const nombre = await cibles.count();
  expect(nombre).toBeGreaterThan(0);
  for (let i = 0; i < nombre; i++) {
    const boite = await cibles.nth(i).boundingBox();
    expect(boite.width).toBeGreaterThanOrEqual(44);
    expect(boite.height).toBeGreaterThanOrEqual(44);
  }
});
