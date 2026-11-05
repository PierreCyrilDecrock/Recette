// E2 — Fiche recette : en-tête, infos, portions, ingrédients, étapes, actions.
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

const E = ' '; // espace insécable entre la quantité et l'unité

/** Charge les exemples depuis l'accueil vide, puis ouvre la fiche demandée. */
async function ouvrirFiche(page, id) {
  await page.goto('./#/');
  await page.getByRole('button', { name: 'Charger des exemples' }).click();
  await expect(page.locator('.grille-recettes .carte-recette')).toHaveCount(6);
  await page.goto(`./#/recette/${id}`);
  await expect(page.locator('.fiche')).toBeVisible();
}

const quantites = (page) => page.locator('.ingredient');
const plus = (page) => page.getByRole('button', { name: 'Une portion de plus' });
const moins = (page) => page.getByRole('button', { name: 'Une portion de moins' });
const valeurPortions = (page) => page.locator('.selecteur-portions__valeur');
const boutonMenu = (page) => page.getByRole('button', { name: 'Plus d’actions' });

for (const largeur of [360, 1024]) {
  test.describe(`à ${largeur} px`, () => {
    test.use({ viewport: { width: largeur, height: 800 } });

    test('passer de 4 à 6 portions multiplie les quantités par 1,5, arrondies lisiblement', async ({ page }) => {
      await ouvrirFiche(page, 'exemple-veloute-potimarron');
      await expect(valeurPortions(page)).toHaveText('4 portions');
      await expect(valeurPortions(page)).toHaveAttribute('aria-live', 'polite');
      await expect(quantites(page)).toHaveText([
        `1${E}kg potimarron`,
        '1 oignon émincé',
        `75${E}cl bouillon de légumes`,
        `10${E}cl crème liquide`,
        `1${E}c. à s. huile d’olive`,
        'sel et poivre',
      ]);

      await plus(page).click();
      await plus(page).click();
      await expect(valeurPortions(page)).toHaveText('6 portions');
      // ×1,5 : 1,5 kg ; 1,5 oignon → 2 (pièce entière) ; 112,5 cl → 113 cl ; 1 ½ c. à s.
      await expect(quantites(page)).toHaveText([
        `1,5${E}kg potimarron`,
        '2 oignon émincé',
        `113${E}cl bouillon de légumes`,
        `15${E}cl crème liquide`,
        `1${E}½${E}c. à s. huile d’olive`,
        'sel et poivre',
      ]);
      // Quantité et unité en gras, précision à part (en gris)
      await expect(page.locator('.ingredient__quantite').first()).toHaveText(`1,5${E}kg`);
      await expect(page.locator('.ingredient__precision')).toHaveText(['émincé']);

      // Les portions passent au mode cuisine par l'URL, et en reviennent
      const cuisiner = page.getByRole('link', { name: 'Cuisiner' });
      await expect(cuisiner).toHaveAttribute('href', '#/cuisine/exemple-veloute-potimarron?portions=6');
      await cuisiner.click();
      await expect(page.getByRole('heading', { level: 1 })).toHaveText('Mode cuisine');
      await page.getByRole('link', { name: 'Quitter le mode cuisine' }).click();
      await expect(valeurPortions(page)).toHaveText('6 portions');

      // La valeur choisie n'est pas enregistrée dans la recette
      await page.goto('./#/recette/exemple-veloute-potimarron');
      await expect(valeurPortions(page)).toHaveText('4 portions');

      // Aucun défilement horizontal
      const debordement = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(debordement).toBeLessThanOrEqual(0);
    });

    test('ingrédients et étapes en une colonne sur mobile, deux à partir de 768 px', async ({ page }) => {
      await ouvrirFiche(page, 'exemple-tarte-poireaux');
      const ingredients = await page.locator('.fiche__ingredients').boundingBox();
      const etapes = await page.locator('.fiche__etapes').boundingBox();
      if (largeur >= 768) {
        expect(etapes.x).toBeGreaterThan(ingredients.x + ingredients.width - 1);
        expect(Math.abs(etapes.y - ingredients.y)).toBeLessThan(2);
      } else {
        expect(etapes.y).toBeGreaterThan(ingredients.y + ingredients.height - 1);
      }
    });
  });
}

test('le sélecteur de portions est borné de 1 à 100', async ({ page }) => {
  await ouvrirFiche(page, 'exemple-salade-chevre-chaud'); // 2 portions
  await moins(page).click();
  await expect(valeurPortions(page)).toHaveText('1 portion');
  await expect(moins(page)).toHaveAttribute('aria-disabled', 'true');
  // Playwright refuse de cliquer un bouton aria-disabled : on l'active au clavier
  await moins(page).press('Enter');
  await expect(valeurPortions(page)).toHaveText('1 portion');
  await expect(moins(page)).toBeFocused(); // le bouton reste focalisable à la borne

  // Une valeur hors bornes dans l'URL est ignorée ; 100 est accepté
  await page.goto('./#/recette/exemple-salade-chevre-chaud?portions=250');
  await expect(valeurPortions(page)).toHaveText('2 portions');
  await page.goto('./#/recette/exemple-salade-chevre-chaud?portions=100');
  await expect(valeurPortions(page)).toHaveText('100 portions');
  await expect(plus(page)).toHaveAttribute('aria-disabled', 'true');
  await plus(page).focus();
  await page.keyboard.press('ArrowDown');
  await expect(valeurPortions(page)).toHaveText('99 portions');
});

