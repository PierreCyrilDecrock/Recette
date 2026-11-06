// E5 — Réglages : thème, catégories, export / import / effacement, à propos.
import { readFile } from 'node:fs/promises';
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

/** Ouvre l'accueil (base vide), charge les exemples, puis ouvre les réglages. */
async function preparer(page) {
  await page.goto('./#/');
  await page.getByRole('button', { name: 'Charger des exemples' }).click();
  await expect(page.locator('.carte-recette')).toHaveCount(NOMBRE_EXEMPLES);
  await page.goto('./#/reglages');
  await expect(page.getByRole('heading', { level: 1, name: 'Réglages' })).toBeVisible();
}

/** Photographie des données, lue par js/db.js (le même module que l'app). */
const lireDonnees = (page) => page.evaluate(async () => {
  const db = await import('./js/db.js');
  return {
    recettes: await db.listerRecettes(),
    favoris: (await db.listerRecettes({ favoris: true })).map((r) => r.id),
    categories: await db.listerCategories(),
  };
});

const toast = (page) => page.locator('.toast').last();
const dialogue = (page) => page.getByRole('dialog');
const lignesCategories = (page) => page.locator('.reglages__categorie');

/** Contenu JSON d'un fichier à importer. */
const fichierJson = (nom, contenu) => ({
  name: nom,
  mimeType: 'application/json',
  buffer: Buffer.from(typeof contenu === 'string' ? contenu : JSON.stringify(contenu)),
});

test('aller-retour : exemples → export → tout effacer → import, recettes identiques', async ({ page }, testInfo) => {
  await preparer(page);
  // Un favori et une catégorie sans recette, pour vérifier qu'ils reviennent aussi
  await page.evaluate(async () => {
    const db = await import('./js/db.js');
    await db.basculerFavori('exemple-creme-brulee');
  });
  await page.getByLabel('Nouvelle catégorie').fill('Apéritif');
  await page.getByRole('button', { name: 'Créer' }).click();
  await expect(lignesCategories(page)).toHaveCount(6);
  const avant = await lireDonnees(page);
  expect(avant.recettes).toHaveLength(NOMBRE_EXEMPLES);
  expect(avant.favoris).toEqual(['exemple-creme-brulee']);

  // --- Export : recettes-AAAA-MM-JJ.json au format attendu ---
  const telechargement = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Exporter mes recettes' }).click();
  const fichier = await telechargement;
  expect(fichier.suggestedFilename()).toMatch(/^recettes-\d{4}-\d{2}-\d{2}\.json$/);
  const chemin = testInfo.outputPath(fichier.suggestedFilename());
  await fichier.saveAs(chemin);
  const contenu = JSON.parse(await readFile(chemin, 'utf8'));
  expect(Object.keys(contenu)).toEqual(['app', 'version', 'dateExport', 'recettes', 'categories']);
  expect(contenu).toMatchObject({ app: 'recette', version: 1 });
  expect(contenu.recettes).toHaveLength(NOMBRE_EXEMPLES);
  await expect(toast(page)).toHaveText('6 recettes exportées.');

  // --- Tout effacer : double confirmation, la seconde exige « EFFACER » ---
  const boutonEffacer = page.getByRole('button', { name: 'Tout effacer' });
  await boutonEffacer.click();
  await expect(dialogue(page)).toContainText('Vos 6 recettes');
  await expect(dialogue(page).getByRole('button', { name: 'Annuler' })).toBeFocused();
  await dialogue(page).getByRole('button', { name: 'Continuer' }).click();

  const confirmer = dialogue(page).getByRole('button', { name: 'Effacer définitivement' });
  const saisie = dialogue(page).getByLabel('Mot de confirmation');
  await expect(saisie).toBeFocused();
  await expect(confirmer).toBeDisabled();
  await saisie.fill('effacer');
  await expect(confirmer).toBeDisabled();
  await saisie.fill('EFFACER');
  await expect(confirmer).toBeEnabled();
  await confirmer.click();
  await expect(toast(page)).toHaveText('Toutes les données ont été effacées.');
  await expect(page.getByText('Aucune catégorie pour l’instant.')).toBeVisible();
  expect(await lireDonnees(page)).toEqual({ recettes: [], favoris: [], categories: [] });

  // --- Import du fichier exporté ---
  await page.getByLabel('Importer un fichier').setInputFiles(chemin);
  await expect(dialogue(page).getByRole('heading')).toHaveText('Importer ce fichier ?');
  await expect(dialogue(page)).toContainText('6 recettes.');
  await expect(dialogue(page).getByRole('button', { name: 'Annuler' })).toBeFocused();
  await dialogue(page).getByRole('button', { name: 'Fusionner' }).click();
  await expect(toast(page)).toHaveText('6 recettes importées.');
  await expect(lignesCategories(page)).toHaveCount(6);

  // Toutes les recettes reviennent à l'identique (dates, favori, catégories comprises)
  expect(await lireDonnees(page)).toEqual(avant);
  await page.goto('./#/');
  await expect(page.locator('.carte-recette')).toHaveCount(NOMBRE_EXEMPLES);
});

