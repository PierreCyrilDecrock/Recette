// Service worker : la liste des fichiers mis en cache (sw.js) couvre toute l'application.

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { cp, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { verifierCache } from '../scripts/verifier-cache.mjs';

const RACINE = fileURLToPath(new URL('..', import.meta.url));

/** Copie de l'application (sans node_modules ni tests) dans un dossier temporaire. */
async function copier() {
  const dossier = await mkdtemp(join(tmpdir(), 'recette-'));
  for (const element of ['index.html', 'manifest.webmanifest', 'sw.js', 'css', 'js', 'icones']) {
    await cp(join(RACINE, element), join(dossier, element), { recursive: true });
  }
  return dossier;
}

describe('verifierCache', () => {
  test('la liste de sw.js est complète et la version identique à js/app.js', async () => {
    const { erreurs, fichiers } = await verifierCache();
    assert.deepEqual(erreurs, []);
    assert.ok(fichiers.includes('./'));
    assert.ok(fichiers.includes('js/ecrans/reglages.js'), 'les écrans chargés par import() sont listés');
  });

  test('signale un fichier absent du cache, une entrée introuvable et une version différente', async () => {
    const dossier = await copier();
    try {
      await writeFile(join(dossier, 'js', 'ecrans', 'nouvel-ecran.js'), 'export function afficher() {}\n');
      await rm(join(dossier, 'css', 'ecrans.css'));
      await writeFile(join(dossier, 'js', 'app.js'), "export const VERSION = '9.9.9';\n");
      const { erreurs } = await verifierCache(dossier);
      assert.equal(erreurs.length, 3, erreurs.join('\n'));
      assert.match(erreurs.join('\n'), /Absent du cache : js\/ecrans\/nouvel-ecran\.js/);
      assert.match(erreurs.join('\n'), /Introuvable : css\/ecrans\.css/);
      assert.match(erreurs.join('\n'), /VERSION de sw\.js \(.+\) différente de celle de js\/app\.js \(9\.9\.9\)/);
    } finally {
      await rm(dossier, { recursive: true, force: true });
    }
  });
});
