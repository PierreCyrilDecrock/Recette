// Étape 11 — Design : icônes, difficulté en toques, mise en page côte à côte sur grand
// écran, transitions et mouvement réduit, absence de débordement de 320 à 1440 px.
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

const cartes = (page) => page.locator('.grille-recettes .carte-recette');

/** Charge les recettes d'exemple depuis l'accueil vide. */
async function chargerExemples(page) {
  await page.goto('./#/');
  await page.getByRole('button', { name: 'Charger des exemples' }).click();
  await expect(cartes(page)).toHaveCount(6);
}

/** Recette au titre très long (mot sans espace compris) et à la catégorie très longue. */
async function creerRecetteLongue(page) {
  await page.goto('./#/');
  await page.evaluate(async () => {
    const { enregistrerRecette } = await import('./js/db.js');
    const { creerRecette } = await import('./js/modele.js');
    await enregistrerRecette(creerRecette({
      id: 'longue',
      titre: 'Gâteau moelleux aux noisettes torréfiées et caramel Supercalifragilisticexpialidocieusementextraordinaire',
      portions: 4,
      difficulte: 'difficile',
      tempsPreparation: 95,
      tempsCuisson: 40,
      tempsRepos: 600,
      categories: ['Dessert', 'Fêtes de fin d’année vraiment très gourmandes et conviviales'],
      ingredients: [{ quantite: 250, unite: 'g', nom: 'noisettes', precision: 'torréfiées et grossièrement concassées' }],
      etapes: [{ texte: 'Torréfier les noisettes. Anticonstitutionnellementextraordinairementlongmotsansespace.' }],
    }));
  });
}

/** Dépassement horizontal de la page, en pixels (0 si rien ne déborde). */
const debordement = (page) => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);

test('icônes : un jeu cohérent, décoratif par défaut, nommé avec un libellé', async ({ page }) => {
  await page.goto('./#/');
  const resultat = await page.evaluate(async () => {
    const { icone, NOMS_ICONES } = await import('./js/icones.js');
    return {
      noms: NOMS_ICONES,
      icones: NOMS_ICONES.map((nom) => {
        const svg = icone(nom);
        return {
          nom,
          trait: svg.getAttribute('stroke-width'),
          couleur: svg.getAttribute('stroke'),
          bouts: svg.getAttribute('stroke-linecap'),
          angles: svg.getAttribute('stroke-linejoin'),
          cache: svg.getAttribute('aria-hidden'),
          role: svg.getAttribute('role'),
          taille: svg.getAttribute('width'),
          dessin: svg.childElementCount > 0,
        };
      }),
      nommee: (() => {
        const svg = icone('horloge', { taille: 16, libelle: 'Temps total' });
        return [svg.getAttribute('role'), svg.getAttribute('aria-label'), svg.getAttribute('aria-hidden'), svg.getAttribute('width')];
      })(),
    };
  });
  // Le jeu demandé est complet
  for (const nom of [
    'horloge', 'toque', 'portions', 'coeur', 'coeur-plein', 'recherche', 'plus', 'crayon', 'copie',
    'partage', 'poubelle', 'chevron-gauche', 'chevron-droite', 'fleche-haut', 'fleche-bas', 'croix',
    'liste', 'reglages', 'minuteur', 'panier', 'calendrier',
  ]) expect(resultat.noms).toContain(nom);
  for (const svg of resultat.icones) {
    expect(svg, svg.nom).toEqual({
      nom: svg.nom, trait: '1.75', couleur: 'currentColor', bouts: 'round', angles: 'round',
      cache: 'true', role: null, taille: '24', dessin: true,
    });
  }
  expect(resultat.nommee).toEqual(['img', 'Temps total', null, '16']);

  // La coquille n'a plus de symbole provisoire : ses icônes viennent de icones.js
  await expect(page.locator('.entete svg:not(.icone)')).toHaveCount(0);
  await expect(page.locator('.barre-onglets .icone')).toHaveCount(3);
  await expect(page.locator('.entete [data-icone]')).toHaveCount(0);
});

