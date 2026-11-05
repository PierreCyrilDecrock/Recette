# Plan de développement — Application Recette

Ce plan découpe le cahier des charges (`docs/cahier-des-charges.md`) en **22 étapes** courtes. Chaque étape a un prompt prêt à coller dans Claude Code. Chaque étape donne un résultat qui fonctionne, se teste et se commite seul.

## Mode d'emploi

1. **Une étape par session.** Lancez `/clear` (ou ouvrez une nouvelle session) avant chaque étape. Le fichier `CLAUDE.md` créé à l'étape 0 transmet le contexte d'une session à l'autre.
2. **Planifier d'abord pour les grosses étapes.** Pour les étapes marquées 🧭, passez en mode plan (Maj+Tab) avant de coller le prompt. Relisez le plan, puis validez-le.
3. **Vérifier avant de valider.** Chaque étape se termine par une liste de vérifications. Ouvrez l'app sur votre téléphone ou en vue mobile (360 px) dans le navigateur.
4. **Relire, puis commiter.** Après chaque étape, lancez `/code-review`, corrigez si besoin, puis demandez le commit et le push.
5. **Respecter l'ordre.** Chaque lot doit être utilisable seul avant de passer au suivant. Le lot 1 suffit à remplacer un cahier de recettes papier.

### Vue d'ensemble

| # | Étape | Lot | Dépend de |
| --- | --- | --- | --- |
| 0 | Fondations : `CLAUDE.md`, outillage, conventions | — | — |
| 1 | Squelette : HTML, thèmes CSS, routeur, barre d'onglets | 1 | 0 |
| 2 | `modele.js` : validation, mise à l'échelle, arrondis, parsing, recherche + tests | 1 | 0 |
| 3 | `db.js` : IndexedDB, persistance, recettes d'exemple | 1 | 2 |
| 4 | E1 : liste, recherche, catégories, tri, état vide, favoris | 1 | 1, 3 |
| 5 | E2 : fiche recette et sélecteur de portions | 1 | 4 |
| 6 | E3 : formulaire (saisie, validation) | 1 | 5 |
| 7 | E3 : ergonomie (Entrée, glisser-déposer, collage intelligent, brouillon) | 1 | 6 |
| 8 | E4 : mode cuisine étape par étape | 1 | 5 |
| 9 | E5 : réglages, catégories, export / import JSON | 1 | 4 |
| 10 | PWA : manifest, icônes, service worker, hors ligne | 1 | 1–9 |
| 11 | Design final : icônes SVG, animations, mises en page tablette et bureau | 1 | 1–10 |
| 12 | Accessibilité, performance, tests de bout en bout, mise en ligne | 1 | 1–11 |
| 13 | Sections d'ingrédients et cases à cocher | 2 | MVP |
| 14 | Photo de la recette | 2 | MVP |
| 15 | Minuteurs | 2 | MVP |
| 16 | Impression et couleur d'accent | 2 | MVP |
| 17 | Liste de courses | 3 | Lot 2 |
| 18 | Planning de la semaine | 3 | 17 |
| 19 | Partage d'une recette par lien | 4 | Lot 3 |
| 20 | Import depuis une URL (schema.org) | 4 | Lot 3 |
| 21 | Synchronisation entre appareils | 4 | décision préalable |

### Points du cahier des charges tranchés dans ce plan

- **Export / import JSON** : le tableau des lots le classe en lot 2. Pourtant, l'écran E5 et les critères de recette du MVP l'exigent. Il est donc fait au **lot 1** (étape 9).
- **Champ `section` des ingrédients** : il existe dès le modèle de données du MVP, mais son affichage est fait au lot 2 (étape 13).
- **Police** : la pile retenue est `ui-rounded, system-ui, sans-serif`. `ui-rounded` donne la police arrondie d'Apple sur iOS et macOS, sans aucun téléchargement. Nunito reste une option, auto-hébergée pour fonctionner hors ligne.
- **Tests** : `node --test` est intégré à Node 20+, sans dépendance. Playwright sert aux tests de bout en bout, en dépendance de développement uniquement. Le `package.json` ne sert qu'aux outils : l'app reste servie telle quelle, sans build.
- **Lot 4** : l'import par URL et la synchronisation se heurtent à l'exigence « aucune donnée envoyée à un serveur » et aux restrictions CORS des navigateurs. Les étapes 20 et 21 commencent donc par une décision à prendre (voir ces étapes).
- **Ligne « embedded content » du cahier** : le contenu intégré ne s'est pas exporté. Le tableau ci-dessus le remplace.

---

## Étape 0 — Fondations

**Objectif** : poser les conventions que toutes les sessions suivantes respecteront.

```text
Nous démarrons le développement de l'application décrite dans docs/cahier-des-charges.md. Lis-le entièrement.

Crée les fondations du projet, sans encore coder l'application :

1. Un fichier CLAUDE.md à la racine, en français, concis (moins de 120 lignes), qui contient :
   - Le résumé du projet en 3 lignes et un renvoi vers docs/cahier-des-charges.md et docs/plan-de-developpement.md.
   - La pile : HTML5, CSS moderne, JavaScript ES2022 en modules natifs, sans framework et sans étape de build. Stockage IndexedDB. PWA.
   - L'arborescence cible (celle du cahier des charges, plus js/textes.js, js/exemples.js, js/icones.js et tests/).
   - Les règles de code :
     * js/modele.js est pur : aucun accès au DOM ni à IndexedDB, uniquement des fonctions exportées, testées dans tests/modele.test.js.
     * Tous les textes d'interface vont dans js/textes.js (objet T), jamais en dur dans les écrans.
     * Chaque écran exporte une fonction afficher(conteneur, params) qui renvoie une fonction de nettoyage optionnelle.
     * Code commenté en français, noms de variables et de fonctions en français comme dans le modèle de données.
     * Aucune dépendance d'exécution. Budget : moins de 100 Ko de JavaScript compressé au total.
   - Les règles d'interface : mobile first à 360 px ; points de rupture à 768 px et 1024 px ; cibles tactiles d'au moins 44 × 44 px ; variables CSS --accent, --surface, --fond, --texte, --texte-doux, --bordure ; coins arrondis de 16 px ; corps du texte à 16 px minimum ; transitions de 150 à 250 ms ; respect de prefers-reduced-motion ; env(safe-area-inset-*).
   - Les commandes : servir l'app (npx serve . ou python3 -m http.server 8000), tests unitaires (npm test), tests de bout en bout (npm run e2e).
   - La définition de « terminé » pour une étape : tests verts, vérification visuelle à 360 px et 1024 px, aucune erreur dans la console, CLAUDE.md mis à jour si une convention change, un commit en français.
2. Un package.json (private: true, type: module) avec les scripts test (node --test tests/), serve et e2e (playwright test), et @playwright/test en devDependencies.
3. Un .gitignore (node_modules, test-results, playwright-report, .DS_Store).
4. Un .editorconfig (2 espaces, LF, UTF-8).
5. Un README.md court : présentation, lancement en local, liste des lots.

Ne crée pas encore les fichiers de l'application. Termine en me montrant le CLAUDE.md, puis commite avec le message « Fondations du projet ».
```

