// E4 — Mode cuisine : balayage, flèches, boutons, ingrédients cités (bulle), panneau,
// écran allumé (Wake Lock), transition et fin. Émulation tactile à 360 px.
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

test.use({ viewport: { width: 360, height: 800 }, hasTouch: true, isMobile: true });

const E = ' '; // espace insécable entre la quantité et l'unité
const TARTE = 'exemple-tarte-poireaux';

const progression = (page) => page.locator('.cuisine__progression-texte');
const barre = (page) => page.locator('.cuisine__barre');
const carte = (page) => page.locator('.cuisine__carte');
const precedent = (page) => page.getByRole('button', { name: 'Précédent' });
const suivant = (page) => page.locator('.cuisine__suivant');
const panneau = (page) => page.getByRole('dialog', { name: 'Ingrédients' });

/** Termine les animations en cours de la carte (transition entre étapes). */
const finirAnimations = (page) => carte(page).evaluate((el) => el.getAnimations().forEach((a) => a.finish()));

/** Charge les recettes d'exemple puis ouvre le mode cuisine. */
async function ouvrirCuisine(page, requete = '?portions=3') {
  await page.goto('./#/');
  await page.getByRole('button', { name: 'Charger des exemples' }).click();
  await expect(page.locator('.grille-recettes .carte-recette')).toHaveCount(6);
  await page.goto(`./#/cuisine/${TARTE}${requete}`);
  await expect(page.locator('.cuisine')).toBeVisible();
}

/**
 * Balayage au doigt (événements tactiles bruts, convertis en Pointer Events par Chromium).
 * @param {object} options dx, dy : déplacement ; pas : nombre de mouvements ;
 *   attente : pause entre deux mouvements (ms) ; lacher : false pour garder le doigt posé ;
 *   depart : point de départ (centre de la carte par défaut)
 */
async function balayer(page, { dx = 0, dy = 0, pas = 8, attente = 0, lacher = true, depart } = {}) {
  const boite = await carte(page).boundingBox();
  const x0 = depart?.x ?? boite.x + boite.width / 2;
  const y0 = depart?.y ?? boite.y + 150;
  const cdp = await page.context().newCDPSession(page);
  const toucher = (type, x, y) => cdp.send('Input.dispatchTouchEvent', {
    type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }],
  });
  await toucher('touchStart', x0, y0);
  for (let i = 1; i <= pas; i++) {
    await toucher('touchMove', x0 + (dx * i) / pas, y0 + (dy * i) / pas);
    if (attente) await page.waitForTimeout(attente);
  }
  const fin = () => toucher('touchEnd').then(() => cdp.detach());
  if (lacher) await fin();
  return fin;
}