test('les écrans n’affichent que des icônes de icones.js', async ({ page }) => {
  await chargerExemples(page);
  // Seules les illustrations des états vides sont dessinées à part
  const horsJeu = page.locator('body svg:not(.icone):not(.etat-vide__illustration)');
  await expect(horsJeu).toHaveCount(0);
  for (const hash of ['#/recette/exemple-tarte-poireaux', '#/edition/exemple-tarte-poireaux', '#/cuisine/exemple-tarte-poireaux', '#/reglages']) {
    await page.goto(`./${hash}`);
    await expect(page.locator('#app h1')).toHaveCount(1);
    await expect(horsJeu).toHaveCount(0);
  }
});

test('difficulté : 1, 2 ou 3 toques remplies, de la même façon partout', async ({ page }) => {
  await chargerExemples(page);
  // Carte : toques nommées pour les lecteurs d'écran
  const carte = cartes(page).filter({ hasText: 'Crème brûlée' });
  const toques = carte.getByRole('img', { name: 'Difficulté : moyen' });
  await expect(toques.locator('.difficulte__toque')).toHaveCount(3);
  await expect(toques.locator('.difficulte__toque--pleine')).toHaveCount(2);
  await expect(toques.locator('.icone--toque-pleine')).toHaveCount(2);

  // Fiche : mêmes toques, décoratives à côté du mot
  await page.goto('./#/recette/exemple-creme-brulee');
  const info = page.locator('.info').filter({ hasText: 'Difficulté' });
  await expect(info.locator('.difficulte')).toHaveAttribute('aria-hidden', 'true');
  await expect(info.locator('.difficulte__toque--pleine')).toHaveCount(2);
  await expect(info.locator('.info__valeur')).toHaveText('Moyen');

  // Formulaire : chaque option montre ses toques, le nom de l'option reste le mot
  await page.goto('./#/edition/exemple-creme-brulee');
  for (const [nom, pleines] of [['Facile', 1], ['Moyen', 2], ['Difficile', 3]]) {
    const option = page.locator('.segmente__option').filter({ has: page.getByRole('radio', { name: nom, exact: true }) });
    await expect(option.locator('.difficulte__toque--pleine')).toHaveCount(pleines);
  }
  await expect(page.getByRole('radio', { name: 'Moyen', exact: true })).toBeChecked();
});

test('le cœur bat en devenant favori', async ({ page }) => {
  await chargerExemples(page);
  await page.goto('./#/recette/exemple-gratin-dauphinois');
  const favori = page.getByRole('button', { name: 'Favori' });
  await expect(favori.locator('.icone--coeur')).toBeVisible();
  await expect(favori.locator('.icone--coeur-plein')).toBeHidden();
  // Les animations du bouton sont relevées dès leur début
  await favori.evaluate((bouton) => {
    window.animations = [];
    bouton.addEventListener('animationstart', (e) => window.animations.push(e.animationName));
  });
  await favori.click();
  await expect.poll(() => page.evaluate(() => window.animations)).toEqual(expect.arrayContaining(['battement', 'onde']));
  await expect(favori.locator('.icone--coeur-plein')).toBeVisible();
  // La classe d'animation est retirée à la fin : un nouvel ajout rejouera l'animation
  await expect(favori).not.toHaveClass(/fiche__favori--anime/);
  await favori.click();
  await expect(favori.locator('.icone--coeur')).toBeVisible();
});