**Vérifications**
- [ ] `CLAUDE.md` est clair et ne contredit pas le cahier des charges.
- [ ] `npm install`, puis `npm test`, s'exécutent sans erreur (aucun test pour l'instant).

---

## Lot 1 — MVP

### Étape 1 — Squelette de l'application 🧭

**Objectif** : une coquille navigable, avec thèmes clair et sombre, sur laquelle brancher les écrans.

```text
Étape 1 du plan (docs/plan-de-developpement.md) : le squelette de l'application.

Crée :
- index.html : HTML sémantique, lang="fr", meta viewport avec viewport-fit=cover, meta theme-color pour le thème clair et pour le sombre. La structure contient un <header> de page, un <main id="app"> pour les écrans, une barre d'onglets <nav> en bas (Recettes, Favoris, Réglages) et un bouton flottant « + » (aria-label « Nouvelle recette ») au-dessus de la barre, dans la zone du pouce.
- css/base.css : reset léger ; variables de couleur pour le thème clair et le thème sombre. Le thème suit prefers-color-scheme par défaut et peut être forcé par l'attribut data-theme="clair|sombre" sur <html>. L'accent par défaut est un orange tomate dont le contraste fait au moins 4,5:1 sur la surface, dans les deux thèmes (vérifie et note les ratios en commentaire). Typographie ui-rounded, system-ui, sans-serif, 16 px minimum. Focus visible. Utilitaires (.visuellement-cache…). Safe areas. Bloc prefers-reduced-motion.
- css/composants.css : carte, bouton (principal, secondaire, icône, danger), puce, champ de formulaire, boutons segmentés, barre d'onglets, bouton flottant. Cibles de 44 px minimum.
- css/ecrans.css : vide pour l'instant, avec un commentaire par écran.
- js/textes.js : un objet T exporté, regroupé par écran.
- js/app.js : un routeur par hash avec les routes #/ (liste), #/favoris, #/recette/:id, #/nouvelle, #/edition/:id, #/cuisine/:id et #/reglages. Le routeur charge l'écran voulu par import() dynamique, appelle la fonction de nettoyage de l'écran précédent, met à jour l'onglet actif (aria-current="page") et donne le focus au titre du nouvel écran. Il masque la barre d'onglets et le bouton « + » en mode cuisine et en édition. Une route inconnue renvoie vers #/.
- js/ecrans/*.js : un écran provisoire par route, qui affiche son titre et ses paramètres.

Contraintes : aucune dépendance ; tout fonctionne en ouvrant l'app avec npx serve. Vérifie le rendu à 360 px avec Playwright (capture dans le thème clair et dans le sombre) et l'absence d'erreurs dans la console. Commite ensuite.
```

**Vérifications**
- [ ] Les onglets, le bouton « + » et le bouton retour du navigateur naviguent correctement.
- [ ] Le thème sombre s'applique quand le système est en mode sombre.
- [ ] La navigation au clavier (Tab) montre un focus visible partout.

### Étape 2 — Logique métier et tests unitaires 🧭

**Objectif** : tout le calcul, testé, avant la moindre interface.

```text
Étape 2 du plan : js/modele.js et ses tests unitaires. Ce module est pur : aucun accès au DOM ni au stockage. Il doit aussi s'exécuter sous Node.

Implémente et documente (JSDoc) les fonctions exportées suivantes :

1. creerRecette(donnees) : renvoie une recette complète avec ses valeurs par défaut (id via crypto.randomUUID(), difficulte « facile », portions 4, favori false, categories [], dateCreation et dateModification en ISO).
2. validerRecette(recette) : renvoie { valide, erreurs }. erreurs est un objet { champ: message } qui applique toutes les règles du tableau « Modèle de données » du cahier : titre de 1 à 120 caractères après trim, description de 500 caractères au maximum, difficulté dans l'énumération, temps entiers dans leurs bornes, portions de 1 à 100, au moins un ingrédient avec un nom, au moins une étape avec un texte. Les messages viennent de js/textes.js.
3. tempsTotal(recette) : préparation + cuisson + repos, en ignorant les valeurs absentes.
4. formaterDuree(minutes) : « 45 min », « 1 h », « 1 h 15 », « 2 j 3 h » au-delà de 24 h.
5. mettreALEchelle(ingredients, portionsOrigine, portionsCible) : renvoie une nouvelle liste. Les quantités absentes restent absentes.
6. arrondirQuantite(quantite, unite) et formaterQuantite(quantite, unite), avec un arrondi intelligent :
   - pièce : entier le plus proche, minimum 1 si la quantité est > 0 ; pour une quantité < 1, ½ ou ¼ ;
   - c. à s., c. à c., tasse et unités libres : quart le plus proche, affiché en fractions (¼, ½, ¾, 1 ½) ;
   - g et ml : 1 décimale sous 10, au plus proche de 5 entre 10 et 100, de 10 au-delà ;
   - kg et l : 2 décimales au maximum, sans zéros inutiles ;
   - affichage en français : virgule décimale, espace insécable avant l'unité.
7. analyserLigneIngredient(texte) : décompose une ligne libre en { quantite, unite, nom, precision }. Exemples à couvrir par les tests : « 200 g farine », « 200g de farine », « 2 c. à s. d'huile d'olive », « 1/2 citron », « ½ citron », « 1,5 kg de pommes de terre », « 3 œufs », « 1 pincée de sel », « sel et poivre », « 2 oignons, émincés » (la précision vient après la virgule), « 10 cl de lait ». Reconnaître les variantes d'unités : cs, càs, c.à.s, cuillère(s) à soupe, cc, gr, litre(s)… Les ramener aux unités canoniques du cahier.
8. normaliser(texte) : minuscules, sans accents (NFD), espaces réduits.
9. rechercher(recettes, requete) : filtre insensible aux accents et à la casse sur le titre, les noms d'ingrédients et les notes. Tous les mots de la requête doivent être présents. Doit tenir en moins de 100 ms pour 500 recettes (ajoute un test de performance avec 500 recettes générées).
10. trier(recettes, critere) : critere vaut « date » (plus récente d'abord), « titre » (localeCompare fr) ou « temps ».
11. trouverIngredientsDansTexte(texte, ingredients) : renvoie les plages { debut, fin, indexIngredient } des ingrédients cités dans le texte d'une étape. La recherche ignore accents et casse et tolère le singulier et le pluriel (poireau / poireaux, œuf / œufs). Elle préfère la correspondance la plus longue (« pommes de terre » plutôt que « pomme »).
12. dupliquerRecette(recette) : nouvel id, titre suivi de « (copie) », nouvelles dates, favori false.

Écris tests/modele.test.js avec node:test et node:assert/strict, au moins 3 cas par fonction, dont les cas limites. Le critère du cahier « passer de 4 à 6 portions multiplie les quantités par 1,5 avec un arrondi lisible » doit être un test explicite. Lance npm test jusqu'à ce que tout soit vert, puis commite.
```

