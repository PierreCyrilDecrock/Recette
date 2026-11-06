// Accessibilité (WCAG 2.2 AA) : analyse axe-core de chaque écran, en thème clair et
// sombre, sans aucune violation sérieuse ou critique ; parcours complet au clavier seul.
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

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

const cartes = (page) => page.locator('.grille-recettes .carte-recette');
const titreEcran = (page) => page.getByRole('heading', { level: 1 });

/** Attend la fin des transitions de vue et des animations (contrastes mesurés au repos). */
async function auRepos(page) {
  await page.waitForFunction(() => !document.activeViewTransition);
  await page.evaluate(() => Promise.all(document.getAnimations().map((a) => a.finished.catch(() => {}))));
}

/**
 * Analyse axe de la page dans son état courant (règles WCAG 2.0 à 2.2, niveaux A et AA,
 * et bonnes pratiques). Renvoie toutes les violations, par gravité.
 */
async function analyser(page, ecran, testInfo) {
  await auRepos(page);
  const { violations } = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'])
    .analyze();
  const resume = violations.map((v) => `${v.impact} ${v.id} (${v.nodes.length})`);
  testInfo.annotations.push({ type: `axe ${ecran}`, description: resume.join(', ') || 'aucune violation' });
  if (resume.length) console.log(`[${testInfo.project.name}] axe ${ecran} : ${resume.join(', ')}`);
  return violations;
}

/** Violations sérieuses ou critiques, présentées lisiblement en cas d'échec. */
const graves = (violations) => violations
  .filter((v) => v.impact === 'serious' || v.impact === 'critical')
  .map((v) => ({ regle: v.id, impact: v.impact, aide: v.help, cibles: v.nodes.map((n) => n.target.join(' ')) }));

