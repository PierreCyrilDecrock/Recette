// PWA : installation du service worker, fonctionnement hors ligne et mise à jour.
// L'application est servie dans un sous-dossier (/Recette/, comme sur GitHub Pages) par un
// petit serveur propre à chaque test, à partir d'une copie : le test de mise à jour peut
// ainsi modifier les fichiers sans toucher au dépôt.
import { createServer } from 'node:http';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { extname, join, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, expect } from '@playwright/test';

test.use({ serviceWorkers: 'allow' });

const RACINE = fileURLToPath(new URL('../../', import.meta.url));
const SOUS_DOSSIER = '/Recette/';
const VERSION = (await readFile(join(RACINE, 'js', 'app.js'), 'utf8')).match(/const VERSION = '([^']+)'/)[1];

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

/**
 * Copie l'application dans un dossier temporaire et la sert sous /Recette/.
 * @returns {Promise<{ url: string, dossier: string, arreter: () => Promise<void> }>}
 */
async function servirCopie() {
  const dossier = await mkdtemp(join(tmpdir(), 'recette-pwa-'));
  for (const element of ['index.html', 'manifest.webmanifest', 'sw.js', 'css', 'js', 'icones']) {
    await cp(join(RACINE, element), join(dossier, element), { recursive: true });
  }
  const serveur = createServer(async (requete, reponse) => {
    const chemin = decodeURIComponent(new URL(requete.url, 'http://x').pathname);
    if (!chemin.startsWith(SOUS_DOSSIER)) {
      reponse.writeHead(404).end();
      return;
    }
    const relatif = normalize(chemin.slice(SOUS_DOSSIER.length) || 'index.html');
    if (relatif.startsWith('..') || relatif.split(sep).includes('..')) {
      reponse.writeHead(403).end();
      return;
    }
    try {
      const contenu = await readFile(join(dossier, relatif));
      reponse.writeHead(200, {
        'Content-Type': TYPES[extname(relatif)] ?? 'application/octet-stream',
        'Cache-Control': 'no-cache',
      });
      reponse.end(contenu);
    } catch {
      reponse.writeHead(404).end();
    }
  });
  await new Promise((resoudre) => serveur.listen(0, '127.0.0.1', resoudre));
  return {
    // localhost : contexte sécurisé, le service worker est permis sans HTTPS
    url: `http://localhost:${serveur.address().port}${SOUS_DOSSIER}`,
    dossier,
    arreter: async () => {
      serveur.closeAllConnections();
      await new Promise((resoudre) => serveur.close(resoudre));
      await rm(dossier, { recursive: true, force: true });
    },
  };
}

/** Attend que le service worker soit actif et contrôle la page. */
async function attendreServiceWorker(page) {
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
}

const nomsCaches = (page) => page.evaluate(() => caches.keys());
const titreEcran = (page) => page.getByRole('heading', { level: 1 });
const onglet = (page, nom) => page.getByRole('navigation', { name: 'Navigation principale' }).getByRole('link', { name: nom });

let site;
let erreurs;

test.beforeEach(async ({ page }) => {
  site = await servirCopie();
  erreurs = [];
  page.on('console', (message) => {
    if (message.type() === 'error') erreurs.push(message.text());
  });
  page.on('pageerror', (erreur) => erreurs.push(erreur.message));
});

test.afterEach(async () => {
  await site.arreter();
  expect(erreurs, 'erreurs dans la console').toEqual([]);
});

test('manifeste et icônes : chemins relatifs, résolus dans le sous-dossier', async ({ page }) => {
  await page.goto(`${site.url}#/`);
  const manifeste = await page.evaluate(async () => {
    const lien = document.querySelector('link[rel="manifest"]');
    const reponse = await fetch(lien.href);
    return { url: reponse.url, contenu: await reponse.json() };
  });
  expect(manifeste.url).toBe(`${site.url}manifest.webmanifest`);
  expect(manifeste.contenu).toMatchObject({
    name: 'Recette', lang: 'fr', start_url: './', scope: './', display: 'standalone',
  });
  const icones = manifeste.contenu.icons.map((icone) => `${icone.sizes} ${icone.purpose}`);
  expect(icones).toEqual(['192x192 any', '512x512 any', '512x512 maskable']);
  // Chaque icône (manifeste et balises link) existe et a la taille annoncée
  for (const { src, sizes } of manifeste.contenu.icons) {
    const taille = await page.evaluate(async (adresse) => {
      const image = new Image();
      image.src = adresse;
      await image.decode();
      return `${image.naturalWidth}x${image.naturalHeight}`;
    }, new URL(src, manifeste.url).href);
    expect(taille).toBe(sizes);
  }
  for (const selecteur of ['link[rel="apple-touch-icon"]', 'link[rel="icon"][type="image/svg+xml"]', 'link[rel="icon"][sizes]']) {
    const href = await page.locator(selecteur).evaluate((lien) => lien.href);
    expect(href.startsWith(site.url)).toBe(true);
    expect((await page.request.get(href)).status()).toBe(200);
  }
  await expect(page.locator('meta[name="apple-mobile-web-app-capable"]')).toHaveAttribute('content', 'yes');
  await expect(page.locator('meta[name="apple-mobile-web-app-status-bar-style"]')).toHaveAttribute('content', 'default');
});