test('import : résumé, recettes déjà présentes, invalides listées, puis Remplacer', async ({ page }) => {
  await preparer(page);
  const { recettes } = await lireDonnees(page);
  const nouvelle = {
    ...recettes[0], id: 'importee', titre: 'Soupe importée', categories: ['Soupe'],
  };
  const contenu = {
    app: 'recette',
    version: 1,
    dateExport: new Date().toISOString(),
    recettes: [recettes[0], recettes[1], nouvelle, { id: 'ko', titre: 'Sans étapes', ingredients: [{ nom: 'sel' }], etapes: [] }],
    categories: ['Soupe'],
  };
  const champ = page.getByLabel('Importer un fichier');

  // Résumé, puis Annuler : rien ne change
  await champ.setInputFiles(fichierJson('sauvegarde.json', contenu));
  await expect(dialogue(page).locator('.reglages__resume')).toHaveText('3 recettes, dont 2 déjà présentes.');
  await expect(dialogue(page)).toContainText('1 recette invalide sera ignorée :');
  await expect(dialogue(page).locator('.reglages__invalides li')).toHaveText([
    'Recette n° 4 « Sans étapes » — Ajoutez au moins une étape.',
  ]);
  await dialogue(page).getByRole('button', { name: 'Annuler' }).click();
  await expect(dialogue(page)).toHaveCount(0);
  expect((await lireDonnees(page)).recettes).toHaveLength(NOMBRE_EXEMPLES);

  // Le même fichier peut être choisi de nouveau ; Remplacer ne garde que ses recettes
  await champ.setInputFiles(fichierJson('sauvegarde.json', contenu));
  await dialogue(page).getByRole('button', { name: 'Remplacer' }).click();
  await expect(toast(page)).toHaveText('3 recettes importées.');
  const apres = await lireDonnees(page);
  expect(apres.recettes.map((r) => r.id).sort()).toEqual([recettes[0].id, recettes[1].id, 'importee'].sort());
  await expect(page.locator('.reglages__categorie-nom')).toContainText(['Soupe']);
});

test('import : fichier illisible, autre format ou version plus récente refusés', async ({ page }) => {
  await preparer(page);
  const champ = page.getByLabel('Importer un fichier');

  await champ.setInputFiles(fichierJson('casse.json', '{ pas du json'));
  await expect(toast(page)).toHaveText('Ce fichier n’est pas un fichier JSON lisible.');

  await champ.setInputFiles(fichierJson('autre.json', { bonjour: 1 }));
  await expect(toast(page)).toHaveText('Ce fichier ne contient pas de recettes au format attendu.');

  await champ.setInputFiles(fichierJson('futur.json', { app: 'recette', version: 2, recettes: [] }));
  await expect(toast(page)).toContainText('version plus récente');

  // Aucune recette valide : le résumé le dit et ne propose que Fermer
  await champ.setInputFiles(fichierJson('vide.json', { app: 'recette', version: 1, recettes: [null] }));
  await expect(dialogue(page)).toContainText('Ce fichier ne contient aucune recette valide.');
  await expect(dialogue(page).getByRole('button')).toHaveText(['Fermer']);
  await dialogue(page).getByRole('button', { name: 'Fermer' }).click();
  expect((await lireDonnees(page)).recettes).toHaveLength(NOMBRE_EXEMPLES);
});