test('le balayage change d’étape, la carte suit le doigt, le défilement vertical est préservé', async ({ page }) => {
  await ouvrirCuisine(page);
  await expect(progression(page)).toHaveText('Étape 1 / 5');
  await expect(barre(page)).toHaveJSProperty('value', 1);
  await expect(barre(page)).toHaveJSProperty('max', 5);
  await expect(barre(page)).toHaveAttribute('aria-labelledby', 'cuisine-progression');
  // Plein écran : ni barre d'onglets, ni bouton « + », ni en-tête de l'app
  await expect(page.locator('.barre-onglets')).toBeHidden();
  await expect(page.locator('.bouton-flottant')).toBeHidden();
  await expect(page.locator('.entete')).toBeHidden();

  // Pendant le geste, la carte suit le doigt
  const lacher = await balayer(page, { dx: -120, lacher: false });
  await expect(carte(page)).toHaveAttribute('style', /translateX\(-1[0-9]{2}(\.\d+)?px\)/);
  await lacher();
  await expect(progression(page)).toHaveText('Étape 2 / 5');
  await expect(barre(page)).toHaveJSProperty('value', 2);
  await expect(page).toHaveURL(new RegExp(`#/cuisine/${TARTE}\\?portions=3&etape=2$`));

  // Vers la droite : étape précédente
  await balayer(page, { dx: 140 });
  await expect(progression(page)).toHaveText('Étape 1 / 5');
  await expect(page).toHaveURL(new RegExp(`#/cuisine/${TARTE}\\?portions=3$`));

  // Geste court et lent : rien ne change, la carte revient en place
  await balayer(page, { dx: -50, pas: 10, attente: 40 });
  await expect(progression(page)).toHaveText('Étape 1 / 5');
  await expect(carte(page)).not.toHaveAttribute('style', /translateX/);

  // Geste vertical (défilement) : rien ne change
  await balayer(page, { dx: -20, dy: -250 });
  await expect(progression(page)).toHaveText('Étape 1 / 5');

  // Pas d'étape avant la première
  await balayer(page, { dx: 150 });
  await expect(progression(page)).toHaveText('Étape 1 / 5');

  // Un balayage qui commence sur un ingrédient cité n'ouvre pas sa bulle
  await balayer(page, { dx: -150 });
  await expect(progression(page)).toHaveText('Étape 2 / 5');
  await finirAnimations(page);
  const poireaux = page.getByRole('button', { name: 'poireaux' });
  const boite = await poireaux.boundingBox();
  await balayer(page, { dx: -150, depart: { x: boite.x + boite.width / 2, y: boite.y + boite.height / 2 } });
  await expect(progression(page)).toHaveText('Étape 3 / 5');
  await expect(page.locator('.bulle:popover-open')).toHaveCount(0);

  // Le bouton retour du navigateur revient à l'étape précédente
  await page.goBack();
  await expect(progression(page)).toHaveText('Étape 2 / 5');
  await page.goBack();
  await expect(progression(page)).toHaveText('Étape 1 / 5');
});

test('flèches, boutons Précédent / Suivant, « Terminé » puis « Bon appétit ! »', async ({ page }) => {
  await ouvrirCuisine(page);
  await expect(precedent(page)).toHaveAttribute('aria-disabled', 'true');
  await expect(suivant(page)).toHaveText('Suivant');

  // Flèches du clavier
  await page.keyboard.press('ArrowRight');
  await expect(progression(page)).toHaveText('Étape 2 / 5');
  await page.keyboard.press('ArrowRight');
  await expect(progression(page)).toHaveText('Étape 3 / 5');
  await page.keyboard.press('ArrowLeft');
  await expect(progression(page)).toHaveText('Étape 2 / 5');
  await expect(precedent(page)).toHaveAttribute('aria-disabled', 'false');

  // Boutons : le focus reste sur Suivant
  await suivant(page).click();
  await expect(progression(page)).toHaveText('Étape 3 / 5');
  await expect(suivant(page)).toBeFocused();
  await precedent(page).click();
  await expect(progression(page)).toHaveText('Étape 2 / 5');
  await suivant(page).click();
  await suivant(page).click();
  await suivant(page).click();
  await expect(progression(page)).toHaveText('Étape 5 / 5');
  await expect(carte(page)).toContainText('Enfourner 35 min');
  // Dernière étape : Suivant devient « Terminé »
  await expect(suivant(page)).toHaveText('Terminé');

  await suivant(page).click();
  const fin = page.getByRole('heading', { level: 2, name: 'Bon appétit !' });
  await expect(fin).toBeVisible();
  await expect(fin).toBeFocused();
  await expect(progression(page)).toHaveText('Terminé');
  await expect(barre(page)).toHaveJSProperty('value', 5);
  await expect(suivant(page)).toBeHidden();
  await expect(page).toHaveURL(/etape=fin$/);

  // Retour du navigateur : dernière étape ; avance : de nouveau la fin
  await page.goBack();
  await expect(progression(page)).toHaveText('Étape 5 / 5');
  await page.goForward();
  await expect(fin).toBeVisible();
  await page.keyboard.press('ArrowRight'); // rien après la fin
  await expect(fin).toBeVisible();
  await page.keyboard.press('ArrowLeft');
  await expect(progression(page)).toHaveText('Étape 5 / 5');
});

