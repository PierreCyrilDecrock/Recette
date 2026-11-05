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
  composants/   carte-recette.js, selecteur-portions.js, toast.js, minuteur.js
icones/       icônes de l'app (PWA)
tests/        tests unitaires (*.test.js) ; tests/e2e/ tests Playwright (*.spec.js)
docs/         cahier des charges et plan de développement
```

## Règles de code

- `js/modele.js` est **pur** : aucun accès au DOM ni à IndexedDB, uniquement des fonctions
  exportées, toutes testées dans `tests/modele.test.js`. Il doit pouvoir s'exécuter sous Node.
- Tous les textes d'interface vont dans `js/textes.js` (objet `T`), jamais en dur dans les écrans.
- Chaque écran exporte `afficher(conteneur, params)` qui peut renvoyer une fonction de nettoyage
  (retirer les écouteurs, libérer le Wake Lock, révoquer les URL d'objets…).
- Routage (`js/app.js`, table `ROUTES`) : `#/favoris` réutilise `liste.js` (`params.favoris`),
  `#/nouvelle` réutilise `edition.js` (sans `id`). Le routeur donne le focus au `<h1>` de l'écran ;
  les routes `immersif` (édition, cuisine) masquent la barre d'onglets et le bouton « + » ;
  `sansAjout` (fiche) masque seulement le « + », remplacé par la barre d'actions de l'écran.
  Les paramètres de requête du hash arrivent en chaînes dans `params` (`#/cuisine/:id?portions=6`
  → `params.portions`, à lire avec `lirePortions`) ; ceux du motif l'emportent.
- Les libellés de `index.html` portent `data-texte` / `data-texte-aria` (chemin dans `T`) :
  `app.js` les remplace au démarrage.
- Données : passer uniquement par `js/db.js` (jamais d'IndexedDB direct dans les écrans). Ses erreurs
  sont des `ErreurStockage` (`code`, `message` tiré de `T.stockage`, affichable tel quel) ;
  `ErreurValidation` porte en plus `erreurs` (`{ champ: message }`, à afficher sous chaque champ).
  Le champ technique `indexFavori` (index `favori`) n'existe qu'en base, jamais dans les recettes renvoyées.
- Insérer le texte saisi par l'utilisateur via `textContent`, jamais via `innerHTML`.
- Réglages connus (`lireReglage` / `ecrireReglage`) : `tri` (critère de la liste : `date`, `titre`
  ou `temps`, voir `CRITERES_TRI`).
- Sélecteur de portions : `creerSelecteurPortions({ valeur })` renvoie l'élément (propriété `valeur`),
  qui émet `EVENEMENT_PORTIONS` (`detail.portions`). Les portions choisies sur la fiche ne sont
  jamais enregistrées : elles passent au mode cuisine par l'URL.
- Messages éphémères : `afficherToast(message, { erreur })` de `js/composants/toast.js` (zone
  `role="status"` dans `<body>`, elle survit au changement d'écran).
- Confirmation d'une action destructrice : `<dialog>` modal (`showModal()`, `form method="dialog"`,
  focus sur Annuler) ; le focus est rendu au bouton qui a ouvert le menu.
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
  `<html>` force l'un des deux.
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

## Définition de « terminé » pour une étape

1. Les tests unitaires et de bout en bout sont verts.
2. Vérification visuelle à 360 px et 1024 px, en thème clair et sombre.
3. Aucune erreur dans la console du navigateur.
4. `CLAUDE.md` mis à jour si une convention change.
5. Un commit par étape, message en français.
