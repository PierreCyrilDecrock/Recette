// Critères de recette du MVP (docs/cahier-des-charges.md) : un test par critère
// automatisable, sur les deux projets (mobile Pixel 7 et bureau). Les autres fichiers
// e2e détaillent chaque écran ; celui-ci rejoue les critères tels que le cahier les énonce.
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test, expect, chromium } from '@playwright/test';
import { attendreServiceWorker, servirCopie } from './outils/serveur.js';

const E = ' '; // espace insécable entre la quantité et l'unité

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

const titreEcran = (page) => page.getByRole('heading', { level: 1 });
const cartes = (page) => page.locator('.grille-recettes .carte-recette');
const LIBRE = 'Quantité, unité et nom';

/** Charge les recettes d'exemple depuis l'accueil vide. */
async function chargerExemples(page) {
  await page.goto('./#/');
  await page.getByRole('button', { name: 'Charger des exemples' }).click();
  await expect(cartes(page)).toHaveCount(6);
}

/** Recettes, favoris et catégories lus par js/db.js. */
const lireDonnees = (page) => page.evaluate(async () => {
  const db = await import('./js/db.js');
  return {
    recettes: await db.listerRecettes(),
    favoris: (await db.listerRecettes({ favoris: true })).map((r) => r.id),
    categories: await db.listerCategories(),
  };
});

/**
 * Saisit une recette complète au formulaire : titre, difficulté, temps, 5 ingrédients et
 * 4 étapes, comme au téléphone (ligne libre sous 768 px, champs détaillés au-delà).
 */