test('quitter ramène à la fiche (× , Échap, « Revenir à la fiche »), sans repasser par les étapes', async ({ page }) => {
  await ouvrirCuisine(page, '');
  // Depuis la fiche, avec 3 portions choisies
  await page.goto(`./#/recette/${TARTE}`);
  for (let i = 0; i < 3; i++) await page.getByRole('button', { name: 'Une portion de moins' }).click();
  await page.getByRole('link', { name: 'Cuisiner' }).click();
  await expect(progression(page)).toHaveText('Étape 1 / 5');
  // Le routeur donne le focus au titre de l'écran : le nom de la recette
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Tarte aux poireaux');
  await expect(page.getByRole('heading', { level: 1 })).toBeFocused();

  // Fin, puis « Revenir à la fiche »
  await page.goto(`./#/cuisine/${TARTE}?portions=3&etape=5`);
  await expect(progression(page)).toHaveText('Étape 5 / 5');
  await suivant(page).click();
  await page.getByRole('button', { name: 'Revenir à la fiche' }).click();
  await expect(page).toHaveURL(new RegExp(`#/recette/${TARTE}\\?portions=3$`));
  await expect(page.locator('.selecteur-portions__valeur')).toHaveText('3 portions');
  // Le retour du navigateur ne rouvre pas le mode cuisine
  await page.goBack();
  await expect(page.locator('.fiche')).toBeVisible();
  await expect(page.locator('.cuisine')).toHaveCount(0);

  // Échap
  await page.goto(`./#/cuisine/${TARTE}?portions=3`);
  await expect(progression(page)).toHaveText('Étape 1 / 5');
  await page.keyboard.press('ArrowRight');
  await expect(progression(page)).toHaveText('Étape 2 / 5');
  await page.keyboard.press('Escape');
  await expect(page).toHaveURL(new RegExp(`#/recette/${TARTE}\\?portions=3$`));

  // Bouton ×
  await page.goto(`./#/cuisine/${TARTE}?portions=3`);
  await page.getByRole('button', { name: 'Quitter le mode cuisine' }).tap();
  await expect(page).toHaveURL(new RegExp(`#/recette/${TARTE}\\?portions=3$`));
});

test('les ingrédients cités sont surlignés ; un toucher ouvre leur bulle', async ({ page }) => {
  await ouvrirCuisine(page, '?portions=3&etape=2');
  // Texte affiché (les bulles fermées ne comptent pas)
  await expect(carte(page)).toHaveText('Faire fondre les poireaux 15 min à feu doux dans le beurre.', { useInnerText: true });
  // Surbrillance : des boutons dans le texte
  const cites = carte(page).locator('.cuisine__ingredient');
  await expect(cites).toHaveText(['poireaux', 'beurre']);
  await expect(cites.first()).toHaveJSProperty('tagName', 'BUTTON');

  // Bulle : quantité ajustée à 3 portions (au lieu de 6), unité et précision
  const poireaux = page.getByRole('button', { name: 'poireaux' });
  await poireaux.tap();
  const bulle = page.locator('.bulle:popover-open');
  await expect(bulle).toHaveCount(1);
  await expect(bulle.locator('.bulle__nom')).toHaveText('poireaux');
  await expect(bulle.locator('.bulle__quantite')).toHaveText('2'); // 1,5 pièce → 2
  await expect(bulle.locator('.bulle__precision')).toHaveText('émincés');
  await expect(poireaux).toHaveAttribute('aria-expanded', 'true');
  // La bulle reste dans l'écran
  const boite = await bulle.boundingBox();
  expect(boite.x).toBeGreaterThanOrEqual(0);
  expect(boite.x + boite.width).toBeLessThanOrEqual(360);

  // Un toucher sur un autre ingrédient ferme la première bulle et ouvre la sienne
  await page.getByRole('button', { name: 'beurre' }).tap();
  await expect(bulle).toHaveCount(1);
  await expect(bulle.locator('.bulle__nom')).toHaveText('beurre');
  await expect(bulle.locator('.bulle__quantite')).toHaveText(`10${E}g`);
  await expect(poireaux).toHaveAttribute('aria-expanded', 'false');
  // Un second toucher la referme
  await page.getByRole('button', { name: 'beurre' }).tap();
  await expect(bulle).toHaveCount(0);

  // Échap ferme la bulle sans quitter le mode cuisine
  await poireaux.tap();
  await expect(bulle).toHaveCount(1);
  await page.keyboard.press('Escape');
  await expect(bulle).toHaveCount(0);
  await expect(page.locator('.cuisine')).toBeVisible();

  // Ingrédient sans quantité : « selon votre goût »
  await page.evaluate(() => Promise.all([import('./js/db.js'), import('./js/modele.js')])
    .then(([db, modele]) => db.enregistrerRecette(modele.creerRecette({
      id: 'salade',
      titre: 'Salade',
      ingredients: [{ quantite: 1, unite: 'pièce', nom: 'laitue' }, { nom: 'vinaigrette' }],
      etapes: [{ texte: 'Arroser la laitue de vinaigrette.' }],
    }))));
  await page.goto('./#/cuisine/salade');
  await page.getByRole('button', { name: 'vinaigrette' }).tap();
  await expect(bulle.locator('.bulle__nom')).toHaveText('vinaigrette');
  await expect(bulle.locator('.bulle__quantite')).toHaveText('Quantité selon votre goût');
});

