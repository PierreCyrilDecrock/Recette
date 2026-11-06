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
  icones.js     icônes SVG en ligne (icone(nom, { taille, libelle }))
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
  `sansAjout` (fiche) masque seulement le « + » sous 1024 px, remplacé par la barre d'actions.
  Chaque écran s'affiche dans un hôte neuf (`div.hote-ecran`, `display: contents`), retiré si
  la navigation devient obsolète pendant sa construction.
- Grand écran (≥ 1024 px, `ecranLarge`) : les routes `double` (`#/`, `#/favoris`, `#/recette/:id`)
  affichent deux volets (`.double` : `.double__liste` à gauche, collée, défilement propre ;
  `.double__detail` à droite : la fiche, ou l'invitation « Choisissez une recette »). La liste
  n'est pas reconstruite d'une fiche à l'autre (recherche et défilement gardés) ; sa fonction de
  nettoyage porte `selectionner(id)` (carte `aria-current="page"`, titre de la liste en `<h2>`
  sous le `<h1>` de la fiche). Elle se recharge à chaque écriture en base : `db.js` émet
  `EVENEMENT_CHANGEMENT` sur `changements` (recettes ou catégories modifiées). L'onglet de la
  liste affichée reste actif sur une fiche. Franchir 1024 px reconstruit l'écran sans déplacer
  le focus. La barre d'onglets et « Nouvelle recette » passent dans l'en-tête (`index.html` :
  marque, onglets, « + », dans cet ordre).
- Changement d'écran : `document.startViewTransition` quand il existe (classe `transitions-vues`
  sur `<html>`, noms `contenu` et `detail`), sinon l'animation CSS `apparition` de `.ecran` ;
  ni l'un ni l'autre en `prefers-reduced-motion`. Pendant une transition (≈ 200 ms), le
  navigateur adresse les événements à `<html>` : un test qui envoie des événements bruts
  attend `!document.activeViewTransition`.
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
- Icônes : uniquement `icone(nom, { taille, libelle, classe })` de `js/icones.js` (grille 24,
  contour 1,75 px, `currentColor`, classe `icone icone--<nom>`) ; décorative (`aria-hidden`)
  sans libellé, `role="img"` avec. `index.html` pose des emplacements `data-icone` (et
  `data-taille`) qu'`app.js` remplace au démarrage. Pas de `fill`/`stroke` en CSS sur les icônes
  (seulement `color`, et `fill` pour le cœur plein). Seules les illustrations d'états vides
  (`liste.js`) sont dessinées à part.
- Difficulté : `creerDifficulte(difficulte, { decoratif, taille })` de
  `js/composants/carte-recette.js` (3 toques, `.difficulte__toque--pleine` pour le niveau,
  les autres en filigrane), sur la carte, la fiche et les options du formulaire.
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
  `--danger`, `--contour` (contour des cartes : quasi invisible en clair, fin en sombre),
  `--teinte` (8 % d'accent sur la surface), `--ombre` (cartes, transparente en sombre) et
  `--ombre-haute` (ce qui flotte). Thèmes clair et sombre ; contraste texte/fond ≥ 4,5:1
  (ratios notés dans `css/base.css`). Accent avec parcimonie : actions principales, onglet
  actif, favori, numéros d'étape ; sélections neutres (puce en couleurs inversées, segment en
  pastille de surface).
- Espacements sur une échelle de 4 px : `--espace-xs` (4), `-s` (8), `-m` (12), `--espace` (16),
  `-l` (24), `-xl` (32) ; rayons `--rayon` (16), `--rayon-petit` (12), `--rayon-pilule` ;
  ombres composées `--ombre-carte`, `--ombre-flottante` ; marges latérales `--marge-gauche` et
  `--marge-droite` (safe areas comprises, contenu centré à 1200 px dès 1024 px).
- Thème : `light-dark()` + `color-scheme` suivent le système ; `data-theme="clair|sombre"` sur
  `<html>` force l'un des deux. Choix mémorisé dans `localStorage` (`recette.theme`, absent =
  système), seule exception à IndexedDB : le script en ligne de `index.html` doit le lire de façon
  synchrone pour l'appliquer avant le premier rendu (mêmes clé et couleurs que `reglages.js`).
- Cartes : coins arrondis de 16 px, marges internes de 16 px, ombre légère (`--ombre-carte`) et
  contour `--contour`.
- Typographie : `ui-rounded, system-ui, sans-serif` ; corps du texte ≥ 16 px.
- Transitions de 150 à 250 ms (`--duree-courte`, `--duree`, `--duree-longue`) ; retour au
  toucher par `:active` et `scale(var(--pression))` ; tout mouvement désactivé avec
  `prefers-reduced-motion`.
- Titres longs : `-webkit-line-clamp` (cartes, 3 lignes), ellipse sur une ligne (titre du mode
  cuisine, puces de catégories de la liste), coupure des mots trop longs ailleurs ; rien ne
  déborde de 320 à 1440 px (`tests/e2e/design.spec.js`).
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