for (const theme of ['light', 'dark']) {
  test(`axe : aucune violation sérieuse ou critique sur chaque écran (thème ${theme === 'light' ? 'clair' : 'sombre'})`, async ({ page }, testInfo) => {
    test.slow();
    await page.emulateMedia({ colorScheme: theme });
    const ecrans = [];
    const verifier = async (nom) => ecrans.push([nom, graves(await analyser(page, nom, testInfo))]);

    // Liste vide, puis avec les exemples ; favoris vides
    await page.goto('./#/');
    await expect(page.getByRole('button', { name: 'Charger des exemples' })).toBeVisible();
    await verifier('liste vide');
    await page.getByRole('button', { name: 'Charger des exemples' }).click();
    await expect(cartes(page)).toHaveCount(6);
    await verifier('liste');
    await page.getByRole('searchbox', { name: 'Rechercher une recette' }).fill('introuvable');
    await expect(page.getByRole('button', { name: 'Effacer la recherche' })).toBeVisible();
    await verifier('liste sans résultat');
    await page.goto('./#/favoris');
    await expect(titreEcran(page)).toHaveText('Favoris');
    await verifier('favoris vides');

    // Fiche, son menu et la confirmation de suppression
    await page.goto('./#/recette/exemple-creme-brulee');
    await expect(titreEcran(page)).toHaveText('Crème brûlée');
    await verifier('fiche');
    await page.getByRole('button', { name: 'Plus d’actions' }).click();
    await verifier('fiche, menu ouvert');
    await page.getByRole('button', { name: 'Supprimer' }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await verifier('fiche, confirmation');
    await page.keyboard.press('Escape');
    await page.goto('./#/recette/inconnue');
    await expect(titreEcran(page)).toHaveText('Recette introuvable');
    await verifier('fiche introuvable');

    // Formulaire : création (avec erreurs affichées) et modification
    await page.goto('./#/nouvelle');
    await expect(titreEcran(page)).toHaveText('Nouvelle recette');
    await verifier('nouvelle recette');
    await page.getByRole('button', { name: 'Enregistrer' }).click();
    await expect(page.locator('.champ__erreur:not(:empty)').first()).toBeVisible();
    await verifier('nouvelle recette, erreurs');
    await page.goto('./#/edition/exemple-tarte-poireaux');
    await expect(titreEcran(page)).toHaveText('Modifier la recette');
    await verifier('modification');

    // Mode cuisine : étape, bulle d'ingrédient, panneau des ingrédients, fin
    await page.goto('./#/cuisine/exemple-tarte-poireaux?etape=2');
    await expect(page.locator('.cuisine__progression-texte')).toHaveText('Étape 2 / 5');
    await verifier('mode cuisine');
    await page.locator('.cuisine__ingredient').first().click();
    await expect(page.locator('.bulle:popover-open')).toBeVisible();
    await verifier('mode cuisine, bulle');
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Ingrédients' }).click();
    await expect(page.getByRole('dialog', { name: 'Ingrédients' })).toBeVisible();
    await verifier('mode cuisine, ingrédients');
    await page.keyboard.press('Escape');
    await page.goto('./#/cuisine/exemple-tarte-poireaux?etape=fin');
    await expect(page.getByRole('heading', { name: 'Bon appétit !' })).toBeVisible();
    await verifier('mode cuisine, fin');

    // Réglages
    await page.goto('./#/reglages');
    await expect(titreEcran(page)).toHaveText('Réglages');
    await verifier('réglages');

    expect(ecrans.filter(([, violations]) => violations.length > 0)).toEqual([]);
  });
}

/**
 * Appuie sur Tab (ou Maj+Tab) jusqu'à ce que l'élément ait le focus : il doit être
 * atteignable au clavier en moins de `max` appuis, avec un indicateur de focus visible.
 */
async function tabulerJusqua(page, cible, { arriere = false, max = 40 } = {}) {
  for (let i = 0; i < max; i++) {
    await page.keyboard.press(arriere ? 'Shift+Tab' : 'Tab');
    if (await cible.evaluate((el) => el === document.activeElement || el.contains(document.activeElement))) {
      const anneau = await page.evaluate(() => {
        const el = document.activeElement;
        const style = getComputedStyle(el);
        // Champs radio cachés : l'anneau est porté par leur apparence
        const apparence = el.matches('.segmente__option input') ? getComputedStyle(el.nextElementSibling) : style;
        return apparence.outlineStyle !== 'none' && parseFloat(apparence.outlineWidth) >= 2;
      });
      expect(anneau, 'focus visible').toBe(true);
      return;
    }
  }
  throw new Error(`${cible} n’a pas reçu le focus après ${max} appuis sur Tab`);
}

test('parcours complet au clavier seul', async ({ page }) => {
  test.slow();
  const largeEcran = page.viewportSize().width >= 1024;
  const nav = page.getByRole('navigation', { name: 'Navigation principale' });

  // Accueil vide : charger les exemples
  await page.goto('./#/');
  await expect(page.getByRole('button', { name: 'Charger des exemples' })).toBeVisible();
  await tabulerJusqua(page, page.getByRole('button', { name: 'Charger des exemples' }));
  await page.keyboard.press('Enter');
  await expect(cartes(page)).toHaveCount(6);
  await expect(titreEcran(page)).toBeFocused();

  // Recherche, puis ouverture d'une fiche
  await tabulerJusqua(page, page.getByRole('searchbox', { name: 'Rechercher une recette' }));
  await page.keyboard.type('poireau');
  await expect(cartes(page)).toHaveCount(1);
  await tabulerJusqua(page, cartes(page).first());
  await page.keyboard.press('Enter');
  await expect(titreEcran(page)).toHaveText('Tarte aux poireaux');
  await expect(titreEcran(page)).toBeFocused();

  // Favori (Espace), portions (Entrée et flèches)
  await tabulerJusqua(page, page.getByRole('button', { name: 'Favori' }), { arriere: !largeEcran });
  await page.keyboard.press('Space');
  await expect(page.getByRole('button', { name: 'Favori' })).toHaveAttribute('aria-pressed', 'true');
  await tabulerJusqua(page, page.getByRole('button', { name: 'Une portion de plus' }));
  await page.keyboard.press('Enter');
  await page.keyboard.press('ArrowUp');
  await expect(page.locator('.selecteur-portions__valeur')).toHaveText('8 portions');

  // Mode cuisine : flèches pour changer d'étape, Échap pour quitter
  await tabulerJusqua(page, page.getByRole('link', { name: 'Cuisiner' }));
  await page.keyboard.press('Enter');
  await expect(page.locator('.cuisine__progression-texte')).toHaveText('Étape 1 / 5');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('.cuisine__progression-texte')).toHaveText('Étape 3 / 5');
  await tabulerJusqua(page, page.getByRole('button', { name: 'Ingrédients' }));
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog', { name: 'Ingrédients' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'Ingrédients' })).toBeHidden();
  await expect(page.getByRole('button', { name: 'Ingrédients' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page).toHaveURL(/#\/recette\/exemple-tarte-poireaux\?portions=8$/);
  await expect(titreEcran(page)).toBeFocused();

  // Menu secondaire → Modifier ; Entrée dans le titre enregistre
  await tabulerJusqua(page, page.getByRole('button', { name: 'Plus d’actions' }));
  await page.keyboard.press('Enter');
  await expect(page.getByRole('link', { name: 'Modifier' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(titreEcran(page)).toHaveText('Modifier la recette');
  await tabulerJusqua(page, page.getByRole('textbox', { name: 'Titre (obligatoire)' }));
  await page.keyboard.press('End');
  await page.keyboard.type(' fondante');
  // Difficulté : les flèches changent d'option dans le groupe
  await tabulerJusqua(page, page.getByRole('radio', { name: 'Facile' }));
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('radio', { name: 'Moyen' })).toBeChecked();
  // Toutes les lignes d'ingrédients et d'étapes sont traversées avant la barre d'actions
  await tabulerJusqua(page, page.getByRole('button', { name: 'Enregistrer' }), { max: 150 });
  await page.keyboard.press('Enter');
  await expect(titreEcran(page)).toHaveText('Tarte aux poireaux fondante');
  await expect(page.locator('.info__valeur').first()).toHaveText('Moyen');

  // Nouvelle recette : le « + » (dans l'en-tête sur grand écran, en bas sur mobile)
  if (!largeEcran) {
    await tabulerJusqua(page, nav.getByRole('link', { name: 'Recettes' }), { arriere: true });
    await page.keyboard.press('Enter');
    await expect(titreEcran(page)).toHaveText('Mes recettes');
  }
  await tabulerJusqua(page, page.getByRole('link', { name: 'Nouvelle recette' }), { arriere: true });
  await page.keyboard.press('Enter');
  await expect(titreEcran(page)).toHaveText('Nouvelle recette');
  await tabulerJusqua(page, page.getByRole('textbox', { name: 'Titre (obligatoire)' }));
  await page.keyboard.type('Omelette');
  const premierIngredient = largeEcran
    ? page.getByRole('group', { name: 'Ingrédient 1', exact: true }).getByLabel('Nom', { exact: true })
    : page.getByRole('group', { name: 'Ingrédient 1', exact: true }).getByLabel('Quantité, unité et nom');
  await tabulerJusqua(page, premierIngredient);
  await page.keyboard.type(largeEcran ? 'œufs' : '3 œufs');
  await tabulerJusqua(page, page.getByRole('textbox', { name: 'Étape 1', exact: true }));
  await page.keyboard.type('Battre les œufs et cuire à feu doux.');
  await tabulerJusqua(page, page.getByRole('button', { name: 'Enregistrer' }));
  await page.keyboard.press('Enter');
  await expect(titreEcran(page)).toHaveText('Omelette');

  // Réglages : thème choisi aux flèches
  await tabulerJusqua(page, nav.getByRole('link', { name: 'Réglages' }), { arriere: true });
  await page.keyboard.press('Enter');
  await expect(titreEcran(page)).toHaveText('Réglages');
  await tabulerJusqua(page, page.getByRole('radio', { name: 'Système' }));
  await page.keyboard.press('ArrowLeft');
  await expect(page.getByRole('radio', { name: 'Sombre' })).toBeChecked();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'sombre');

  // Favoris : la recette marquée au clavier y figure
  await tabulerJusqua(page, nav.getByRole('link', { name: 'Favoris' }), { arriere: true });
  await page.keyboard.press('Enter');
  await expect(page.locator('.carte-recette__titre')).toHaveText(['Tarte aux poireaux fondante']);
});