test('le panneau « Ingrédients » monte du bas, avec la liste ajustée aux portions', async ({ page }) => {
  await ouvrirCuisine(page, '?portions=3&etape=2');
  const ouvrir = page.getByRole('button', { name: 'Ingrédients' });
  await ouvrir.tap();
  await expect(panneau(page)).toBeVisible();
  await expect(panneau(page)).toContainText('Pour 3 portions');
  await expect(panneau(page).locator('.ingredient')).toHaveText([
    '½ pâte brisée',
    '2 poireaux émincés',
    `100${E}ml crème fraîche`,
    '2 œufs',
    `50${E}g gruyère râpé`,
    `10${E}g beurre`,
    `½${E}pincée noix de muscade`,
    'sel et poivre',
  ]);
  await expect(panneau(page).getByRole('button', { name: 'Fermer' })).toBeFocused();
  // Collé au bas de l'écran, sur toute la largeur
  const boite = await panneau(page).boundingBox();
  await page.waitForTimeout(300); // fin de la montée
  const posee = await panneau(page).boundingBox();
  expect(Math.round(posee.y + posee.height)).toBe(800);
  expect(Math.round(posee.width)).toBe(360);
  expect(boite).toBeTruthy();

  // Les flèches ne changent pas d'étape pendant que le panneau est ouvert
  await page.keyboard.press('ArrowRight');
  await expect(progression(page)).toHaveText('Étape 2 / 5');
  // Échap ferme le panneau (sans quitter), le focus revient au bouton
  await page.keyboard.press('Escape');
  await expect(panneau(page)).toBeHidden();
  await expect(ouvrir).toBeFocused();
  await expect(page.locator('.cuisine')).toBeVisible();

  // Accessible à chaque étape ; un toucher sur le fond le ferme
  await page.keyboard.press('ArrowRight');
  await expect(progression(page)).toHaveText('Étape 3 / 5');
  await ouvrir.tap();
  await expect(panneau(page)).toBeVisible();
  await page.touchscreen.tap(180, 40);
  await expect(panneau(page)).toBeHidden();
  await ouvrir.tap();
  await panneau(page).getByRole('button', { name: 'Fermer' }).tap();
  await expect(panneau(page)).toBeHidden();
});