**Vérifications**
- [ ] `npm test` est vert.
- [ ] Les cas d'arrondi vous semblent naturels (lisez les tests : ce sont vos règles de cuisine).

### Étape 3 — Stockage IndexedDB

```text
Étape 3 du plan : js/db.js, l'accès aux données dans IndexedDB, sans librairie.

- Base « recette », version 1. Magasins : recettes (keyPath id, index dateModification et favori), categories (keyPath nom) et reglages (clé/valeur).
- Fonctions async exportées : ouvrir(), listerRecettes(), lireRecette(id), enregistrerRecette(recette), qui met à jour dateModification et n'accepte que des recettes valides (validerRecette de modele.js), supprimerRecette(id), basculerFavori(id), listerCategories(), enregistrerCategorie(nom), renommerCategorie(ancien, nouveau), qui répercute le changement sur toutes les recettes dans une seule transaction, supprimerCategorie(nom), qui la retire aussi des recettes, lireReglage(cle, defaut), ecrireReglage(cle, valeur), toutExporter(), toutImporter(donnees, { mode: 'fusionner' | 'remplacer' }) et toutEffacer().
- Une recette enregistrée avec une catégorie inconnue crée cette catégorie.
- Au premier enregistrement, appeler navigator.storage.persist() une seule fois et mémoriser le résultat dans reglages.
- Chaque écriture attend la fin de sa transaction (oncomplete) avant de se résoudre, pour ne rien perdre en cas de fermeture brutale.
- Les erreurs (quota dépassé, base bloquée) remontent avec un message de js/textes.js.
- Crée js/exemples.js avec 6 recettes d'exemple françaises, variées et complètes, qui couvrent les trois difficultés, plusieurs catégories (Entrée, Plat, Dessert, Végétarien, Rapide), au moins une recette avec du temps de repos et des étapes contenant des durées (« 15 min »). Inclure la tarte aux poireaux du cahier. Fonction chargerExemples().

Écris tests/db.test.js avec fake-indexeddb en devDependency. Il couvre le CRUD, le renommage et la suppression de catégorie, puis un aller-retour export → effacement → import qui restitue des données identiques. Lance npm test, puis commite.
```

**Vérifications**
- [ ] `npm test` est vert.
- [ ] Dans les outils de développement (onglet Application > IndexedDB), la base et ses trois magasins existent.

### Étape 4 — E1 : liste des recettes et favoris 🧭

```text
Étape 4 du plan : l'écran E1 (liste des recettes) et l'onglet Favoris. Relis la section E1 du cahier des charges.

- js/composants/carte-recette.js : une carte cliquable (lien vers #/recette/:id). Elle affiche le visuel, le titre, le temps total formaté et la difficulté en 1 à 3 points (texte alternatif « Difficulté : moyen »). Comme il n'y a pas encore de photo, le visuel par défaut est un dégradé coloré stable, dérivé de l'id, avec l'initiale du titre.
- js/ecrans/liste.js :
  * une barre de recherche (type="search") en haut, filtrée à chaque frappe avec rechercher() de modele.js ;
  * des puces de catégories défilant horizontalement (« Toutes » + catégories), en sélection unique, avec aria-pressed ;
  * un menu de tri (date, titre, temps total), mémorisé dans les réglages ;
  * une grille de 2 colonnes sous 768 px, puis 3 et 4 colonnes au-delà ;
  * un état vide illustré (petit SVG en ligne, ton léger) avec les boutons « Créer ma première recette » et « Charger des exemples » ;
  * un état « aucun résultat » distinct quand une recherche ne trouve rien, avec un bouton pour effacer la recherche ;
  * le nombre de résultats annoncé aux lecteurs d'écran (aria-live="polite").
- Branche l'écran sur #/. L'écran #/favoris réutilise le même composant, filtré sur favori, avec son propre état vide.
- Le bouton « + » mène à #/nouvelle.

Vérifie avec Playwright à 360, 768 et 1280 px : état vide, puis chargement des exemples, recherche de « poireau » (le résultat doit apparaître), puis « POIREAU » et « poireâu ». Commite ensuite.
```

**Vérifications**
- [ ] Rechercher « poireau » trouve la tarte (critère de recette du MVP).
- [ ] L'état vide est engageant et les exemples se chargent.

### Étape 5 — E2 : fiche recette

