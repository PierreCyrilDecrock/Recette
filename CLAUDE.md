# Recette — guide du projet

Application web mobile first pour créer, ranger et cuisiner ses recettes, inspirée de Croûton.
Cœur du produit : la fiche recette (infos, ingrédients, étapes) et un mode cuisine étape par étape.
Tout fonctionne hors ligne, sans compte ni serveur : les données restent sur l'appareil.

- Spécification : `docs/cahier-des-charges.md` (fait foi en cas de doute).
- Feuille de route et prompts par étape : `docs/plan-de-developpement.md`.

## Pile technique

- HTML5 sémantique, CSS moderne (variables, Grid, Flexbox, `clamp()`), JavaScript ES2022 en modules natifs.
- Sans framework et sans étape de build : les fichiers sont servis tels quels.
- Données dans IndexedDB (magasins `recettes`, `categories`, `reglages`).
- PWA : `manifest.webmanifest` et service worker `sw.js` (cache des fichiers de l'app).
- Routage par hash : `#/`, `#/favoris`, `#/recette/:id`, `#/nouvelle`, `#/edition/:id`, `#/cuisine/:id`, `#/reglages`.

## Arborescence cible

```
index.html
manifest.webmanifest
sw.js
css/          base.css, composants.css, ecrans.css
js/
  app.js        démarrage et routeur
  db.js         accès IndexedDB
  modele.js     logique métier pure (validation, mise à l'échelle, parsing…)
  textes.js     tous les textes d'interface (objet T)
  exemples.js   recettes d'exemple
  icones.js     icônes SVG en ligne
  ecrans/       liste.js, fiche.js, edition.js, cuisine.js, reglages.js
  composants/   carte-recette.js, selecteur-portions.js, toast.js, minuteur.js, liste-lignes.js,
                liste-ingredients.js
icones/       icônes de l'app (PWA) : source icone.svg, PNG et favicons générés
scripts/      outils de dev : icones.mjs (génère les icônes), verifier-cache.mjs
tests/        tests unitaires (*.test.js) ; tests/e2e/ tests Playwright (*.spec.js)
docs/         cahier des charges et plan de développement
```

## Règles de code

- `js/modele.js` est **pur** : aucun accès au DOM ni à IndexedDB, uniquement des fonctions
  exportées, toutes testées dans `tests/modele.test.js`. Il doit pouvoir s'exécuter sous Node.
- Tous les textes d'interface vont dans `js/textes.js` (objet `T`), jamais en dur dans les écrans.
- Chaque écran exporte `afficher(conteneur, params)` qui peut renvoyer une fonction de nettoyage
  (retirer les écouteurs, libérer le Wake Lock, révoquer les URL d'objets…). Cette fonction peut
  porter une garde `confirmerSortie()` : elle renvoie `true` (partir tout de suite) ou une
  `Promise<boolean>`. Le routeur revient alors à l'URL de l'écran, attend la réponse, puis rejoue
  la navigation (lien, retour ou avance) ; il note pour cela `position` dans `history.state`,
  avant d'appeler `afficher` (l'écran peut donc la lire). Elle peut aussi porter
  `mettreAJour(params)` : quand seule la requête change sur le même écran (même route, mêmes
  paramètres du motif), le routeur la lui passe ; `true` évite de reconstruire l'écran.
- Routage (`js/app.js`, table `ROUTES`) : `#/favoris` réutilise `liste.js` (`params.favoris`),
  `#/nouvelle` réutilise `edition.js` (sans `id`). Le routeur donne le focus au `<h1>` de l'écran ;
  les routes `immersif` (édition, cuisine) masquent la barre d'onglets et le bouton « + » ;
  `sansAjout` (fiche) masque seulement le « + », remplacé par la barre d'actions de l'écran.
  Les paramètres de requête du hash arrivent en chaînes dans `params` (`#/cuisine/:id?portions=6`
  → `params.portions`, à lire avec `lirePortions`) ; ceux du motif l'emportent.
- Mode cuisine (E4, `cuisine.js`) : `#/cuisine/:id?portions=N&etape=K` (`etape` omis pour la
  première, `fin` pour « Bon appétit ! », lu par `lireEtape`). Chaque changement d'étape est une
  entrée d'historique (le retour du navigateur recule d'une étape), traitée par `mettreAJour`.
  Quitter revient d'abord à l'entrée de départ (`history.go`), puis la remplace par la fiche
  (`?portions=N` si les portions venaient de l'URL). Balayage décidé par `sensGlissement` ;
  écran allumé par `navigator.wakeLock`, redemandé à `visibilitychange`, libéré au nettoyage.
- Les libellés de `index.html` portent `data-texte` / `data-texte-aria` (chemin dans `T`) :
  `app.js` les remplace au démarrage.
- Données : passer uniquement par `js/db.js` (jamais d'IndexedDB direct dans les écrans). Ses erreurs
  sont des `ErreurStockage` (`code`, `message` tiré de `T.stockage`, affichable tel quel) ;
  `ErreurValidation` porte en plus `erreurs` (`{ champ: message }`, à afficher sous chaque champ).
  Le champ technique `indexFavori` (index `favori`) n'existe qu'en base, jamais dans les recettes renvoyées.
- Insérer le texte saisi par l'utilisateur via `textContent`, jamais via `innerHTML`.
- Réglages connus (`lireReglage` / `ecrireReglage`) : `tri` (critère de la liste : `date`, `titre`
  ou `temps`, voir `CRITERES_TRI`) ; brouillons du formulaire sous `cleBrouillon(id)`
  (`brouillon:<id>` ou `brouillon:nouvelle`, objet `{ date, etat }`). Les réglages sont propres à
  l'appareil : ni exportés ni importés.
- Export / import (E5, `reglages.js`) : fichier `recettes-AAAA-MM-JJ.json` (`nomFichierExport`) au
  format `{ app: "recette", version: 1, dateExport, recettes, categories }` (`FORMAT_EXPORT`,
  catégories en noms). Un fichier importé passe par `analyserImport` (format, version, chaque
  recette par `validerRecette` → `recettes` valides et `invalides` listées) ; `toutImporter` en
  mode `fusionner` (version la plus récente gardée) ou `remplacer`.
- Version de l'app : `VERSION` exportée par `js/app.js`, à changer à chaque publication. `sw.js`
  en porte une copie (le navigateur ne voit une mise à jour que si `sw.js` change) :
  `npm run verifier-cache` échoue si elles diffèrent.
- Service worker (`sw.js`, enregistré par `app.js` en HTTPS ou sur localhost) : `FICHIERS` liste
  tout ce qui est mis en cache à l'installation (chaque nouveau fichier de `css/`, `js/` ou
  `icones/` doit y être ajouté, `npm run verifier-cache` le contrôle) ; cache d'abord, cache
  `recette-<VERSION>`, anciens caches supprimés à l'activation. Pas de `skipWaiting` automatique :
  `app.js` affiche le bandeau « Nouvelle version disponible — Recharger », qui envoie
  `{ type: 'SKIP_WAITING' }` puis recharge à `controllerchange`. En local, le cache sert les
  anciens fichiers : cocher « Update on reload » dans les DevTools, ou changer `VERSION`.
  Les tests Playwright bloquent le service worker (`serviceWorkers: 'block'`), sauf
  `tests/e2e/hors-ligne.spec.js`.
- Icônes : seule `icones/icone.svg` se modifie à la main ; `npm run icones` régénère les PNG
  (192, 512, maskable 512, Apple 180), `favicon.svg` et `favicon.ico`.
- Sélecteur de portions : `creerSelecteurPortions({ valeur })` renvoie l'élément (propriété `valeur`),
  qui émet `EVENEMENT_PORTIONS` (`detail.portions`). Les portions choisies sur la fiche ne sont
  jamais enregistrées : elles passent au mode cuisine par l'URL.
- Messages éphémères : `afficherToast(message, { erreur })` de `js/composants/toast.js` (zone
  `role="status"` dans `<body>`, elle survit au changement d'écran).
- Confirmation d'une action destructrice : `<dialog>` modal (`showModal()`, `form method="dialog"`,
  focus sur Annuler) ; le focus est rendu au bouton qui a ouvert le menu.
- Formulaire (E3, `edition.js`) : les saisies se lisent avec `lireQuantiteSaisie` (« 1,5 », « 1/2 »)
  et `lireMinutesSaisie` (vide → `undefined`, invalide → `NaN`, que `validerRecette` refuse) ; les
  quantités se réécrivent avec `formaterQuantiteSaisie`. Avant validation et enregistrement, la
  recette passe par `nettoyerSaisie` (lignes vides retirées, textes nettoyés). Les champs non
  affichés (`section`, `minuteur`, `favori`, `photo`, dates) sont conservés tels quels. Chaque
  message d'erreur a l'id `edition-erreur-<champ>` (clé de `validerRecette`). Annuler et Enregistrer
  remplacent l'entrée d'historique (`location.replace`) par la fiche, ou par la liste.
  Le formulaire se décrit par un « état » (valeurs brutes des champs, `autres` pour les champs non
  affichés) : pré-remplissage, brouillon (500 ms après chaque modification) et détection des
  modifications (confirmation de sortie, `beforeunload`) passent par lui.
  Ligne libre d'un ingrédient (mode par défaut sous 768 px) : analysée par `analyserLigneIngredient`
  à la sortie du champ, réécrite par `composerLigneIngredient`. Collage de plusieurs lignes :
  `decouperLignesCollees` (`{ paragraphes: true }` pour les étapes).
- Lignes réordonnables : `creerListeLignes({ creerContenu, libelles })` de
  `js/composants/liste-lignes.js` (poignée en Pointer Events, menu de ligne Monter / Descendre /
  actions propres / Supprimer, annonce aria-live, événement `EVENEMENT_LIGNES`). On déplace la
  voisine plutôt que la ligne tenue : elle garde ainsi son focus et sa capture du pointeur.
- Liste d'ingrédients affichée (fiche, panneau du mode cuisine) : `creerListeIngredients(ingredients)`
  de `js/composants/liste-ingredients.js` (quantités déjà mises à l'échelle, sections en `<h3>`).
- Bulle d'information : `<span class="bulle" popover="auto">` placée juste après son bouton
  (`popoverTargetElement`, ordre de lecture conservé), positionnée en JS à l'ouverture ; repli sur
  `hidden` sans l'API Popover. Panneau qui monte du bas : `<dialog class="panneau">` en `showModal()`.
- Visuel par défaut d'une recette sans photo : `creerVisuel(recette)` de `js/composants/carte-recette.js`
  (dégradé dont la teinte vient de `teinteVisuel(id)`, initiale via `initiale(titre)`), à réutiliser
  tel quel par la fiche et le mode cuisine.
- Code commenté en français ; noms de variables et de fonctions en français, alignés sur le
  modèle de données (`titre`, `portions`, `tempsPreparation`, `etapes`…).
- Aucune dépendance d'exécution (les `devDependencies` servent uniquement aux tests et aux outils).
- Budget : moins de 100 Ko de JavaScript compressé au total.
- Chemins relatifs partout : l'app doit fonctionner dans un sous-dossier (GitHub Pages).

## Règles d'interface

- Mobile first, maquettes à 360 px ; points de rupture à 768 px (fiche en deux colonnes)
  et 1024 px (liste et fiche côte à côte).
- Actions principales dans la zone du pouce (bas de l'écran) ; cibles tactiles ≥ 44 × 44 px.
- Couleurs uniquement via les variables CSS : `--accent`, `--surface`, `--fond`, `--texte`,
  `--texte-doux`, `--bordure`, plus `--sur-accent` (texte posé sur l'accent ou le danger),
  `--danger` et `--ombre`. Thèmes clair et sombre ; contraste texte/fond ≥ 4,5:1 (ratios notés
  dans `css/base.css`).
- Thème : `light-dark()` + `color-scheme` suivent le système ; `data-theme="clair|sombre"` sur
  `<html>` force l'un des deux. Choix mémorisé dans `localStorage` (`recette.theme`, absent =
  système), seule exception à IndexedDB : le script en ligne de `index.html` doit le lire de façon
  synchrone pour l'appliquer avant le premier rendu (mêmes clé et couleurs que `reglages.js`).
- Cartes : coins arrondis de 16 px, marges internes de 16 px, ombre légère ou bordure fine.
- Typographie : `ui-rounded, system-ui, sans-serif` ; corps du texte ≥ 16 px.
- Transitions de 150 à 250 ms ; tout mouvement désactivé avec `prefers-reduced-motion`.
- Encoches et barre système : `env(safe-area-inset-*)`.
- Accessibilité WCAG 2.2 AA : libellés ARIA, navigation clavier, focus visible.

## Commandes

| Action | Commande |
| --- | --- |
| Installer les outils de dev | `npm install` |
| Servir l'app | `npm run serve` (ou `python3 -m http.server 8000`) |
| Tests unitaires | `npm test` (`node --test`, Node ≥ 22) |
| Tests de bout en bout | `npm run e2e` (Playwright, dossier `tests/e2e/`) |
| Vérifier la liste du cache | `npm run verifier-cache` |
| Régénérer les icônes | `npm run icones` |

## Définition de « terminé » pour une étape

1. Les tests unitaires et de bout en bout sont verts.
2. Vérification visuelle à 360 px et 1024 px, en thème clair et sombre.
3. Aucune erreur dans la console du navigateur.
4. `CLAUDE.md` mis à jour si une convention change.
5. Un commit par étape, message en français.