test("l'en-tête affiche le visuel, le titre, les catégories et les infos", async ({ page }) => {
  await ouvrirFiche(page, 'exemple-creme-brulee');
  const titre = page.getByRole('heading', { level: 1 });
  await expect(titre).toHaveText('Crème brûlée');
  await expect(titre).toBeFocused();
  await expect(page).toHaveTitle('Crème brûlée — Recette');
  await expect(page.locator('.fiche__media .visuel__initiale')).toHaveText('C');
  await expect(page.getByRole('list', { name: 'Catégories' }).getByRole('listitem')).toHaveText(['Dessert']);
  await expect(page.locator('.fiche__description')).toHaveText(/vanille/);

  // Infos : difficulté, préparation, cuisson, repos et total
  await expect(page.locator('.info__libelle')).toHaveText(['Difficulté', 'Préparation', 'Cuisson', 'Repos', 'Total']);
  await expect(page.locator('.info__valeur')).toHaveText(['Moyen', '20 min', '45 min', '4 h', '5 h 05'].map((t) => t.replaceAll(' ', E)));

  // Une recette sans repos ne montre pas la carte « Repos »
  await page.goto('./#/recette/exemple-tarte-poireaux');
  await expect(page.locator('.info__libelle')).toHaveText(['Difficulté', 'Préparation', 'Cuisson', 'Total']);

  // Étapes : liste numérotée, texte de 17 px au moins
  await expect(page.locator('ol.etapes > li')).toHaveCount(5);
  const taille = await page.locator('.etape__texte').first().evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
  expect(taille).toBeGreaterThanOrEqual(17);

  // Notes affichées ; une source qui n'est pas une URL reste du texte
  await expect(page.locator('.fiche__notes')).toContainText('lardons');
  await expect(page.locator('.fiche__source')).toHaveText('Source : Cahier des charges');
  await expect(page.locator('.fiche__source a')).toHaveCount(0);

  // La barre d'onglets reste, le bouton « + » laisse la place à « Cuisiner »
  await expect(page.locator('.barre-onglets')).toBeVisible();
  await expect(page.locator('.bouton-flottant')).toBeHidden();
});