```text
Étape 5 du plan : l'écran E2, la fiche recette (#/recette/:id). Relis la section E2 du cahier.

- L'en-tête contient le visuel pleine largeur (le même visuel par défaut que la carte), le titre en h1, les catégories en puces et un bouton favori (aria-pressed, mise à jour immédiate dans la base). Un bouton retour ramène à la liste.
- Le bloc infos est une rangée de cartes arrondies : difficulté, préparation, cuisson, repos (les temps absents sont masqués) et total.
- js/composants/selecteur-portions.js : des boutons − et + avec la valeur au centre (aria-live), bornés de 1 à 100. Il émet un événement de changement. La valeur choisie n'est pas sauvegardée dans la recette, mais elle est transmise au mode cuisine par l'URL (#/cuisine/:id?portions=6).
- Le bloc ingrédients recalcule les quantités avec mettreALEchelle et formaterQuantite. Chaque ligne affiche la quantité et l'unité en gras, puis le nom, puis la précision en gris.
- Le bloc étapes est une liste <ol> numérotée, avec un texte de 17 px minimum.
- La description, les notes et la source s'affichent si elles sont renseignées (la source devient un lien si c'est une URL).
- Les actions : le bouton principal « Cuisiner », large, en bas dans la zone du pouce, et un menu secondaire avec Modifier, Dupliquer (ouvre la copie), Partager et Supprimer. Partager utilise navigator.share avec le texte de la recette formaté, ou copie dans le presse-papiers à défaut. Supprimer demande une confirmation via un <dialog> accessible, puis revient à la liste avec un message éphémère (toast).
- À partir de 768 px, ingrédients et étapes s'affichent en deux colonnes.
- Un id inconnu affiche un message « Recette introuvable » avec un lien vers la liste.

Vérifie avec Playwright : passer de 4 à 6 portions sur une recette d'exemple multiplie les quantités par 1,5 avec un arrondi lisible. Commite ensuite.
```

**Vérifications**
- [ ] Les quantités restent lisibles avec 1, 3, 7 et 12 portions.
- [ ] La suppression demande confirmation, et le favori se retrouve dans l'onglet Favoris.

### Étape 6 — E3 : formulaire de création et de modification 🧭

```text
Étape 6 du plan : l'écran E3, le formulaire (#/nouvelle et #/edition/:id). Relis la section E3 du cahier. Cette étape couvre la saisie et la validation ; l'ergonomie avancée viendra à l'étape 7.

- Un seul écran défilant, en sections avec titres : Infos, Ingrédients, Étapes, Notes.
- Infos : titre (obligatoire), description avec compteur de caractères (500), difficulté en boutons segmentés (radio stylés, accessibles au clavier), préparation, cuisson et repos en minutes (inputmode="numeric", pattern [0-9]*), portions avec le composant selecteur-portions, et catégories en puces sélectionnables. Le champ « Nouvelle catégorie » crée une puce à la volée.
- Ingrédients : une ligne par ingrédient. Chaque ligne a un champ quantité (inputmode="decimal", qui accepte « 1,5 » et « 1/2 »), une unité (liste des unités du cahier plus saisie libre via <datalist>), un nom et une précision, puis un bouton supprimer. Un bouton « Ajouter un ingrédient » complète la liste.
- Étapes : un <textarea> par étape, auto-redimensionné, numéroté, avec un bouton supprimer. Un bouton « Ajouter une étape » complète la liste.
- Notes et source.
- Une barre d'actions fixe en bas contient Annuler et Enregistrer.
- La validation utilise validerRecette. Les erreurs s'affichent sous le champ concerné (aria-describedby, aria-invalid). Le focus va au premier champ en erreur. Les lignes vides d'ingrédients et d'étapes sont ignorées à l'enregistrement.
- En modification, le formulaire est pré-rempli. Enregistrer ramène à la fiche.

Vérifie avec Playwright la création d'une recette complète (titre, difficulté, temps, 5 ingrédients, 4 étapes), son affichage sur la fiche, puis sa modification. Vérifie aussi qu'elle est toujours là après un rechargement de la page. Commite ensuite.
```

**Vérifications**
- [ ] Sur téléphone, le clavier numérique s'ouvre pour les temps et les quantités.
- [ ] Les erreurs s'affichent sous les bons champs.

### Étape 7 — E3 : saisie rapide

**Objectif** : tenir l'objectif « une recette complète en moins de 3 minutes sur téléphone ».

```text
Étape 7 du plan : l'ergonomie de saisie du formulaire E3.

1. Touche Entrée : dans le champ nom ou précision d'un ingrédient, Entrée crée la ligne suivante et y place le focus (dans le champ quantité). Dans une étape, Entrée crée l'étape suivante et Maj+Entrée insère un retour à la ligne. Retour arrière dans une ligne entièrement vide la supprime et remonte le focus.
2. Saisie rapide d'un ingrédient : chaque ligne propose un mode « ligne libre », un seul champ où l'on tape « 200 g farine ». À la sortie du champ, analyserLigneIngredient décompose la saisie. C'est le mode par défaut sur mobile. Un bouton permet de basculer vers les champs détaillés.
3. Collage intelligent : coller un texte de plusieurs lignes dans un ingrédient crée un ingrédient par ligne, analysé avec analyserLigneIngredient. Dans une étape, cela crée une étape par ligne ou par paragraphe. Les puces, numéros et tirets en début de ligne (« 1. », « - », « • ») sont retirés.
4. Réordonnancement par glisser-déposer : une poignée sur chaque ligne, gérée avec les Pointer Events (souris et tactile, sans librairie), avec un retour visuel. Alternative accessible : des boutons « Monter » et « Descendre » dans un menu de ligne, et l'annonce de la nouvelle position par aria-live.
5. Brouillon automatique : le formulaire est sauvegardé dans reglages (clé brouillon:<id|nouvelle>) 500 ms après chaque modification. En rouvrant le formulaire, un bandeau propose « Reprendre le brouillon » ou « Ignorer ». Le brouillon est supprimé à l'enregistrement.
6. Modifications non sauvegardées : demander une confirmation si l'on quitte par Annuler, par le routeur ou par le bouton retour, et utiliser beforeunload pour la fermeture de l'onglet.

Ajoute à tests/modele.test.js les tests du découpage des lignes collées (fonction pure decouperLignesCollees dans modele.js). Vérifie le collage de cette liste avec Playwright :
"- 250 g de farine\n- 3 œufs\n- 50 cl de lait\n- 1 pincée de sel"
Commite ensuite.
```

**Vérifications**
- [ ] Chronométrez-vous sur téléphone : moins de 3 minutes pour 5 ingrédients et 4 étapes.
- [ ] Le glisser-déposer fonctionne au doigt.

### Étape 8 — E4 : mode cuisine 🧭

