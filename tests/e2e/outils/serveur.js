// Outils partagés des tests de bout en bout (ce fichier n'est pas un test : *.js hors *.spec.js).
// servirCopie : sert une copie de l'application dans un sous-dossier (/Recette/, comme sur
// GitHub Pages), sur un port libre, sans cache HTTP. Les tests peuvent modifier la copie
// (publication d'une nouvelle version) sans toucher au dépôt.
import { createServer } from 'node:http';
import { cp, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { extname, join, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

export const RACINE = fileURLToPath(new URL('../../../', import.meta.url));
export const SOUS_DOSSIER = '/Recette/';
export const VERSION = (await readFile(join(RACINE, 'js', 'app.js'), 'utf8')).match(/const VERSION = '([^']+)'/)[1];

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
export async function servirCopie() {
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
export async function attendreServiceWorker(page) {
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
}