test('le favori se met à jour aussitôt et apparaît dans l’onglet Favoris', async ({ page }) => {
  await ouvrirFiche(page, 'exemple-gratin-dauphinois');
  const favori = page.getByRole('button', { name: 'Favori' });
  await expect(favori).toHaveAttribute('aria-pressed', 'false');
  await favori.click();
  await expect(favori).toHaveAttribute('aria-pressed', 'true');

  // Le bouton retour ramène à la liste ; le favori est enregistré
  await page.getByRole('link', { name: 'Retour à la liste' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Mes recettes');
  await page.getByRole('navigation', { name: 'Navigation principale' }).getByRole('link', { name: 'Favoris' }).click();
  await expect(page.locator('.grille-recettes .carte-recette__titre')).toHaveText(['Gratin dauphinois']);

  // Retrait du favori : il quitte l'onglet
  await page.locator('.grille-recettes .carte-recette').click();
  await page.getByRole('button', { name: 'Favori' }).click();
  await expect(page.getByRole('button', { name: 'Favori' })).toHaveAttribute('aria-pressed', 'false');
  await page.goBack();
  await expect(page.getByRole('heading', { level: 2, name: 'Pas encore de favori' })).toBeVisible();
});

test('le menu secondaire s’ouvre, se ferme avec Échap et mène à la modification', async ({ page }) => {
  await ouvrirFiche(page, 'exemple-tarte-poireaux');
  await expect(boutonMenu(page)).toHaveAttribute('aria-expanded', 'false');
  await boutonMenu(page).click();
  await expect(boutonMenu(page)).toHaveAttribute('aria-expanded', 'true');
  const modifier = page.getByRole('link', { name: 'Modifier' });
  await expect(modifier).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(modifier).toBeHidden();
  await expect(boutonMenu(page)).toBeFocused();

  // Un clic ailleurs ferme aussi le menu
  await boutonMenu(page).click();
  await page.getByRole('heading', { level: 1 }).click();
  await expect(modifier).toBeHidden();

  await boutonMenu(page).click();
  await modifier.click();
  await expect(page).toHaveURL(/#\/edition\/exemple-tarte-poireaux$/);
});

test('dupliquer ouvre la copie', async ({ page }) => {
  await ouvrirFiche(page, 'exemple-tarte-poireaux');
  await page.getByRole('button', { name: 'Favori' }).click();
  await boutonMenu(page).click();
  await page.getByRole('button', { name: 'Dupliquer' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Tarte aux poireaux (copie)');
  await expect(page).not.toHaveURL(/exemple-tarte-poireaux/);
  await expect(page.getByRole('status', { name: 'Notifications' })).toHaveText('Copie créée. Vous pouvez maintenant la modifier.');
  // La copie n'hérite pas du favori
  await expect(page.getByRole('button', { name: 'Favori' })).toHaveAttribute('aria-pressed', 'false');
  await page.getByRole('link', { name: 'Retour à la liste' }).click();
  await expect(page.locator('.grille-recettes .carte-recette')).toHaveCount(7);
});

test('partager passe le texte formaté à navigator.share, ou le copie à défaut', async ({ page, context, browserName }) => {
  // Feuille de partage simulée : on garde ce qui lui est transmis
  await page.addInitScript(() => {
    navigator.share = async (donnees) => { window.partage = donnees; };
  });
  await ouvrirFiche(page, 'exemple-veloute-potimarron');
  await plus(page).click();
  await plus(page).click();
  await boutonMenu(page).click();
  await page.getByRole('button', { name: 'Partager' }).click();
  const partage = await page.waitForFunction(() => window.partage).then((h) => h.jsonValue());
  expect(partage.title).toBe('Velouté de potimarron');
  expect(partage.text).toContain('Pour 6 portions');
  expect(partage.text).toContain(`- 1,5${E}kg potimarron`);
  expect(partage.text).toContain('1. Laver le potimarron');
  await expect(boutonMenu(page)).toBeFocused();

  // Sans navigator.share : copie dans le presse-papiers et message éphémère
  test.skip(browserName !== 'chromium', 'permissions du presse-papiers propres à Chromium');
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.evaluate(() => { delete navigator.share; Object.defineProperty(navigator, 'share', { value: undefined }); });
  await boutonMenu(page).click();
  await page.getByRole('button', { name: 'Partager' }).click();
  await expect(page.getByRole('status', { name: 'Notifications' })).toHaveText('Recette copiée dans le presse-papiers.');
  const copie = await page.evaluate(() => navigator.clipboard.readText());
  expect(copie).toContain('Velouté de potimarron\nUne soupe douce');
});

test('supprimer demande une confirmation, puis revient à la liste avec un message', async ({ page }) => {
  await ouvrirFiche(page, 'exemple-boeuf-bourguignon');
  const dialogue = page.getByRole('dialog', { name: 'Supprimer cette recette ?' });

  // Annuler : rien n'est supprimé, le focus revient au bouton du menu
  await boutonMenu(page).click();
  await page.getByRole('button', { name: 'Supprimer' }).click();
  await expect(dialogue).toBeVisible();
  await expect(dialogue).toContainText('« Bœuf bourguignon » sera définitivement effacée');
  await expect(dialogue.getByRole('button', { name: 'Annuler' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(dialogue).toBeHidden();
  await expect(boutonMenu(page)).toBeFocused();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Bœuf bourguignon');

  // Confirmer : retour à la liste, message éphémère, recette disparue
  await boutonMenu(page).click();
  await page.getByRole('button', { name: 'Supprimer' }).click();
  await dialogue.getByRole('button', { name: 'Supprimer' }).click();
  await expect(page).toHaveURL(/#\/$/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Mes recettes');
  await expect(page.getByRole('status', { name: 'Notifications' })).toHaveText('« Bœuf bourguignon » a été supprimée.');
  await expect(page.locator('.grille-recettes .carte-recette')).toHaveCount(5);
  await expect(page.locator('.grille-recettes')).not.toContainText('Bœuf bourguignon');

  // Le message disparaît de lui-même
  await expect(page.locator('.toast')).toHaveCount(0, { timeout: 6000 });
});

test('un identifiant inconnu affiche « Recette introuvable »', async ({ page }) => {
  await page.goto('./#/recette/nexiste-pas');
  const titre = page.getByRole('heading', { level: 1 });
  await expect(titre).toHaveText('Recette introuvable');
  await expect(page).toHaveTitle('Recette introuvable — Recette');
  await page.getByRole('link', { name: 'Voir mes recettes' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Mes recettes');
});

test('les cibles tactiles de la fiche mesurent au moins 44 × 44 px', async ({ page }) => {
  await ouvrirFiche(page, 'exemple-tarte-poireaux');
  await boutonMenu(page).click();
  await page.locator('.menu__liste').evaluate((menu) => Promise.all(menu.getAnimations().map((a) => a.finished)));
  const cibles = page.locator('.fiche a, .fiche button');
  const nombre = await cibles.count();
  expect(nombre).toBeGreaterThan(5);
  for (let i = 0; i < nombre; i++) {
    const cible = cibles.nth(i);
    if (!(await cible.isVisible())) continue;
    // Le lien de source, dans le texte, n'est pas concerné
    if (await cible.evaluate((el) => el.closest('.fiche__source') !== null)) continue;
    const boite = await cible.boundingBox();
    expect(boite.width, await cible.innerText()).toBeGreaterThanOrEqual(44);
    expect(boite.height, await cible.innerText()).toBeGreaterThanOrEqual(44);
  }
});