test('première visite, hors ligne, rechargement : tous les écrans fonctionnent', async ({ page, context }) => {
  // --- Première visite : le service worker s'installe et met l'app en cache ---
  await page.goto(`${site.url}#/`);
  await expect(titreEcran(page)).toHaveText('Mes recettes');
  await attendreServiceWorker(page);
  expect(await nomsCaches(page)).toEqual([`recette-${VERSION}`]);
  const portee = await page.evaluate(async () => (await navigator.serviceWorker.getRegistration()).scope);
  expect(portee).toBe(site.url);

  // --- Hors ligne, rechargement ---
  await context.setOffline(true);
  await page.reload();
  await expect(titreEcran(page)).toHaveText('Mes recettes');
  // Le réseau est bien coupé : un fichier hors du cache est inaccessible (l'échec de cette
  // requête volontaire s'inscrit dans la console : on l'écarte)
  const avantSonde = erreurs.length;
  const reseau = await page.evaluate(() => fetch('inexistant.txt').then(() => 'joignable', () => 'coupé'));
  expect(reseau).toBe('coupé');
  await expect.poll(() => erreurs.length).toBe(avantSonde + 1);
  expect(erreurs.splice(avantSonde)).toEqual(['Failed to load resource: net::ERR_FAILED']);

  // Liste : les exemples (module chargé à la demande) viennent du cache
  await page.getByRole('button', { name: 'Charger des exemples' }).click();
  await expect(page.locator('.carte-recette')).toHaveCount(6);

  // Fiche puis mode cuisine
  await page.locator('.carte-recette').filter({ hasText: 'Tarte aux poireaux' }).click();
  await expect(titreEcran(page)).toHaveText('Tarte aux poireaux');
  await page.getByRole('link', { name: 'Cuisiner' }).click();
  await expect(page.locator('.cuisine__progression-texte')).toHaveText(/^Étape 1 \/ \d+$/);
  await page.getByRole('button', { name: 'Quitter le mode cuisine' }).click();
  await expect(titreEcran(page)).toHaveText('Tarte aux poireaux');

  // Favoris et réglages
  await onglet(page, 'Favoris').click();
  await expect(titreEcran(page)).toHaveText('Favoris');
  await onglet(page, 'Réglages').click();
  await expect(titreEcran(page)).toHaveText('Réglages');
  await expect(page.locator('.reglages__info').filter({ hasText: 'Version' }).locator('dd')).toHaveText(VERSION);

  // --- Création d'une recette hors ligne ---
  await page.getByRole('link', { name: 'Nouvelle recette' }).click();
  await expect(titreEcran(page)).toHaveText('Nouvelle recette');
  await page.getByRole('textbox', { name: 'Titre (obligatoire)' }).fill('Soupe du jour hors ligne');
  const ingredient = page.getByRole('group', { name: 'Ingrédient 1', exact: true });
  if (page.viewportSize().width < 768) {
    await ingredient.getByLabel('Quantité, unité et nom').fill('1 l bouillon');
  } else {
    await ingredient.getByLabel('Quantité', { exact: true }).fill('1');
    await ingredient.getByLabel('Unité', { exact: true }).fill('l');
    await ingredient.getByLabel('Nom', { exact: true }).fill('bouillon');
  }
  await page.getByRole('textbox', { name: 'Étape 1', exact: true }).fill('Faire chauffer le bouillon.');
  await page.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(titreEcran(page)).toHaveText('Soupe du jour hors ligne');
  await expect(page.getByText('bouillon').first()).toBeVisible();

  // Elle survit à un nouveau rechargement hors ligne
  await page.reload();
  await expect(titreEcran(page)).toHaveText('Soupe du jour hors ligne');

  // Une adresse d'accueil avec requête (ex. lancement depuis l'écran d'accueil) s'ouvre aussi
  await page.goto(`${site.url}?source=pwa#/`);
  await expect(page.locator('.carte-recette')).toHaveCount(7);
  await context.setOffline(false);
});

test('mise à jour : bandeau « Recharger », SKIP_WAITING, ancien cache supprimé', async ({ page }) => {
  await page.goto(`${site.url}#/reglages`);
  await attendreServiceWorker(page);
  await expect(page.locator('.bandeau-maj')).toHaveCount(0);

  // Publication d'une nouvelle version : VERSION change dans app.js et dans sw.js
  const nouvelle = `${VERSION}-maj`;
  for (const fichier of ['sw.js', join('js', 'app.js')]) {
    const chemin = join(site.dossier, fichier);
    const source = await readFile(chemin, 'utf8');
    await writeFile(chemin, source.replace(`const VERSION = '${VERSION}'`, `const VERSION = '${nouvelle}'`));
  }
  await page.evaluate(async () => (await navigator.serviceWorker.getRegistration()).update());

  // La nouvelle version est installée mais attend : la page garde l'ancienne
  const bandeau = page.locator('.bandeau-maj');
  await expect(bandeau).toBeVisible();
  await expect(bandeau).toHaveAttribute('role', 'status');
  await expect(bandeau).toContainText('Nouvelle version disponible');
  expect((await nomsCaches(page)).sort()).toEqual([`recette-${VERSION}`, `recette-${nouvelle}`].sort());
  const versionAffichee = page.locator('.reglages__info').filter({ hasText: 'Version' }).locator('dd');
  await expect(versionAffichee).toHaveText(VERSION);

  // Recharger : la nouvelle version prend la main, la page se recharge
  const rechargement = page.waitForEvent('load');
  await bandeau.getByRole('button', { name: 'Recharger' }).click();
  await rechargement;
  await expect(versionAffichee).toHaveText(nouvelle);
  await expect(page.locator('.bandeau-maj')).toHaveCount(0);
  await expect.poll(() => nomsCaches(page)).toEqual([`recette-${nouvelle}`]);
});