```text
Étape 8 du plan : l'écran E4, le mode cuisine (#/cuisine/:id?portions=N). Relis la section E4 du cahier.

- Plein écran : pas de barre d'onglets. Un bouton fermer (×) en haut ramène à la fiche. La barre de progression « Étape 3 / 8 » est un <progress> avec texte.
- Une étape à la fois, avec un texte de 22 px minimum (clamp() pour grandir sur les grands écrans) et un contraste élevé.
- Navigation :
  * par swipe horizontal (Pointer Events, seuil de distance et de vitesse, la carte suit le doigt, sans gêner le défilement vertical) ;
  * par les boutons Précédent et Suivant, larges, en bas ; sur la dernière étape, Suivant devient « Terminé » ;
  * par les flèches gauche et droite du clavier, et Échap pour quitter.
  L'étape courante est mémorisée dans l'URL pour que le bouton retour du navigateur fonctionne.
- Ingrédients cités : trouverIngredientsDansTexte met en surbrillance les ingrédients dans le texte. Ce sont des <button>. Un toucher ouvre une bulle (popover) avec la quantité ajustée aux portions, l'unité et la précision.
- Un panneau « Ingrédients » se déroule depuis le bas (bottom sheet en <dialog>). Il est accessible à chaque étape et affiche la liste complète ajustée aux portions.
- Écran allumé : navigator.wakeLock.request('screen') à l'entrée. Il est redemandé à visibilitychange (le verrou saute quand l'onglet passe en arrière-plan) et libéré à la sortie. Si l'API n'est pas disponible, un message discret l'indique.
- Une transition de glissement de 200 ms entre les étapes, désactivée avec prefers-reduced-motion.
- À la fin, un écran « Bon appétit ! » propose de revenir à la fiche.

Vérifie avec Playwright, en émulation tactile à 360 px : le swipe, les flèches, la surbrillance, la bulle d'ingrédient et le panneau. Commite ensuite.
```

**Vérifications**
- [ ] Sur un vrai téléphone, l'écran reste allumé 10 minutes (critère de recette du MVP).
- [ ] Le swipe est fluide et ne se déclenche pas en faisant défiler un long texte.

### Étape 9 — E5 : réglages et sauvegarde

```text
Étape 9 du plan : l'écran E5, les réglages (#/reglages). Relis la section E5 du cahier.

- Thème : boutons segmentés Clair / Sombre / Système. Le choix est appliqué immédiatement (data-theme sur <html>) et mémorisé. Il est aussi appliqué avant le premier rendu, par un court script en ligne dans index.html, pour éviter un flash de couleur.
- Catégories : la liste indique le nombre de recettes par catégorie. On peut créer, renommer (en ligne, avec Entrée pour valider) et supprimer une catégorie, avec confirmation qui indique le nombre de recettes concernées.
- Données :
  * Exporter : télécharge recettes-AAAA-MM-JJ.json au format { app: "recette", version: 1, dateExport, recettes, categories }.
  * Importer : un <input type="file" accept=".json,application/json">. Le fichier est validé (format, version, chaque recette avec validerRecette). Un résumé (« 12 recettes, dont 3 déjà présentes ») est suivi d'un choix entre Fusionner et Remplacer. Les recettes invalides sont listées et ignorées.
  * Tout effacer : double confirmation, la seconde demandant de taper « EFFACER ».
- À propos : version de l'app (une constante unique, VERSION dans js/app.js), espace utilisé et disponible via navigator.storage.estimate() (formaté en Mo), et état de la persistance (accordée ou non).

Vérifie avec Playwright l'aller-retour suivant : charger les exemples, exporter, tout effacer, importer le fichier ; toutes les recettes doivent revenir à l'identique. Commite ensuite.
```

**Vérifications**
- [ ] Un export depuis Chrome, importé dans Firefox, restitue toutes les recettes (critère de recette du MVP).

### Étape 10 — PWA et hors ligne

```text
Étape 10 du plan : rendre l'application installable et utilisable hors ligne.

- manifest.webmanifest : name « Recette », short_name, lang fr, start_url "./", scope "./", display standalone, background_color et theme_color, et icônes 192 et 512 px en PNG, plus une version maskable.
- Icônes : dessine un SVG source simple et reconnaissable dans /icones (une toque ou une cuillère sur fond orange tomate). Génère les PNG 192, 512, maskable 512, apple-touch-icon 180 et un favicon, avec un script Node (scripts/icones.mjs avec Playwright pour le rendu, ou sharp en devDependency). Ajoute les balises link correspondantes et les meta Apple (apple-mobile-web-app-capable, statut de la barre).
- sw.js :
  * à l'installation, mettre en cache la liste de tous les fichiers de l'app, y compris chaque écran chargé par import() et les icônes ;
  * stratégie cache d'abord pour ces fichiers ;
  * le nom du cache inclut VERSION ; à l'activation, supprimer les anciens caches ;
  * quand une nouvelle version est prête, l'app affiche un bandeau « Nouvelle version disponible — Recharger » (message postMessage SKIP_WAITING, sans skipWaiting automatique).
- Ajoute un script de vérification (npm run verifier-cache) qui compare la liste mise en cache par sw.js aux fichiers réellement présents dans css/, js/ et icones/, et qui échoue s'il en manque un.
- Enregistrement du service worker dans app.js, uniquement en HTTPS ou sur localhost.
- Tous les chemins sont relatifs, pour fonctionner sur GitHub Pages dans un sous-dossier (/Recette/).

Vérifie avec Playwright : première visite, passage hors ligne (context.setOffline(true)), rechargement ; tous les écrans fonctionnent et une recette peut être créée. Commite ensuite.
```

**Vérifications**
- [ ] Chrome affiche « Installer l'application ».
- [ ] En mode avion, l'app installée s'ouvre et tout fonctionne (critère de recette du MVP).

### Étape 11 — Design final 🧭

