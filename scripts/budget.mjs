// Budget de poids : le JavaScript de l'application (js/ et sw.js), compressé en gzip
// fichier par fichier comme le ferait le serveur, doit peser moins de 100 Ko au total.
// Usage : npm run budget (code de sortie 1 si le budget est dépassé).

import { readFile, readdir } from 'node:fs/promises';
import { join, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

const RACINE = fileURLToPath(new URL('..', import.meta.url));
/** Budget en octets : 100 Ko. */
export const BUDGET = 100 * 1024;

/** Liste récursive des fichiers .js d'un dossier, en chemins relatifs à la racine. */
async function listerJs(dossier) {
  const fichiers = [];
  for (const entree of await readdir(join(RACINE, dossier), { withFileTypes: true })) {
    const chemin = join(dossier, entree.name);
    if (entree.isDirectory()) fichiers.push(...await listerJs(chemin));
    else if (entree.name.endsWith('.js')) fichiers.push(chemin.split(sep).join('/'));
  }
  return fichiers;
}

/**
 * Poids de chaque fichier, brut et compressé (gzip niveau 9), du plus lourd au plus léger.
 * @returns {Promise<{ fichiers: { chemin: string, brut: number, gzip: number }[], total: number, totalBrut: number }>}
 */
export async function mesurer() {
  const chemins = [...await listerJs('js'), 'sw.js'];
  const fichiers = await Promise.all(chemins.map(async (chemin) => {
    const contenu = await readFile(join(RACINE, chemin));
    return { chemin, brut: contenu.length, gzip: gzipSync(contenu, { level: 9 }).length };
  }));
  fichiers.sort((a, b) => b.gzip - a.gzip);
  return {
    fichiers,
    total: fichiers.reduce((somme, f) => somme + f.gzip, 0),
    totalBrut: fichiers.reduce((somme, f) => somme + f.brut, 0),
  };
}

const ko = (octets) => `${(octets / 1024).toFixed(1).replace('.', ',')} Ko`;

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { fichiers, total, totalBrut } = await mesurer();
  for (const { chemin, brut, gzip } of fichiers) {
    console.log(`${ko(gzip).padStart(9)}  ${ko(brut).padStart(9)}  ${chemin}`);
  }
  const ok = total < BUDGET;
  console.log(`\n${ok ? '✓' : '✗'} JavaScript : ${ko(total)} compressé (${ko(totalBrut)} brut), budget ${ko(BUDGET)}.`);
  if (!ok) process.exitCode = 1;
}
