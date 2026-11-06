# Cahier des charges — Application de recettes (inspirée de Croûton)

Nov 5, 2026 · @Pierre-Cyril

## Contexte et objectifs

Le projet vise une application web mobile first (HTML, CSS, JavaScript) pour créer, ranger et cuisiner ses recettes, avec la simplicité et l'élégance de Croûton. Le cœur du produit est la fiche recette : titre, informations (difficulté, temps), ingrédients et étapes.

Objectifs :

- Saisir une recette complète en moins de 3 minutes sur téléphone.
- Retrouver n'importe quelle recette en moins de 10 secondes (recherche, catégories).
- Cuisiner étape par étape, écran allumé, sans aller-retour entre ingrédients et instructions.
- Fonctionner hors ligne et s'installer sur l'écran d'accueil comme une application native (PWA).

Cible : un cuisinier amateur qui veut centraliser ses recettes (sites, livres, recettes de famille) sur son téléphone, sans compte ni abonnement.

## Analyse de Croûton

Croûton doit son succès à une fiche recette très lisible et à un mode cuisine qui affiche une seule étape à la fois. C'est une application iOS créée par Devin Davies, développeur indépendant néo-zélandais, sortie en septembre 2019 et notée 4,8/5 sur environ 3 400 avis ([AppGoblin](https://appgoblin.info/apps/1461650987)).