async function saisirRecetteComplete(page) {
  const ingredients = [
    ['250', 'g', 'farine', '250 g de farine'],
    ['4', '', 'œufs', '4 œufs'],
    ['50', 'cl', 'lait', '50 cl de lait'],
    ['2', 'c. à s.', 'sucre', '2 c. à s. de sucre'],
    ['1', 'pincée', 'sel', '1 pincée de sel'],
  ];
  const etapes = [
    'Mélanger la farine, le sucre et le sel.',
    'Ajouter les œufs puis le lait en fouettant.',
    'Laisser reposer la pâte 1 h.',
    'Cuire les crêpes dans une poêle chaude.',
  ];
  await page.goto('./#/nouvelle');
  await expect(titreEcran(page)).toHaveText('Nouvelle recette');
  await page.getByRole('textbox', { name: 'Titre (obligatoire)' }).fill('Crêpes');
  await page.getByRole('radio', { name: 'Moyen' }).check();
  await page.getByRole('textbox', { name: 'Préparation (en minutes)' }).fill('10');
  await page.getByRole('textbox', { name: 'Cuisson (en minutes)' }).fill('20');
  const libre = page.viewportSize().width < 768;
  for (const [index, [quantite, unite, nom, ligne]] of ingredients.entries()) {
    const groupe = page.getByRole('group', { name: `Ingrédient ${index + 1}`, exact: true });
    if (libre) {
      await groupe.getByLabel(LIBRE).fill(ligne);
    } else {
      await groupe.getByLabel('Quantité', { exact: true }).fill(quantite);
      await groupe.getByLabel('Unité', { exact: true }).fill(unite);
      await groupe.getByLabel('Nom', { exact: true }).fill(nom);
    }
    if (index < ingredients.length - 1) await page.keyboard.press('Enter');
  }
  await page.getByRole('textbox', { name: 'Étape 1', exact: true }).click();
  for (const [index, texte] of etapes.entries()) {
    await page.keyboard.insertText(texte);
    if (index < etapes.length - 1) await page.keyboard.press('Enter');
  }
  await page.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(page).toHaveURL(/#\/recette\/[0-9a-f-]{36}$/);
}

/** Vérifie la fiche de la recette saisie par saisirRecetteComplete. */
async function verifierRecetteComplete(page) {
  await expect(titreEcran(page)).toHaveText('Crêpes');
  await expect(page.locator('.info__valeur')).toHaveText(['Moyen', `10${E}min`, `20${E}min`, `30${E}min`]);
  await expect(page.locator('.ingredient')).toHaveText([
    `250${E}g farine`, '4 œufs', `50${E}cl lait`, `2${E}c. à s. sucre`, `1${E}pincée sel`,
  ]);
  await expect(page.locator('.etape__texte')).toHaveCount(4);
  await expect(page.locator('.etape__texte').last()).toHaveText('Cuire les crêpes dans une poêle chaude.');
}

test('critère 1 — créer une recette complète (titre, difficulté, temps, 5 ingrédients, 4 étapes)', async ({ page }) => {
  await saisirRecetteComplete(page);
  await verifierRecetteComplete(page);
  // Elle apparaît dans la liste, avec son temps et sa difficulté
  await page.goto('./#/');
  await expect(cartes(page)).toHaveCount(1);
  await expect(cartes(page).locator('.carte-recette__temps')).toHaveText(/30\s?min/);
  await expect(cartes(page).getByRole('img', { name: 'Difficulté : moyen' })).toBeVisible();
});

test('critère 2 — la recette réapparaît intacte après fermeture du navigateur', async ({ browserName }, testInfo) => {
  test.skip(browserName !== 'chromium', 'profil persistant Chromium');
  // Un vrai profil de navigateur sur disque : on le ferme, puis on le rouvre
  const profil = await mkdtemp(join(tmpdir(), 'recette-profil-'));
  const { viewport, userAgent, deviceScaleFactor, isMobile, hasTouch, baseURL } = testInfo.project.use;
  const options = { viewport, userAgent, deviceScaleFactor, isMobile, hasTouch, baseURL, serviceWorkers: 'block' };
  try {
    let contexte = await chromium.launchPersistentContext(profil, options);
    let page = contexte.pages()[0] ?? await contexte.newPage();
    await saisirRecetteComplete(page);
    const url = page.url();
    const avant = await lireDonnees(page);
    await contexte.close();

    contexte = await chromium.launchPersistentContext(profil, options);
    page = contexte.pages()[0] ?? await contexte.newPage();
    await page.goto(url);
    await verifierRecetteComplete(page);
    expect(await lireDonnees(page)).toEqual(avant);
    await contexte.close();
  } finally {
    await rm(profil, { recursive: true, force: true });
  }
});

test('critère 3 — passer de 4 à 6 portions multiplie les quantités par 1,5, arrondies lisiblement', async ({ page }) => {
  await chargerExemples(page);
  await page.goto('./#/recette/exemple-veloute-potimarron');
  const valeur = page.locator('.selecteur-portions__valeur');
  await expect(valeur).toHaveText('4 portions');
  await expect(page.locator('.ingredient__quantite')).toHaveText([
    `1${E}kg`, '1', `75${E}cl`, `10${E}cl`, `1${E}c. à s.`,
  ]);
  await page.getByRole('button', { name: 'Une portion de plus' }).click();
  await page.getByRole('button', { name: 'Une portion de plus' }).click();
  await expect(valeur).toHaveText('6 portions');
  // 1,5 kg ; 1,5 oignon → 2 ; 112,5 cl → 113 cl ; 15 cl ; 1 ½ c. à s.
  await expect(page.locator('.ingredient__quantite')).toHaveText([
    `1,5${E}kg`, '2', `113${E}cl`, `15${E}cl`, `1${E}½${E}c. à s.`,
  ]);
});

test('critère 4 — chercher « poireau » trouve les recettes qui le contiennent (titre ou ingrédients)', async ({ page }) => {
  await chargerExemples(page);
  // Une recette où le poireau n'est que dans les ingrédients
  await page.evaluate(async () => {
    const { enregistrerRecette } = await import('./js/db.js');
    const { creerRecette } = await import('./js/modele.js');
    await enregistrerRecette(creerRecette({
      titre: 'Soupe du jardin',
      ingredients: [{ quantite: 2, unite: 'pièce', nom: 'Poireaux' }, { quantite: 3, nom: 'carottes' }],
      etapes: [{ texte: 'Tout cuire 30 min.' }],
    }));
  });
  await page.reload();
  await expect(cartes(page)).toHaveCount(7);
  const recherche = page.getByRole('searchbox', { name: 'Rechercher une recette' });
  for (const requete of ['poireau', 'POIREAUX', 'poîreau']) {
    await recherche.fill(requete);
    await expect(page.locator('.carte-recette__titre')).toHaveText(['Soupe du jardin', 'Tarte aux poireaux']);
    await expect(page.locator('.liste__compte')).toHaveText('2 recettes');
  }
});

/** Balayage au doigt (événements tactiles bruts, convertis en Pointer Events par Chromium). */
async function balayer(page, dx) {
  // Pendant une transition de vue, les événements vont à <html> : on attend la fin
  await page.waitForFunction(() => !document.activeViewTransition);
  const boite = await page.locator('.cuisine__carte').boundingBox();
  const x0 = boite.x + boite.width / 2;
  const y0 = boite.y + 120;
  const cdp = await page.context().newCDPSession(page);
  const toucher = (type, x) => cdp.send('Input.dispatchTouchEvent', {
    type, touchPoints: type === 'touchEnd' ? [] : [{ x, y: y0 }],
  });
  await toucher('touchStart', x0);
  for (let i = 1; i <= 8; i++) await toucher('touchMove', x0 + (dx * i) / 8);
  await toucher('touchEnd');
  await cdp.detach();
}

test.describe('critère 5 — mode cuisine', () => {
  test.use({ hasTouch: true });

  test('il se parcourt par balayage et demande à garder l’écran allumé', async ({ page }) => {
    // Wake Lock simulé : on relève les demandes et les libérations
    await page.addInitScript(() => {
      window.verrous = { demandes: 0, liberes: 0 };
      Object.defineProperty(navigator, 'wakeLock', {
        configurable: true,
        value: {
          request: async () => {
            window.verrous.demandes += 1;
            const verrou = new EventTarget();
            verrou.released = false;
            verrou.release = async () => {
              verrou.released = true;
              window.verrous.liberes += 1;
            };
            return verrou;
          },
        },
      });
    });
    await chargerExemples(page);
    await page.goto('./#/recette/exemple-tarte-poireaux');
    await page.getByRole('link', { name: 'Cuisiner' }).click();
    const progression = page.locator('.cuisine__progression-texte');
    await expect(progression).toHaveText('Étape 1 / 5');
    await expect.poll(() => page.evaluate(() => window.verrous.demandes)).toBe(1);

    await balayer(page, -160);
    await expect(progression).toHaveText('Étape 2 / 5');
    await balayer(page, -160);
    await expect(progression).toHaveText('Étape 3 / 5');
    await balayer(page, 160);
    await expect(progression).toHaveText('Étape 2 / 5');

    // En quittant, l'écran peut de nouveau se mettre en veille
    await page.getByRole('button', { name: 'Quitter le mode cuisine' }).click();
    await expect(page.locator('.fiche')).toBeVisible();
    await expect.poll(() => page.evaluate(() => window.verrous.liberes)).toBe(1);
  });
});

test.describe('critère 6 — hors ligne', () => {
  test.use({ serviceWorkers: 'allow' });

  test('sans réseau, l’app s’ouvre et toutes les fonctions du MVP marchent', async ({ page, context }) => {
    const site = await servirCopie();
    try {
      // Première visite en ligne : le service worker met l'app en cache
      await page.goto(`${site.url}#/`);
      await attendreServiceWorker(page);
      await page.getByRole('button', { name: 'Charger des exemples' }).click();
      await expect(cartes(page)).toHaveCount(6);

      // Mode avion, puis réouverture de l'app
      await context.setOffline(true);
      await page.reload();
      await expect(titreEcran(page)).toHaveText('Mes recettes');
      await expect(cartes(page)).toHaveCount(6);

      // Recherche, fiche, portions, favori
      await page.getByRole('searchbox', { name: 'Rechercher une recette' }).fill('poireau');
      await expect(cartes(page)).toHaveCount(1);
      await cartes(page).click();
      await expect(titreEcran(page)).toHaveText('Tarte aux poireaux');
      await page.getByRole('button', { name: 'Une portion de plus' }).click();
      await expect(page.locator('.selecteur-portions__valeur')).toHaveText('7 portions');
      await page.getByRole('button', { name: 'Favori' }).click();
      await expect(page.getByRole('button', { name: 'Favori' })).toHaveAttribute('aria-pressed', 'true');

      // Mode cuisine
      await page.getByRole('link', { name: 'Cuisiner' }).click();
      await expect(page.locator('.cuisine__progression-texte')).toHaveText('Étape 1 / 5');
      await page.getByRole('button', { name: 'Quitter le mode cuisine' }).click();

      // Création d'une recette
      await page.goto(`${site.url}#/nouvelle`);
      await page.getByRole('textbox', { name: 'Titre (obligatoire)' }).fill('Omelette hors ligne');
      const premier = page.getByRole('group', { name: 'Ingrédient 1', exact: true });
      if (page.viewportSize().width < 768) await premier.getByLabel(LIBRE).fill('3 œufs');
      else await premier.getByLabel('Nom', { exact: true }).fill('œufs');
      await page.getByRole('textbox', { name: 'Étape 1', exact: true }).fill('Battre les œufs et cuire.');
      await page.getByRole('button', { name: 'Enregistrer' }).click();
      await expect(titreEcran(page)).toHaveText('Omelette hors ligne');

      // Favoris, réglages et export
      await page.goto(`${site.url}#/favoris`);
      await expect(page.locator('.carte-recette__titre')).toHaveText(['Tarte aux poireaux']);
      await page.goto(`${site.url}#/reglages`);
      await expect(titreEcran(page)).toHaveText('Réglages');
      const telechargement = page.waitForEvent('download');
      await page.getByRole('button', { name: 'Exporter mes recettes' }).click();
      expect((await telechargement).suggestedFilename()).toMatch(/^recettes-.*\.json$/);
    } finally {
      await context.setOffline(false);
      await site.arreter();
    }
  });
});

test('critère 7 — un export JSON puis un import dans un autre navigateur restituent toutes les recettes', async ({ page, browser }, testInfo) => {
  await chargerExemples(page);
  await page.evaluate(async () => (await import('./js/db.js')).basculerFavori('exemple-creme-brulee'));
  const avant = await lireDonnees(page);

  await page.goto('./#/reglages');
  const telechargement = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Exporter mes recettes' }).click();
  const fichier = await telechargement;
  const chemin = testInfo.outputPath(fichier.suggestedFilename());
  await fichier.saveAs(chemin);
  expect(JSON.parse(await readFile(chemin, 'utf8')).recettes).toHaveLength(6);

  // Un autre navigateur : un contexte neuf, avec son propre stockage, vide
  const { viewport, userAgent, deviceScaleFactor, isMobile, hasTouch, baseURL } = testInfo.project.use;
  const autre = await browser.newContext({ viewport, userAgent, deviceScaleFactor, isMobile, hasTouch, baseURL, serviceWorkers: 'block' });
  try {
    const page2 = await autre.newPage();
    await page2.goto('./#/');
    await expect(page2.getByRole('button', { name: 'Charger des exemples' })).toBeVisible();
    await page2.goto('./#/reglages');
    // Contenu passé tel quel : le chemin de sortie du test contient des accents, que
    // setInputFiles ne transmet pas au champ fichier
    await page2.getByLabel('Importer un fichier').setInputFiles({
      name: fichier.suggestedFilename(), mimeType: 'application/json', buffer: await readFile(chemin),
    });
    await page2.getByRole('dialog').getByRole('button', { name: 'Fusionner' }).click();
    await expect(page2.locator('.toast').last()).toHaveText('6 recettes importées.');
    // Recettes identiques : dates, favori et catégories compris
    expect(await lireDonnees(page2)).toEqual(avant);
    await page2.goto('./#/');
    await expect(cartes(page2)).toHaveCount(6);
  } finally {
    await autre.close();
  }
});

test('performance — la recherche filtre 500 recettes en moins de 100 ms', async ({ page }, testInfo) => {
  await page.goto('./#/');
  // 500 recettes variées, importées d'un coup
  await page.evaluate(async () => {
    const { toutImporter } = await import('./js/db.js');
    const { creerRecette } = await import('./js/modele.js');
    const mots = [
      'tomate', 'poireau', 'carotte', 'farine', 'beurre', 'crème', 'œuf', 'sucre', 'oignon', 'ail',
      'lait', 'sel', 'poivre', 'thym', 'courgette', 'riz', 'pâtes', 'citron', 'miel', 'persil',
    ];
    const recettes = Array.from({ length: 500 }, (_, i) => creerRecette({
      titre: `Recette n° ${i} aux ${mots[i % mots.length]}s`,
      difficulte: ['facile', 'moyen', 'difficile'][i % 3],
      tempsPreparation: 5 + (i % 60),
      ingredients: Array.from({ length: 8 }, (_, j) => ({ quantite: j + 1, unite: 'g', nom: `${mots[(i * 3 + j) % mots.length]} ${j}` })),
      etapes: [{ texte: 'Mélanger.' }, { texte: 'Cuire.' }],
      notes: 'Une astuce de cuisine assez longue, avec des accents : é è à ç. '.repeat(3),
    }));
    await toutImporter({ app: 'recette', version: 1, recettes, categories: [] });
  });
  await page.reload();
  await expect(cartes(page)).toHaveCount(500);

  // Durée entre la frappe et la grille filtrée, mise en page comprise
  const mesurer = (requete) => page.evaluate((texte) => {
    const saisie = document.querySelector('.recherche__saisie');
    const debut = performance.now();
    saisie.value = texte;
    saisie.dispatchEvent(new Event('input', { bubbles: true }));
    void document.querySelector('.grille-recettes').offsetHeight; // force la mise en page
    return { duree: performance.now() - debut, resultats: document.querySelectorAll('.grille-recettes .carte-recette').length };
  }, requete);

  const premiere = await mesurer('poireau'); // index de recherche encore froid
  const suivantes = [];
  for (const requete of ['poir', 'crème', 'farine beurre', 'oignon', '']) suivantes.push(await mesurer(requete));
  const resume = `première ${premiere.duree.toFixed(1)} ms (${premiere.resultats} résultats), `
    + `suivantes ${suivantes.map((m) => m.duree.toFixed(1)).join(' / ')} ms`;
  testInfo.annotations.push({ type: 'recherche sur 500 recettes', description: resume });
  console.log(`[${testInfo.project.name}] Recherche sur 500 recettes : ${resume}`);
  expect(premiere.resultats).toBeGreaterThan(0);
  expect(premiere.resultats).toBeLessThan(500);
  // Requête vide : toute la liste revient
  expect(suivantes.at(-1).resultats).toBe(500);
  for (const mesure of [premiere, ...suivantes]) expect(mesure.duree).toBeLessThan(100);
});