test.describe('grand écran', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test('la liste à gauche, la fiche à droite ; la liste reste en place', async ({ page }) => {
    await chargerExemples(page);
    // Accueil : liste à gauche, invitation à droite ; onglets et « Nouvelle recette » en haut
    await expect(page.locator('.double__liste .liste')).toBeVisible();
    await expect(page.getByRole('heading', { level: 2, name: 'Choisissez une recette' })).toBeVisible();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Mes recettes');
    const onglets = await page.getByRole('navigation', { name: 'Navigation principale' }).boundingBox();
    const nouvelle = await page.getByRole('link', { name: 'Nouvelle recette' }).boundingBox();
    expect(onglets.y).toBeLessThan(80);
    expect(nouvelle.y).toBeLessThan(80);
    await expect(page.locator('.bouton-flottant__texte')).toBeVisible();

    // Recherche, puis ouverture d'une fiche : la liste n'est pas reconstruite
    await page.getByRole('searchbox', { name: 'Rechercher une recette' }).fill('au');
    await page.locator('.double__liste .liste').evaluate((liste) => { liste.dataset.temoin = 'oui'; });
    await cartes(page).filter({ hasText: 'Gratin dauphinois' }).click();
    await expect(page).toHaveURL(/#\/recette\/exemple-gratin-dauphinois$/);
    const titre = page.getByRole('heading', { level: 1 });
    await expect(titre).toHaveText('Gratin dauphinois');
    await expect(titre).toBeFocused();
    await expect(page).toHaveTitle('Gratin dauphinois — Recette');
    // Un seul h1 : le titre de la liste passe au niveau 2
    await expect(page.getByRole('heading', { level: 2, name: 'Mes recettes' })).toBeVisible();
    await expect(page.locator('.double__liste .liste')).toHaveAttribute('data-temoin', 'oui');
    await expect(page.getByRole('searchbox', { name: 'Rechercher une recette' })).toHaveValue('au');
    await expect(cartes(page).filter({ hasText: 'Gratin dauphinois' })).toHaveAttribute('aria-current', 'page');
    await expect(page.getByRole('navigation', { name: 'Navigation principale' }).getByRole('link', { name: 'Recettes' }))
      .toHaveAttribute('aria-current', 'page');

    // Côte à côte : la liste à gauche, la fiche à droite, sur la même hauteur
    const liste = await page.locator('.double__liste').boundingBox();
    const fiche = await page.locator('.fiche').boundingBox();
    expect(fiche.x).toBeGreaterThan(liste.x + liste.width);
    expect(Math.abs(fiche.y - liste.y)).toBeLessThan(40);
    // Ingrédients et étapes en deux colonnes dans le volet de droite
    const ingredients = await page.locator('.fiche__ingredients').boundingBox();
    const etapes = await page.locator('.fiche__etapes').boundingBox();
    expect(etapes.x).toBeGreaterThan(ingredients.x + ingredients.width - 1);

    // Une autre fiche : seule la partie droite change
    await cartes(page).filter({ hasText: 'Tarte aux poireaux' }).click();
    await expect(titre).toHaveText('Tarte aux poireaux');
    await expect(page.locator('.double__liste .liste')).toHaveAttribute('data-temoin', 'oui');
    await expect(page.locator('.carte-recette[aria-current="page"]')).toHaveCount(1);
    await expect(cartes(page).filter({ hasText: 'Tarte aux poireaux' })).toHaveAttribute('aria-current', 'page');

    // Suppression depuis la fiche : la liste d'à côté se met à jour
    await page.getByRole('button', { name: 'Plus d’actions' }).click();
    await page.getByRole('button', { name: 'Supprimer' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Supprimer' }).click();
    await expect(page).toHaveURL(/#\/$/);
    await expect(cartes(page).filter({ hasText: 'Tarte aux poireaux' })).toHaveCount(0);
    await expect(page.locator('.carte-recette[aria-current]')).toHaveCount(0);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Mes recettes');
    await expect(page.getByRole('searchbox', { name: 'Rechercher une recette' })).toHaveValue('au');
    expect(await debordement(page)).toBeLessThanOrEqual(0);
  });

  test('passer sous 1024 px revient à un écran à la fois, sans perdre la fiche', async ({ page }) => {
    await chargerExemples(page);
    await page.goto('./#/recette/exemple-creme-brulee?portions=6');
    await expect(page.locator('.double')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Retour à la liste' })).toBeHidden();

    await page.setViewportSize({ width: 800, height: 900 });
    await expect(page.locator('.double')).toHaveCount(0);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Crème brûlée');
    await expect(page.locator('.selecteur-portions__valeur')).toHaveText('6 portions');
    await expect(page.getByRole('link', { name: 'Retour à la liste' })).toBeVisible();
    await expect(page.locator('.bouton-flottant')).toBeHidden();

    await page.setViewportSize({ width: 1280, height: 800 });
    await expect(page.locator('.double .fiche')).toBeVisible();
    await expect(page.locator('.carte-recette[aria-current="page"]')).toContainText('Crème brûlée');
  });

  test('l’onglet Favoris garde sa liste à côté de la fiche', async ({ page }) => {
    await chargerExemples(page);
    await page.goto('./#/favoris');
    // Aucun favori : l'invitation à en ajouter prend toute la largeur
    await expect(page.getByRole('heading', { level: 2, name: 'Pas encore de favori' })).toBeVisible();
    await expect(page.locator('.double__detail')).toBeHidden();

    await page.evaluate(async () => (await import('./js/db.js')).basculerFavori('exemple-gratin-dauphinois'));
    await expect(cartes(page)).toHaveCount(1);
    await cartes(page).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Gratin dauphinois');
    await expect(page.getByRole('heading', { level: 2, name: 'Favoris' })).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Navigation principale' }).getByRole('link', { name: 'Favoris' }))
      .toHaveAttribute('aria-current', 'page');
    // Retirer le favori le retire aussitôt de la liste d'à côté
    await page.getByRole('button', { name: 'Favori' }).click();
    await expect(cartes(page)).toHaveCount(0);
  });
});

test('de 320 à 1440 px : aucun débordement, titres longs coupés proprement', async ({ page }) => {
  test.slow();
  await creerRecetteLongue(page);
  for (const largeur of [320, 360, 414, 600, 768, 900, 1024, 1280, 1440]) {
    await page.setViewportSize({ width: largeur, height: 800 });
    for (const [hash, titre] of [
      ['#/', 'Mes recettes'], ['#/favoris', 'Favoris'], ['#/recette/longue', /^Gâteau/],
      ['#/edition/longue', 'Modifier la recette'], ['#/cuisine/longue', /^Gâteau/], ['#/reglages', 'Réglages'],
    ]) {
      await page.goto(`./${hash}`);
      await expect(page.locator('#app h1')).toHaveText(titre);
      await page.waitForFunction(() => !document.activeViewTransition);
      expect(await debordement(page), `${hash} à ${largeur} px`).toBeLessThanOrEqual(0);
    }
  }

  // Carte : trois lignes au plus, puis des points de suspension
  await page.setViewportSize({ width: 320, height: 800 });
  await page.goto('./#/');
  const titreCarte = page.locator('.carte-recette__titre');
  expect(await titreCarte.evaluate((el) => getComputedStyle(el).webkitLineClamp)).toBe('3');
  expect(await titreCarte.evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(true);
  // Puce de catégorie très longue : tronquée, son nom complet reste lisible par tous
  const puce = page.getByRole('button', { name: 'Fêtes de fin d’année vraiment très gourmandes et conviviales' });
  expect(await puce.evaluate((el) => el.scrollWidth > el.clientWidth && getComputedStyle(el).textOverflow === 'ellipsis')).toBe(true);

  // Mode cuisine : le titre tient sur une ligne, avec des points de suspension
  await page.goto('./#/cuisine/longue');
  const titreCuisine = page.locator('.cuisine__titre');
  expect(await titreCuisine.evaluate((el) => el.scrollWidth > el.clientWidth && getComputedStyle(el).textOverflow === 'ellipsis')).toBe(true);
});

test('les changements d’écran passent par une transition de vue, sauf en mouvement réduit', async ({ page }) => {
  // Compte les transitions demandées par le routeur
  await page.addInitScript(() => {
    window.transitions = 0;
    const origine = document.startViewTransition?.bind(document);
    if (origine) {
      document.startViewTransition = (...args) => {
        window.transitions += 1;
        return origine(...args);
      };
    }
  });
  await chargerExemples(page);
  const disponible = await page.evaluate(() => typeof document.startViewTransition === 'function');
  test.skip(!disponible, 'API View Transitions absente : le fondu CSS prend le relais');
  await expect(page.locator('html')).toHaveClass(/transitions-vues/);

  await page.goto('./#/reglages');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Réglages');
  expect(await page.evaluate(() => window.transitions)).toBeGreaterThan(0);

  // Mouvement réduit : plus de transition, et les animations CSS sont neutralisées
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const avant = await page.evaluate(() => window.transitions);
  await page.goto('./#/recette/exemple-tarte-poireaux');
  await expect(page.locator('.fiche')).toBeVisible();
  await page.goto('./#/favoris');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Favoris');
  expect(await page.evaluate(() => window.transitions)).toBe(avant);
  const duree = await page.locator('.puce, .bouton').first().evaluate((el) => getComputedStyle(el).transitionDuration);
  expect(parseFloat(duree)).toBeLessThan(0.001);
});