| Fonctionnalité | Ce que fait Croûton | À retenir pour notre app |
| --- | --- | --- |
| Fiche recette | Blocs en rectangles arrondis : temps, ingrédients, étapes numérotées ([MacStories](https://www.macstories.net/reviews/crouton-review-an-elegant-modern-recipe-manager-and-cooking-aid/)) | Oui, MVP |
| Mode étape par étape | Une étape par écran, swipe ou flèches ; toucher un ingrédient dans l'étape affiche sa quantité ([App Store](https://apps.apple.com/app/crouton/id1461650987)) | Oui, MVP |
| Minuteurs | Temps détectés dans le texte des étapes, lançables d'un toucher | Oui, lot 2 |
| Mise à l'échelle | Recalcul des quantités selon le nombre de personnes | Oui, MVP |
| Dossiers | Une recette peut appartenir à plusieurs dossiers, comme des étiquettes | Oui, MVP (catégories multiples) |
| Import | Saisie manuelle, URL de site, photo/OCR avec IA, import Paprika | Saisie manuelle au MVP ; import JSON puis URL plus tard |
| Planning des repas | Liste de jours, une ou plusieurs recettes par jour, génération automatique | Lot 3 |
| Liste de courses | Ajout d'ingrédients sélectionnés depuis une recette | Lot 3 |
| Partage | Export, PDF personnalisable | Impression CSS au lot 2 |
| Personnalisation | Mode sombre, couleurs et icônes d'app au choix | Mode sombre au MVP, couleur d'accent au lot 2 |

Points forts à reproduire :

- Une interface sobre qui n'impose pas les fonctions avancées : elles restent accessibles sans encombrer la fiche.
- Un ton visuel léger et ludique, qui rend les recettes accessibles aux débutants.
- Un parcours continu : trouver une recette, la planifier, puis la cuisiner en mode guidé ([ScreensDesign](https://screensdesign.com/showcase/crouton-recipe-manager)).

Points faibles relevés par les utilisateurs : la limite de recettes gratuites n'est pas annoncée avant le paywall, et l'écran vide du premier lancement manque d'accompagnement. Notre app n'a pas de paywall et soignera l'état vide.

## Périmètre

Le MVP couvre la gestion des fiches et le mode cuisine ; planning, courses et import web viennent ensuite.

| Lot | Contenu | Priorité |
| --- | --- | --- |
| Lot 1 — MVP | Créer, modifier, dupliquer, supprimer une recette ; liste et recherche ; catégories ; favoris ; fiche détaillée ; portions ajustables ; mode cuisine étape par étape ; stockage local ; hors ligne ; mode sombre | Indispensable |
| Lot 2 — Confort | Minuteurs détectés dans les étapes ; photo de la recette ; cases à cocher sur les ingrédients ; sections d'ingrédients (pâte, garniture) ; export/import JSON ; impression ; couleur d'accent | Important |
| Lot 3 — Organisation | Liste de courses générée depuis les recettes ; planning de la semaine | Souhaitable |
| Lot 4 — Avancé | Import depuis une URL (données schema.org Recipe) ; synchronisation entre appareils ; partage d'une recette par lien | Optionnel |

Hors périmètre : comptes utilisateurs, abonnement, flux RSS de blogs, import par photo/IA, contrôle mains libres par la caméra.

## Modèle de données

Une recette est un objet JSON autonome ; les quantités sont stockées en nombres pour permettre la mise à l'échelle.

| Champ | Type | Obligatoire | Règle |
| --- | --- | --- | --- |
| id | chaîne (UUID) | Oui | Généré via crypto.randomUUID() |
| titre | chaîne | Oui | 1 à 120 caractères |
| description | chaîne | Non | 500 caractères max |
| photo | Blob ou data URL | Non | Redimensionnée à 1200 px de large, JPEG/WebP |
| difficulte | énumération | Oui | facile, moyen, difficile |
| tempsPreparation | entier (minutes) | Non | 0 à 1440 |
| tempsCuisson | entier (minutes) | Non | 0 à 1440 |
| tempsRepos | entier (minutes) | Non | 0 à 4320 |
| portions | entier | Oui | 1 à 100, défaut 4 |
| categories | liste de chaînes | Non | Plusieurs catégories possibles |
| favori | booléen | Non | Défaut faux |
| ingredients | liste | Oui | Au moins 1 élément |
| etapes | liste | Oui | Au moins 1 élément |
| notes | chaîne | Non | Astuces, variantes |
| source | chaîne (URL ou texte) | Non | « Livre de Mamie », lien web |
| dateCreation, dateModification | date ISO | Oui | Mises à jour automatiquement |

Le temps total est calculé (préparation + cuisson + repos), jamais saisi.

Un ingrédient contient : `quantite` (nombre, optionnel, ex. 0.5), `unite` (g, kg, ml, cl, l, c. à s., c. à c., pincée, pièce ou libre), `nom` (obligatoire), `precision` (« coupé en dés ») et `section` optionnelle (« Pour la pâte »). Une étape contient : `texte` (obligatoire) et `minuteur` optionnel en secondes.

```json
{
  "id": "7c1e…",
  "titre": "Tarte aux poireaux",
  "difficulte": "facile",
  "tempsPreparation": 20,
  "tempsCuisson": 35,
  "portions": 6,
  "categories": ["Plat", "Végétarien"],
  "ingredients": [
    { "quantite": 3, "unite": "pièce", "nom": "poireaux", "precision": "émincés" },
    { "quantite": 200, "unite": "ml", "nom": "crème fraîche" }
  ],
  "etapes": [
    { "texte": "Faire fondre les poireaux 15 min à feu doux.", "minuteur": 900 }
  ]
}
```

## Spécifications fonctionnelles

L'application compte cinq écrans au MVP, reliés par une barre d'onglets en bas (Recettes, Favoris, Réglages) et un bouton flottant « + ».

### E1 — Liste des recettes (accueil)

- Grille de cartes (2 colonnes sur mobile, 3 à 4 au-delà de 768 px) : photo ou visuel par défaut coloré, titre, temps total, pastille de difficulté.
- Barre de recherche en haut : filtre instantané sur titre, ingrédients et notes, insensible aux accents et à la casse.
- Puces de catégories défilantes horizontalement pour filtrer ; tri par date, titre ou temps total.
- État vide illustré avec un bouton « Créer ma première recette » et une option « Charger des exemples ».

### E2 — Fiche recette

- En-tête : photo pleine largeur, titre, catégories, bouton favori.
- Bloc infos en cartes arrondies : difficulté, préparation, cuisson, repos, total.
- Bloc ingrédients : sélecteur de portions (− / +) qui recalcule les quantités ; arrondi intelligent (½, ¼, entiers pour les pièces) ; cases à cocher au lot 2.
- Bloc étapes : numérotées, texte lisible (17 px minimum).
- Actions : « Cuisiner » (bouton principal), modifier, dupliquer, partager, supprimer avec confirmation.

### E3 — Formulaire de création / modification

- Un seul écran défilant en sections : infos, ingrédients, étapes, notes.
- Difficulté par boutons segmentés ; temps par champs numériques avec clavier numérique (`inputmode="numeric"`).
- Ingrédients et étapes : ajout ligne par ligne, touche Entrée pour créer la ligne suivante, réordonnancement par glisser-déposer, suppression par bouton.
- Collage intelligent : coller une liste de plusieurs lignes crée un ingrédient ou une étape par ligne ; le texte « 200 g farine » est décomposé en quantité, unité et nom.
- Brouillon enregistré automatiquement ; alerte si on quitte avec des modifications non sauvegardées.
- Validation : titre, au moins un ingrédient et une étape ; erreurs affichées sous le champ concerné.

### E4 — Mode cuisine

- Plein écran, une étape à la fois, texte en grand (22 px minimum).
- Navigation par swipe, boutons Précédent / Suivant en bas et touches fléchées ; barre de progression « Étape 3 / 8 ».
- Ingrédients cités dans l'étape mis en surbrillance ; un toucher affiche la quantité (ajustée aux portions).
- Panneau déroulant « Ingrédients » accessible depuis chaque étape.
- Écran maintenu allumé via l'API Wake Lock.
- Lot 2 : bouton minuteur sur les étapes contenant une durée (« 15 min »), minuteur visible en bandeau, alerte sonore et vibration à la fin.

### E5 — Réglages

- Thème : clair, sombre, système.
- Gestion des catégories : créer, renommer, supprimer.
- Données : exporter toutes les recettes en JSON, importer un fichier JSON, tout effacer (double confirmation).
- À propos : version, espace de stockage utilisé.

## Design et UX

Le style reprend l'esprit de Croûton : des blocs en cartes arrondies sur fond doux, une couleur d'accent chaleureuse et beaucoup d'air.

- **Mobile first** : maquettes conçues à 360 px de large, puis points de rupture à 768 px (tablette, fiche en deux colonnes ingrédients / étapes) et 1024 px (bureau, liste + fiche côte à côte).
- **Zone du pouce** : actions principales en bas d'écran (barre d'onglets, bouton « + », boutons du mode cuisine) ; cibles tactiles de 44 × 44 px minimum.
- **Couleurs** : variables CSS (`--accent`, `--surface`, `--texte`…) avec un thème clair et un thème sombre ; accent par défaut orange tomate, contraste texte/fond d'au moins 4,5:1.
- **Cartes** : coins arrondis de 16 px, ombre légère ou bordure fine, marges internes de 16 px.
- **Typographie** : police système (`system-ui`) pour la rapidité, ou une police arrondie (ex. Nunito) pour le côté ludique ; 16 px minimum pour le corps du texte.
- **Icônes** : un jeu cohérent en SVG (temps, difficulté, portions, favori).
- **Micro-interactions** : transitions courtes (150 à 250 ms) entre écrans, retour visuel au toucher, respect de `prefers-reduced-motion`.
- **Difficulté** : repère visuel simple (1, 2 ou 3 toques ou points) plutôt qu'un simple mot.
- **Safe areas** : prise en compte des encoches et de la barre système (`env(safe-area-inset-*)`).

## Spécifications techniques

L'application est une PWA statique en HTML, CSS et JavaScript natif (sans framework), avec les données stockées dans IndexedDB sur l'appareil.

| Sujet | Choix | Justification |
| --- | --- | --- |
| Langages | HTML5 sémantique, CSS moderne (variables, Grid, Flexbox, `clamp()`), JavaScript ES2022 en modules | Contrainte du projet, aucun outil de build obligatoire |
| Navigation | Application monopage, routage par hash (`#/recette/:id`, `#/edition/:id`, `#/cuisine/:id`) | Fonctionne sur tout hébergement statique, bouton retour natif |
| Stockage | IndexedDB (via une petite couche maison ou la librairie idb) ; magasins `recettes`, `categories`, `reglages` | Volume suffisant pour les photos, contrairement à localStorage (\~5 Mo) |
| Persistance | `navigator.storage.persist()` demandé au premier enregistrement | Évite l'effacement des données par le navigateur |
| Hors ligne | Service worker : cache des fichiers de l'app au premier chargement | L'app s'ouvre sans réseau |
| Installation | `manifest.webmanifest` (nom, icônes 192 et 512 px, `display: standalone`, couleur de thème) | Icône sur l'écran d'accueil |
| Écran allumé | API Screen Wake Lock en mode cuisine | Pas de mise en veille pendant la cuisine |
| Photos | Redimensionnement côté client via `<canvas>` avant stockage | Limite le poids (cible < 300 Ko par photo) |
| Hébergement | GitHub Pages, Netlify ou équivalent, en HTTPS | Requis par le service worker |

Arborescence proposée :

```
/index.html
/manifest.webmanifest
/sw.js
/css/  base.css, composants.css, ecrans.css
/js/
  app.js          démarrage et routeur
  db.js           accès IndexedDB
  modele.js       validation, mise à l'échelle, parsing « 200 g farine »
  ecrans/         liste.js, fiche.js, edition.js, cuisine.js, reglages.js
  composants/     carte-recette.js, selecteur-portions.js, minuteur.js
/icones/
```

La logique métier (`modele.js`) reste séparée de l'affichage pour être testable et pour faciliter l'ajout d'une synchronisation au lot 4.

## Exigences non fonctionnelles

| Domaine | Exigence mesurable |
| --- | --- |
| Performance | Premier affichage < 1,5 s sur mobile milieu de gamme en 4G ; score Lighthouse Performance ≥ 90 ; JavaScript total < 100 Ko compressé |
| Fluidité | Recherche filtrée en < 100 ms pour 500 recettes ; animations à 60 images/s |
| Hors ligne | Toutes les fonctions du MVP disponibles sans réseau après la première visite |
| Accessibilité | Niveau WCAG 2.2 AA : contrastes, navigation clavier, libellés ARIA, focus visible, score Lighthouse Accessibilité ≥ 95 |
| Compatibilité | Deux dernières versions de Safari iOS, Chrome Android, Firefox, Edge ; largeur de 320 à 1440 px |
| Données | Aucune donnée envoyée à un serveur ; export JSON complet pour la sauvegarde ; aucune perte après fermeture brutale |
| Langue | Interface en français ; textes regroupés dans un fichier pour une traduction future |
| Qualité du code | Code commenté, fonctions de `modele.js` couvertes par des tests unitaires |

## Planning et critères de recette

Le développement avance en quatre lots ; chacun doit être utilisable seul avant de passer au suivant.

&#91;embedded content: lots de développement · 4 lots, dans l'ordre\]

Le lot 1 est le seul indispensable : il suffit à remplacer un cahier de recettes papier.

Critères de recette du MVP (état au 6 novembre 2026, version 1.0.0) :

- [ ] Créer une recette complète (titre, difficulté, temps, 5 ingrédients, 4 étapes) en moins de 3 minutes sur téléphone.
  *Saisie complète testée automatiquement (`criteres-mvp.spec.js`, critère 1) ; durée de moins de 3 minutes à vérifier sur un vrai téléphone.*
- [ ] La recette réapparaît intacte après fermeture du navigateur et redémarrage du téléphone.
  *Fermeture puis réouverture du navigateur testées automatiquement (profil persistant, critère 2) ; redémarrage du téléphone à vérifier à la main.*
- [x] Passer de 4 à 6 portions multiplie les quantités par 1,5 avec un arrondi lisible. *(critère 3)*
- [x] Chercher « poireau » trouve les recettes qui le contiennent dans le titre ou les ingrédients. *(critère 4)*
- [ ] Le mode cuisine garde l'écran allumé 10 minutes et se parcourt par swipe.
  *Balayage et demande de Wake Lock (puis libération) testés automatiquement (critère 5) ; écran allumé 10 minutes à vérifier sur un vrai téléphone.*
- [x] En mode avion, l'app installée s'ouvre et toutes les fonctions du MVP marchent. *(critère 6 et `hors-ligne.spec.js` ; installabilité vérifiée par Chrome)*
- [x] Un export JSON puis un import dans un autre navigateur restituent toutes les recettes. *(critère 7)*
- [x] Lighthouse : Performance ≥ 90, Accessibilité ≥ 95, application installable.
  *Lighthouse 13.6 en mode mobile : Performance 100, Accessibilité 100 ; installabilité vérifiée par le test `hors-ligne.spec.js` (Lighthouse 13 n'a plus de catégorie PWA).*

Vérifications manuelles sur un vrai téléphone (non automatisables) :

1. Saisir une recette complète (titre, difficulté, temps, 5 ingrédients, 4 étapes) en moins de 3 minutes.
2. Redémarrer le téléphone, rouvrir l'app installée : la recette est intacte.
3. Laisser le mode cuisine ouvert 10 minutes sans toucher l'écran : il ne se met pas en veille.

## Sources

- [Croûton sur l'App Store](https://apps.apple.com/app/crouton/id1461650987)
- [MacStories — Crouton Review](https://www.macstories.net/reviews/crouton-review-an-elegant-modern-recipe-manager-and-cooking-aid/)
- [ScreensDesign — analyse UX de Crouton](https://screensdesign.com/showcase/crouton-recipe-manager)
- [AppGoblin — statistiques de Crouton](https://appgoblin.info/apps/1461650987)