```text
Étape 11 du plan : la finition visuelle dans l'esprit de Croûton (relis la section « Design et UX » du cahier). L'interface doit être sobre, aérée, chaleureuse et un peu ludique.

- js/icones.js : un jeu cohérent d'icônes SVG en ligne (contour de 1,75 px, coins arrondis, currentColor) : horloge, toque, portions, cœur vide et plein, recherche, plus, crayon, copie, partage, poubelle, flèches, croix, liste, réglages, minuteur, panier, calendrier. Une fonction icone(nom, { taille, libelle }) gère aria-hidden ou role="img" selon le cas. Remplace tous les symboles provisoires.
- Difficulté : 1, 2 ou 3 petites toques remplies, partout de la même façon.
- Harmonise espacements (échelle de 4 px), rayons, ombres légères en clair, bordures fines en sombre. Utilise un fond doux, des surfaces de cartes légèrement contrastées et l'accent utilisé avec parcimonie.
- Micro-interactions : un retour au toucher (:active, légère mise à l'échelle), des transitions de 150 à 250 ms entre écrans (View Transitions API si disponible, sinon un fondu), une animation du cœur favori. Tout est désactivé avec prefers-reduced-motion.
- Mise en page bureau (1024 px et plus) : la liste à gauche et la fiche à droite, côte à côte, sur les routes #/ et #/recette/:id. La barre d'onglets devient une barre latérale ou un en-tête.
- Teste la plage de 320 à 1440 px : aucun débordement horizontal, des titres longs tronqués proprement.

Fais des captures Playwright à 360, 768 et 1280 px, en thème clair et en thème sombre, de la liste, de la fiche, du formulaire et du mode cuisine. Montre-les-moi avant de commiter.
```

**Vérifications**
- [ ] Le rendu vous plaît sur téléphone, en clair et en sombre.
- [ ] Rien ne déborde à 320 px.

### Étape 12 — Qualité, recette du MVP et mise en ligne

```text
Étape 12 du plan : valider le MVP selon les « Exigences non fonctionnelles » et les « Critères de recette du MVP » du cahier, puis le mettre en ligne.

1. Tests de bout en bout : tests/e2e/*.spec.js avec Playwright (projets « mobile » Pixel 7 et « desktop »). Un test par critère de recette automatisable :
   - création complète d'une recette ;
   - persistance après fermeture du contexte navigateur (même stockage) ;
   - portions 4 → 6 ;
   - recherche de « poireau » ;
   - navigation par swipe en mode cuisine ;
   - fonctionnement hors ligne ;
   - aller-retour export / import.
2. Accessibilité : ajoute @axe-core/playwright et lance une analyse sur chaque écran, avec zéro violation sérieuse ou critique. Vérifie le parcours complet au clavier seul.
3. Performance : mesure la recherche sur 500 recettes générées (moins de 100 ms) et le poids total du JavaScript compressé en gzip (moins de 100 Ko, script npm run budget). Lance Lighthouse (npx lighthouse en mode mobile) sur la version servie et corrige jusqu'à atteindre Performance ≥ 90, Accessibilité ≥ 95 et une application installable.
4. Mise en ligne sur GitHub Pages : un workflow .github/workflows/pages.yml qui lance npm test et les tests e2e, puis déploie la racine du dépôt (en excluant tests/, docs/, scripts/ et node_modules).
5. Mets à jour le README (fonctionnalités, captures, lien vers l'app) et coche les critères validés dans docs/cahier-des-charges.md. Liste les critères qui demandent une vérification manuelle sur un vrai téléphone (écran allumé 10 minutes, redémarrage du téléphone, saisie en moins de 3 minutes).

Donne-moi un rapport final : scores Lighthouse, poids JS, temps de recherche, résultats axe. Commite ensuite.
```

**Vérifications manuelles sur téléphone (fin du lot 1)**
- [ ] Installer l'app depuis l'URL GitHub Pages.
- [ ] Créer une recette, redémarrer le téléphone : elle est intacte.
- [ ] Cuisiner 10 minutes : l'écran reste allumé.
- [ ] Mode avion : tout fonctionne.

---

## Lot 2 — Confort

### Étape 13 — Sections d'ingrédients et cases à cocher

```text
Étape 13 du plan (lot 2) : les sections d'ingrédients et les cases à cocher.

- Formulaire : un bouton « Ajouter une section » insère un intertitre (« Pour la pâte ») dans la liste des ingrédients. Les ingrédients qui suivent héritent du champ section. Les intertitres se réordonnent avec les ingrédients. Dans une ligne libre, une ligne terminée par « : » devient une section, y compris au collage.
- Fiche et panneau du mode cuisine : les ingrédients sont groupés par section, avec un intertitre.
- Cases à cocher sur la fiche : un toucher sur un ingrédient le coche (texte barré, atténué). L'état est conservé par recette pendant la session (sessionStorage). Un bouton « Tout décocher » le réinitialise. Accessible : de vraies cases à cocher avec label.
- Ajoute une fonction pure grouperParSection(ingredients) dans modele.js, avec ses tests, et mets à jour analyserLigneIngredient pour les lignes de section.
- Ajoute des sections à une ou deux recettes d'exemple.

Lance les tests unitaires et e2e, vérifie visuellement, puis commite.
```

### Étape 14 — Photo de la recette

```text
Étape 14 du plan (lot 2) : la photo de la recette.

- Formulaire : une zone photo en haut, avec deux choix : « Prendre une photo » (input file avec capture="environment") et « Choisir une image ». Un aperçu s'affiche, avec les boutons Remplacer et Retirer.
- Traitement côté client (js/composants/photo.js) : lecture via createImageBitmap en respectant l'orientation EXIF (imageOrientation: 'from-image'), redimensionnement à 1200 px de large au maximum dans un <canvas> (ou OffscreenCanvas), puis export en WebP, ou en JPEG si WebP n'est pas supporté en encodage (Safari). La qualité est ajustée par paliers jusqu'à passer sous 300 Ko.
- Stockage : un Blob dans le champ photo de la recette, dans IndexedDB. Affichage via URL.createObjectURL, révoqué au nettoyage de l'écran.
- Les cartes, l'en-tête de la fiche et le mode cuisine affichent la photo (object-fit: cover, loading="lazy", decoding="async", dimensions réservées pour éviter les décalages de mise en page). Le visuel par défaut reste affiché sans photo.
- Export JSON : les photos sont converties en data URL, puis reconverties en Blob à l'import. L'export propose une case « Inclure les photos » pour pouvoir faire un fichier léger.
- Mets à jour l'estimation de l'espace utilisé dans les réglages.

Teste avec une image de 4000 × 3000 px : la photo stockée doit faire moins de 300 Ko et 1200 px de large. Commite ensuite.
```

### Étape 15 — Minuteurs

