// Génère les icônes de l'application à partir de la source icones/icone.svg :
//   icone-192.png, icone-512.png    icônes « any » du manifeste (coins arrondis, fond transparent)
//   icone-maskable-512.png          icône « maskable » (fond plein, toque dans la zone sûre)
//   apple-touch-icon.png            180 px, fond plein (iOS arrondit lui-même)
//   favicon.svg, favicon.ico        16 et 32 px, toque agrandie et simplifiée
// Rendu par Chromium (Playwright, dépendance de développement). Usage : npm run icones

import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const DOSSIER = fileURLToPath(new URL('../icones/', import.meta.url));
const SOURCE = await readFile(`${DOSSIER}icone.svg`, 'utf8');

/**
 * Variantes de la source : rayon des coins du fond (sur 512), agrandissement de la toque,
 * plis visibles ou non.
 */
const VARIANTES = {
  any: { rayon: 112, echelle: 1.2, plis: true },
  maskable: { rayon: 0, echelle: 1, plis: true },
  apple: { rayon: 0, echelle: 1.12, plis: true },
  favicon: { rayon: 96, echelle: 1.4, plis: false },
};

/** Fichiers PNG à produire : nom, taille en pixels, variante. */
const PNG = [
  ['icone-192.png', 192, 'any'],
  ['icone-512.png', 512, 'any'],
  ['icone-maskable-512.png', 512, 'maskable'],
  ['apple-touch-icon.png', 180, 'apple'],
];

/** Tailles du favicon .ico (une image PNG par taille). */
const TAILLES_ICO = [16, 32];

const navigateur = await chromium.launch();
const page = await navigateur.newPage({ deviceScaleFactor: 1 });

/** Charge la source dans la page et lui applique une variante ; renvoie le SVG obtenu. */
async function preparer(variante, taille) {
  await page.setViewportSize({ width: taille, height: taille });
  await page.setContent(`<!doctype html><html><head><style>
    html, body { margin: 0; background: transparent; }
    svg { display: block; width: ${taille}px; height: ${taille}px; }
  </style></head><body>${SOURCE}</body></html>`);
  return page.evaluate(({ rayon, echelle, plis }) => {
    const svg = document.querySelector('svg');
    svg.querySelector('#fond').setAttribute('rx', String(rayon));
    svg.querySelector('#toque').setAttribute('transform', `translate(256 256) scale(${echelle}) translate(-256 -256)`);
    if (!plis) svg.querySelector('#plis').remove();
    // Les commentaires de la source n'ont pas leur place dans les fichiers dérivés
    const parcours = document.createTreeWalker(svg, NodeFilter.SHOW_COMMENT);
    const commentaires = [];
    while (parcours.nextNode()) commentaires.push(parcours.currentNode);
    commentaires.forEach((commentaire) => commentaire.remove());
    return new XMLSerializer().serializeToString(svg);
  }, VARIANTES[variante]);
}

/** Rendu PNG (fond transparent hors du fond arrondi). */
async function rendre(variante, taille) {
  await preparer(variante, taille);
  return page.locator('svg').screenshot({ omitBackground: true });
}

/**
 * Assemble un fichier .ico contenant des images PNG (format accepté par tous les
 * navigateurs actuels) : en-tête, une entrée de 16 octets par image, puis les données.
 */
function assemblerIco(images) {
  const entete = Buffer.alloc(6);
  entete.writeUInt16LE(0, 0); // réservé
  entete.writeUInt16LE(1, 2); // type : icône
  entete.writeUInt16LE(images.length, 4);
  let decalage = 6 + 16 * images.length;
  const entrees = images.map(({ taille, donnees }) => {
    const entree = Buffer.alloc(16);
    entree.writeUInt8(taille >= 256 ? 0 : taille, 0); // largeur
    entree.writeUInt8(taille >= 256 ? 0 : taille, 1); // hauteur
    entree.writeUInt8(0, 2); // palette
    entree.writeUInt8(0, 3); // réservé
    entree.writeUInt16LE(1, 4); // plans
    entree.writeUInt16LE(32, 6); // bits par pixel
    entree.writeUInt32LE(donnees.length, 8);
    entree.writeUInt32LE(decalage, 12);
    decalage += donnees.length;
    return entree;
  });
  return Buffer.concat([entete, ...entrees, ...images.map((image) => image.donnees)]);
}

for (const [nom, taille, variante] of PNG) {
  await writeFile(`${DOSSIER}${nom}`, await rendre(variante, taille));
  console.log(`icones/${nom} (${taille} px)`);
}

const images = [];
for (const taille of TAILLES_ICO) images.push({ taille, donnees: await rendre('favicon', taille) });
await writeFile(`${DOSSIER}favicon.ico`, assemblerIco(images));
console.log(`icones/favicon.ico (${TAILLES_ICO.join(', ')} px)`);

const favicon = await preparer('favicon', 32);
await writeFile(`${DOSSIER}favicon.svg`, `${favicon.replace(/\n\s*(?=\n)/g, '')}\n`);
console.log('icones/favicon.svg');

await navigateur.close();