test('catégories : nombre de recettes, création, renommage en ligne, suppression', async ({ page }) => {
  await preparer(page);
  await expect(page.locator('.reglages__categorie-nom')).toHaveText(['Dessert', 'Entrée', 'Plat', 'Rapide', 'Végétarien']);
  await expect(page.locator('.reglages__categorie-nombre')).toHaveText(['1 recette', '2 recettes', '3 recettes', '1 recette', '4 recettes']);

  // Création : nom vide ou existant refusé sous le champ
  const nouvelle = page.getByLabel('Nouvelle catégorie');
  await page.getByRole('button', { name: 'Créer' }).click();
  await expect(nouvelle).toHaveAttribute('aria-invalid', 'true');
  await expect(page.locator('#reglages-nouvelle-categorie-erreur')).toHaveText('Donnez un nom à la catégorie.');
  await nouvelle.fill('Plat');
  await nouvelle.press('Enter');
  await expect(page.locator('#reglages-nouvelle-categorie-erreur')).toHaveText('La catégorie « Plat » existe déjà.');
  await nouvelle.fill('  Brunch ');
  await nouvelle.press('Enter');
  await expect(toast(page)).toHaveText('Catégorie « Brunch » créée.');
  await expect(nouvelle).toHaveValue('');
  await expect(lignesCategories(page).filter({ hasText: 'Brunch' })).toContainText('Aucune recette');

  // Renommage en ligne : Échap annule, Entrée valide (répercuté sur les recettes)
  await page.getByRole('button', { name: 'Renommer « Plat »' }).click();
  const champ = page.getByRole('textbox', { name: 'Nouveau nom de « Plat »' });
  await expect(champ).toBeFocused();
  await champ.fill('Autre chose');
  await champ.press('Escape');
  await expect(champ).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Renommer « Plat »' })).toBeFocused();

  await page.getByRole('button', { name: 'Renommer « Plat »' }).click();
  await champ.fill('Plats mijotés');
  await champ.press('Enter');
  await expect(toast(page)).toHaveText('« Plat » s’appelle maintenant « Plats mijotés ».');
  await expect(page.getByRole('button', { name: 'Renommer « Plats mijotés »' })).toBeFocused();
  await expect(lignesCategories(page).filter({ hasText: 'Plats mijotés' })).toContainText('3 recettes');
  const { recettes } = await lireDonnees(page);
  expect(recettes.filter((r) => r.categories.includes('Plats mijotés'))).toHaveLength(3);
  expect(recettes.some((r) => r.categories.includes('Plat'))).toBe(false);

  // Suppression : la confirmation donne le nombre de recettes concernées
  await page.getByRole('button', { name: 'Supprimer « Végétarien »' }).click();
  await expect(dialogue(page).getByRole('heading')).toHaveText('Supprimer « Végétarien » ?');
  await expect(dialogue(page)).toContainText('Elle sera retirée de 4 recettes, qui seront conservées.');
  await expect(dialogue(page).getByRole('button', { name: 'Annuler' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.locator('.reglages__categorie-nom')).toContainText(['Végétarien']);

  await page.getByRole('button', { name: 'Supprimer « Végétarien »' }).click();
  await dialogue(page).getByRole('button', { name: 'Supprimer' }).click();
  await expect(toast(page)).toHaveText('Catégorie « Végétarien » supprimée.');
  await expect(page.locator('.reglages__categorie-nom')).toHaveText(['Brunch', 'Dessert', 'Entrée', 'Plats mijotés', 'Rapide']);
  const apres = await lireDonnees(page);
  expect(apres.recettes).toHaveLength(NOMBRE_EXEMPLES);
  expect(apres.recettes.some((r) => r.categories.includes('Végétarien'))).toBe(false);
});

test('thème : appliqué tout de suite, mémorisé et posé avant le premier rendu', async ({ page }, testInfo) => {
  const fond = () => page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  const theme = (nom) => page.getByRole('group', { name: 'Thème' }).getByRole('radio', { name: nom });

  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto('./#/reglages');
  await expect(theme('Système')).toBeChecked();

  await theme('Sombre').check();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'sombre');
  expect(await fond()).toBe('rgb(23, 19, 17)');
  await expect(page.locator('meta[name="theme-color"]').first()).toHaveAttribute('content', '#171311');

  // Rechargement : le script en ligne de index.html applique le thème sans attendre app.js
  await page.route('**/js/app.js', (route) => route.abort());
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'sombre');
  expect(await fond()).toBe('rgb(23, 19, 17)');
  await page.unroute('**/js/app.js');
  // Le chargement bloqué de app.js est volontaire : on oublie son erreur de console
  testInfo.erreurs.length = 0;

  await page.reload();
  await expect(theme('Sombre')).toBeChecked();
  await theme('Clair').check();
  await page.emulateMedia({ colorScheme: 'dark' });
  expect(await fond()).toBe('rgb(246, 240, 234)');

  // Système : plus de thème forcé, on suit l'appareil
  await theme('Système').check();
  await expect(page.locator('html')).not.toHaveAttribute('data-theme');
  expect(await fond()).toBe('rgb(23, 19, 17)');
  expect(await page.evaluate(() => localStorage.getItem('recette.theme'))).toBeNull();
});

test('à propos : version, espace de stockage et persistance', async ({ page }) => {
  await page.goto('./#/reglages');
  const version = await page.evaluate(async () => (await import('./js/app.js')).VERSION);
  const valeur = (libelle) => page.locator('.reglages__info').filter({ hasText: libelle }).locator('dd');
  await expect(valeur('Version')).toHaveText(version);
  await expect(valeur('Espace utilisé')).toHaveText(/^[\d\s,]+\sMo$/);
  await expect(valeur('Espace disponible')).toHaveText(/^[\d\s,]+\sMo$/);
  await expect(valeur('Stockage persistant')).toHaveText(/^(Accordé|Non accordé)/);
});

for (const largeur of [360, 1024]) {
  test(`à ${largeur} px : cibles tactiles d'au moins 44 px, sans défilement horizontal`, async ({ page }) => {
    await page.setViewportSize({ width: largeur, height: 900 });
    await preparer(page);
    await page.locator('#app .ecran').evaluate((ecran) => Promise.all(ecran.getAnimations().map((a) => a.finished)));
    const cibles = page.locator('#app button, #app a, #app label.bouton, #app .segmente__option');
    const nombre = await cibles.count();
    expect(nombre).toBeGreaterThan(10);
    for (let i = 0; i < nombre; i++) {
      const boite = await cibles.nth(i).boundingBox();
      expect(boite.width).toBeGreaterThanOrEqual(44);
      expect(boite.height).toBeGreaterThanOrEqual(44);
    }
    const debordement = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(debordement).toBeLessThanOrEqual(0);
  });
}