```text
Étape 15 du plan (lot 2) : les minuteurs dans les étapes (section E4 du cahier, partie lot 2).

- modele.js : detecterDurees(texte) renvoie les plages et durées en secondes trouvées dans le texte. Les formats à reconnaître : « 15 min », « 15 minutes », « 1 h », « 1 h 30 », « 1h30 », « 2 heures », « 30 s », « 10 à 12 min » (prendre la borne haute), « une heure », « une demi-heure », « un quart d'heure ». Ajoute les tests.
- Formulaire : chaque étape où une durée est détectée affiche une suggestion « Minuteur : 15 min ». On peut l'accepter, la modifier ou la retirer. Le champ minuteur de l'étape (en secondes) est renseigné.
- Mode cuisine : les durées du texte deviennent des boutons. L'étape avec un minuteur affiche un bouton « Lancer 15:00 ».
- js/composants/minuteur.js : plusieurs minuteurs peuvent tourner en même temps, chacun nommé d'après l'étape. Un bandeau fixe en haut, visible sur tous les écrans, affiche le temps restant, avec pause, reprise, +1 min et arrêt. Le calcul se fait à partir d'une heure de fin (Date.now()), pas d'un compteur, pour rester juste quand l'onglet est en arrière-plan. Les minuteurs actifs sont sauvegardés et restaurés après un rechargement.
- Fin d'un minuteur : un son généré avec l'API Web Audio (pas de fichier), répété jusqu'à l'arrêt, une vibration (navigator.vibrate) et une notification système si la permission est accordée (demandée au premier lancement d'un minuteur, sans insister). Une annonce aria-live accompagne la fin.

Vérifie avec Playwright, en accélérant l'horloge (page.clock), qu'un minuteur de 15 min sonne et s'affiche correctement. Commite ensuite.
```

### Étape 16 — Impression et couleur d'accent

```text
Étape 16 du plan (lot 2) : l'impression et la couleur d'accent.

- Impression : ajoute une action « Imprimer » sur la fiche (window.print()) et une feuille css/impression.css (media="print"). Elle masque la navigation, les boutons et les fonds, imprime en noir sur blanc, met les ingrédients et les étapes sur deux colonnes en A4 et évite les coupures au milieu d'une étape (break-inside: avoid). Elle affiche la photo en petit si elle existe et ajoute la source et les portions choisies en pied de page. Les quantités imprimées sont celles des portions affichées.
- Couleur d'accent : dans les réglages, une palette de 6 à 8 teintes prédéfinies (tomate par défaut, basilic, aubergine, safran, myrtille, framboise…). Chaque teinte a une variante pour le thème clair et une pour le sombre, et chaque variante respecte le contraste 4,5:1 (vérifie-le par un test unitaire qui calcule les ratios WCAG). La teinte est appliquée via --accent et mise à jour dans meta theme-color.

Vérifie l'aperçu d'impression avec Playwright (page.pdf) et montre-moi le PDF d'une recette. Commite ensuite.
```

---

## Lot 3 — Organisation

### Étape 17 — Liste de courses 🧭

```text
Étape 17 du plan (lot 3) : la liste de courses.

- Données : un nouveau magasin IndexedDB « courses » (passage de la base en version 2, avec une migration testée). Chaque article contient { id, nom, quantite, unite, rayon, coche, recettes: [ids] }.
- Ajout depuis la fiche : le bouton « Ajouter aux courses » ouvre une feuille où l'on coche les ingrédients voulus (tous cochés par défaut), pour le nombre de portions affiché.
- modele.js : fusionnerArticles(articles) additionne les quantités d'un même ingrédient (nom normalisé, singulier et pluriel) quand les unités sont compatibles (g et kg, ml, cl et l, convertis), et garde des lignes séparées sinon. classerRayon(nom) range l'article dans un rayon à partir d'un petit dictionnaire (Fruits et légumes, Crèmerie, Épicerie, Boucherie, Boulangerie, Surgelés, Autres). Ajoute les tests.
- Un nouvel onglet « Courses » dans la barre d'onglets (4 onglets) ouvre l'écran #/courses. Les articles y sont groupés par rayon. Un toucher coche un article et l'envoie en bas de la liste. On peut ajouter un article à la main (avec analyserLigneIngredient), modifier ou supprimer un article, vider les articles cochés ou tout vider. On peut partager la liste en texte (navigator.share).
- Mets à jour le service worker, l'export et l'import JSON (avec la liste de courses) et les tests e2e.

Commite ensuite.
```

### Étape 18 — Planning de la semaine 🧭

```text
Étape 18 du plan (lot 3) : le planning des repas.

- Données : un magasin « planning » (base en version 3, avec migration). Chaque entrée contient { date: 'AAAA-MM-JJ', repas: 'midi' | 'soir', recetteId, portions }.
- Un écran #/planning, accessible depuis l'onglet Courses renommé « Organiser », avec deux sous-onglets : Planning et Courses. La semaine s'affiche sous forme de liste de jours (lundi à dimanche), avec une navigation vers la semaine précédente et la suivante. Chaque jour a ses créneaux midi et soir, et chaque créneau peut recevoir une ou plusieurs recettes.
- Ajouter une recette à un créneau : une feuille de recherche réutilise la recherche de la liste. On peut aussi planifier depuis la fiche, avec « Planifier » et un choix de jour et de créneau.
- Les portions sont ajustables par repas planifié.
- « Générer les courses de la semaine » ajoute à la liste de courses les ingrédients de toutes les recettes planifiées, aux bonnes portions, via fusionnerArticles.
- Option « Proposer une semaine » : remplit les créneaux vides au hasard parmi les recettes, de préférence les favoris, sans répéter une recette dans la semaine. Fonction pure proposerSemaine, testée avec une graine aléatoire fixe.
- Le jour courant est mis en évidence ; un toucher sur une recette planifiée ouvre sa fiche.
- Mets à jour l'export, l'import, le service worker et les tests e2e.

Commite ensuite.
```

---

## Lot 4 — Avancé

### Étape 19 — Partage d'une recette par lien

Cette étape tient la promesse « aucune donnée envoyée à un serveur » : la recette voyage dans le lien lui-même.

```text
Étape 19 du plan (lot 4) : le partage d'une recette par lien, sans serveur.

- Encodage : la recette, sans id, sans dates et sans photo, est sérialisée en JSON, compressée avec CompressionStream('deflate-raw'), puis encodée en base64url. Le résultat est placé dans le fragment : #/importer?r=<données>. Le fragment n'est jamais envoyé au serveur d'hébergement.
- Sur la fiche, l'action Partager propose « Partager le lien » (navigator.share ou copie) en plus du texte. Prévenir si le lien dépasse 8 000 caractères.
- Un écran #/importer affiche un aperçu en lecture seule de la recette reçue, avec les boutons « Ajouter à mes recettes » et « Ignorer ». La recette est validée avec validerRecette avant affichage, et tout le texte est inséré via textContent (aucune injection HTML possible).
- Fonctions pures encoderRecette et decoderRecette, avec des tests d'aller-retour, de données corrompues et de lien trop long.

Commite ensuite.
```