test('texte en grand (22 px minimum, plus grand sur grand écran), cibles de 44 px, sans débordement', async ({ page }) => {
  await ouvrirCuisine(page, '?portions=3&etape=2');
  const taille = () => page.locator('.cuisine__texte').evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
  expect(await taille()).toBeGreaterThanOrEqual(22);
  const debordement = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(debordement).toBeLessThanOrEqual(0);

  const cibles = page.locator('.cuisine button:visible');
  const nombre = await cibles.count();
  expect(nombre).toBeGreaterThanOrEqual(5);
  for (let i = 0; i < nombre; i++) {
    const cible = cibles.nth(i);
    // Les ingrédients cités sont des mots dans une phrase (exception des cibles en ligne)
    if (await cible.evaluate((el) => el.classList.contains('cuisine__ingredient'))) continue;
    const boite = await cible.boundingBox();
    const nom = await cible.evaluate((el) => el.getAttribute('aria-label') ?? el.textContent);
    // Arrondi : l'écran émulé a une densité de pixels non entière
    expect(Math.round(boite.width), nom).toBeGreaterThanOrEqual(44);
    expect(Math.round(boite.height), nom).toBeGreaterThanOrEqual(44);
  }

  await page.setViewportSize({ width: 1280, height: 800 });
  expect(await taille()).toBeGreaterThan(30);
});

test('transition de 200 ms entre les étapes, supprimée avec prefers-reduced-motion', async ({ page }) => {
  await ouvrirCuisine(page);
  const animations = () => carte(page).evaluate((el) => el.getAnimations().map((a) => a.effect.getTiming().duration));
  await suivant(page).click();
  expect(await animations()).toEqual([200]);

  await finirAnimations(page);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await suivant(page).click();
  await expect(progression(page)).toHaveText('Étape 3 / 5');
  expect(await animations()).toEqual([]);
});

test('l’écran est maintenu allumé, redemandé au retour sur l’onglet, libéré à la sortie', async ({ page }) => {
  // API Wake Lock simulée : on compte les demandes et les libérations
  await page.addInitScript(() => {
    let visibilite = 'visible';
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => visibilite });
    window.__visibilite = (valeur) => {
      visibilite = valeur;
      document.dispatchEvent(new Event('visibilitychange'));
    };
    window.__verrous = [];
    Object.defineProperty(navigator, 'wakeLock', {
      configurable: true,
      value: {
        async request(type) {
          const verrou = new EventTarget();
          verrou.type = type;
          verrou.released = false;
          verrou.release = async () => {
            if (verrou.released) return;
            verrou.released = true;
            verrou.dispatchEvent(new Event('release'));
          };
          window.__verrous.push(verrou);
          return verrou;
        },
      },
    });
  });
  await ouvrirCuisine(page);
  const etat = () => page.evaluate(() => window.__verrous.map((v) => ({ type: v.type, libere: v.released })));
  await expect.poll(etat).toEqual([{ type: 'screen', libere: false }]);
  await expect(page.locator('.cuisine__veille')).toBeHidden();

  // Onglet en arrière-plan : le navigateur libère le verrou ; au retour, il est redemandé
  await page.evaluate(() => {
    window.__visibilite('hidden');
    window.__verrous[0].release();
  });
  await page.evaluate(() => window.__visibilite('visible'));
  await expect.poll(etat).toEqual([{ type: 'screen', libere: true }, { type: 'screen', libere: false }]);

  // Le changement d'étape ne redemande rien ; la sortie libère le verrou
  await page.keyboard.press('ArrowRight');
  await expect(progression(page)).toHaveText('Étape 2 / 5');
  await page.keyboard.press('Escape');
  await expect(page.locator('.fiche')).toBeVisible();
  await expect.poll(etat).toEqual([{ type: 'screen', libere: true }, { type: 'screen', libere: true }]);
});

test('sans l’API Wake Lock, un message discret le signale', async ({ page }) => {
  await page.addInitScript(() => {
    delete Navigator.prototype.wakeLock;
  });
  await ouvrirCuisine(page);
  await expect(page.getByRole('status').filter({ hasText: 'garder l’écran allumé' })).toBeVisible();
});

test('un identifiant inconnu affiche « Recette introuvable »', async ({ page }) => {
  await page.goto('./#/cuisine/inconnue?etape=2');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Recette introuvable');
  await page.getByRole('link', { name: 'Voir mes recettes' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Mes recettes');
});
