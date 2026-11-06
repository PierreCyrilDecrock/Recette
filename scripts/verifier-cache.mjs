// Vérifie que le service worker met bien en cache toute l'application :
// - chaque fichier présent dans css/, js/ et icones/ figure dans FICHIERS (sw.js) ;
// - chaque entrée de FICHIERS existe (« ./ » désigne index.html), sans doublon ;
// - index.html, le manifeste et ses icônes sont dans la liste ;
// - la VERSION de sw.js est celle de js/app.js.
// Usage : npm run verifier-cache (code de sortie 1 en cas d'écart).

import { readFile, readdir, stat } from 'node:fs/promises';
import { join, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const RACINE = fileURLToPath(new URL('..', import.meta.url));

/** Dossiers dont tous les fichiers doivent être mis en cache. */
const DOSSIERS = ['css', 'js', 'icones'];

/** Liste récursive des fichiers d'un dossier, en chemins relatifs à la racine (avec « / »). */
async function listerFichiers(racine, dossier) {
  const fichiers = [];
  for (const entree of await readdir(join(racine, dossier), { withFileTypes: true })) {
    if (entree.name.startsWith('.')) continue; // .DS_Store et autres fichiers cachés
    const chemin = join(dossier, entree.name);
    if (entree.isDirectory()) fichiers.push(...await listerFichiers(racine, chemin));
    else fichiers.push(chemin.split(sep).join('/'));
  }
  return fichiers;
}

/** Lit la constante VERSION d'un fichier JavaScript. */
function lireVersion(source) {
  return source.match(/const VERSION = '([^']+)'/)?.[1] ?? null;
}

const existe = (chemin) => stat(chemin).then((infos) => infos.isFile(), () => false);

/**
 * Compare la liste FICHIERS de sw.js aux fichiers réels.
 * @param {string} [racine] dossier de l'application
 * @returns {Promise<{ erreurs: string[], fichiers: string[] }>} erreurs vides si tout va bien
 */
export async function verifierCache(racine = RACINE) {
  const erreurs = [];
  const sw = await readFile(join(racine, 'sw.js'), 'utf8');
  const bloc = sw.match(/const FICHIERS = \[([\s\S]*?)\];/);
  if (!bloc) return { erreurs: ['sw.js : liste FICHIERS introuvable.'], fichiers: [] };
  const fichiers = [...bloc[1].matchAll(/'([^']+)'/g)].map((resultat) => resultat[1]);
  const liste = new Set(fichiers);

  for (const fichier of fichiers.filter((f, i) => fichiers.indexOf(f) !== i)) {
    erreurs.push(`En double dans FICHIERS : ${fichier}`);
  }
  for (const fichier of fichiers) {
    const chemin = fichier === './' ? 'index.html' : fichier;
    if (!(await existe(join(racine, chemin)))) erreurs.push(`Introuvable : ${fichier} (listé dans sw.js)`);
  }

  const attendus = ['./', 'manifest.webmanifest'];
  for (const dossier of DOSSIERS) attendus.push(...await listerFichiers(racine, dossier));
  const manifeste = JSON.parse(await readFile(join(racine, 'manifest.webmanifest'), 'utf8'));
  attendus.push(...(manifeste.icons ?? []).map((icone) => icone.src));
  for (const fichier of new Set(attendus)) {
    if (!liste.has(fichier)) erreurs.push(`Absent du cache : ${fichier} (à ajouter à FICHIERS dans sw.js)`);
  }

  const versionApp = lireVersion(await readFile(join(racine, 'js', 'app.js'), 'utf8'));
  const versionSw = lireVersion(sw);
  if (!versionApp || versionApp !== versionSw) {
    erreurs.push(`VERSION de sw.js (${versionSw}) différente de celle de js/app.js (${versionApp}).`);
  }
  return { erreurs, fichiers };
}

// Exécution en ligne de commande
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const { erreurs, fichiers } = await verifierCache();
  if (erreurs.length > 0) {
    console.error(erreurs.map((erreur) => `✗ ${erreur}`).join('\n'));
    process.exit(1);
  }
  console.log(`✓ ${fichiers.length} fichiers en cache, liste complète, versions identiques.`);
}