### Étape 20 — Import depuis une URL

> **Décision à prendre avant cette étape.** Un navigateur ne peut pas lire la page d'un autre site (restriction CORS). Trois options :
> **A.** Copier-coller : l'utilisateur colle le code source de la page ou son JSON-LD. Aucun serveur n'est nécessaire et l'exigence « aucune donnée envoyée » est tenue. Contrepartie : la saisie est moins confortable.
> **B.** Un petit relais (par exemple un Cloudflare Worker gratuit) qui récupère la page et ne renvoie que le bloc schema.org Recipe. L'usage est confortable, mais l'URL consultée transite par ce relais.
> **C.** A par défaut, B en option désactivable dans les réglages.
> Le prompt ci-dessous suppose l'option C. Adaptez la dernière puce selon votre choix.

```text
Étape 20 du plan (lot 4) : l'import d'une recette depuis une page web (données schema.org Recipe).

- modele.js : extraireRecetteSchemaOrg(html) cherche les blocs <script type="application/ld+json"> (avec DOMParser côté navigateur, ou une regex robuste pour rester testable sous Node). Il gère @graph, les tableaux et @type qui est une liste. La fonction convertit vers notre modèle :
  * name devient titre ;
  * recipeIngredient est passé à analyserLigneIngredient ;
  * recipeInstructions (texte, HowToStep, HowToSection avec sections) devient etapes ;
  * prepTime, cookTime et totalTime (durées ISO 8601 comme PT1H30M) deviennent des minutes ;
  * recipeYield devient portions ;
  * recipeCategory et keywords deviennent categories ;
  * l'URL devient source ;
  * image est proposée comme photo.
  Teste la fonction avec 4 ou 5 fichiers HTML de fixtures réalistes (sites français et anglais).
- Écran : une entrée « Importer depuis le web » sur le bouton « + ». Un champ texte accepte du HTML ou du JSON-LD collé. Le résultat ouvre le formulaire E3 pré-rempli, pour relecture avant enregistrement. Un message clair s'affiche si aucune recette n'est trouvée.
- Share Target : ajoute share_target au manifest, pour que « Partager vers Recette » depuis un navigateur mobile ouvre cet écran avec l'URL.
- Relais optionnel : un dossier relais/ contient un Cloudflare Worker minimal. Il n'accepte que GET ?url=, en HTTPS, limité à 2 Mo, et ne renvoie que le JSON-LD Recipe trouvé, jamais la page entière. Il a un README de déploiement. Dans les réglages, un champ « Adresse du relais », vide et donc désactivé par défaut, avec une explication de ce qui transite.

Commite ensuite.
```

### Étape 21 — Synchronisation entre appareils

> **Décision à prendre avant cette étape.** La synchronisation contredit « sans compte » et « aucune donnée envoyée à un serveur ». Trois options, de la plus simple à la plus complète :
> **A. Fichier partagé** : l'app lit et écrit un fichier `recettes.json` dans un dossier synchronisé (iCloud Drive, Google Drive), via l'export et l'import existants. Il n'y a rien à héberger. La synchronisation est manuelle mais fiable.
> **B. Pair à pair** : un appareil affiche un QR code, l'autre le scanne, et les deux échangent les données en WebRTC. Il n'y a pas de stockage serveur, mais il faut un petit serveur de signalisation.
> **C. Service hébergé** (Supabase, PocketBase…) : la synchronisation est automatique, mais elle demande un compte et un hébergement. C'est une rupture avec les principes du projet.
> Recommandation : **A**, en s'appuyant sur `dateModification` pour fusionner. Le prompt ci-dessous suppose A.

```text
Étape 21 du plan (lot 4) : la synchronisation entre appareils par fichier partagé (option A).

- modele.js : fusionnerCollections(locale, distante) fusionne recette par recette, en gardant la dateModification la plus récente. Les suppressions sont suivies par des pierres tombales { id, dateSuppression }, conservées 90 jours dans un magasin « suppressions » (avec migration). Un rapport donne le nombre de recettes ajoutées, mises à jour et supprimées, et liste les conflits. Ajoute des tests exhaustifs, dont des scénarios à deux appareils.
- Réglages, section « Synchronisation » :
  * Sur Chrome, Edge et Android, utiliser la File System Access API : choisir un fichier recettes.json une fois (le handle est mémorisé dans IndexedDB), puis un bouton « Synchroniser » qui lit, fusionne et réécrit le fichier.
  * Sur Safari iOS, où cette API n'existe pas : « Synchroniser » fait un import du fichier choisi, une fusion, puis un export partagé via navigator.share vers Fichiers (iCloud Drive).
  * Afficher la date de la dernière synchronisation et le rapport de fusion.
- Synchronisation automatique au démarrage si un handle est mémorisé et la permission encore accordée.

Commite ensuite.
```

---

## Prompts utilitaires

**Reprendre une étape interrompue**
```text
Nous étions à l'étape N du plan (docs/plan-de-developpement.md). Regarde git status et git log, compare avec le prompt de l'étape N, dis-moi ce qui est fait et ce qui reste, puis termine l'étape.
```

**Corriger un bug**
```text
Bug : [ce que je fais] → [ce que j'observe] ; attendu : [ce que je voulais]. Appareil et navigateur : [ex. iPhone, Safari]. Reproduis-le d'abord avec un test (unitaire ou Playwright) qui échoue, corrige la cause, vérifie que le test passe et que les autres tests restent verts, puis commite.
```

**Relire une étape avant de la valider**
```text
/code-review high
```

**Contrôler la conformité au cahier des charges**
```text
Compare l'application actuelle avec docs/cahier-des-charges.md pour le lot [N]. Fais un tableau : exigence, statut (fait / partiel / manquant), fichier concerné. Ne corrige rien, liste seulement.
```

**Ajuster le design à partir d'une capture**
```text
Voici une capture de [écran] sur mon téléphone. Ce qui ne me plaît pas : [...]. Propose 2 variantes en captures Playwright à 360 px, sans modifier le code tant que je n'ai pas choisi.
```
