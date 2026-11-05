# Recette

Application web pour créer, ranger et cuisiner ses recettes, inspirée de Croûton.
Pensée d'abord pour le téléphone, elle fonctionne hors ligne et s'installe sur l'écran d'accueil (PWA).
Sans compte ni abonnement : les recettes restent sur l'appareil.

## Lancer en local

Prérequis : Node.js 22 ou plus récent.

```sh
npm install        # outils de développement (tests)
npm run serve      # puis ouvrir http://localhost:8000
npm test           # tests unitaires
npm run e2e        # tests de bout en bout (Playwright)
```

Sans Node : `python3 -m http.server 8000` à la racine du projet suffit pour servir l'app.

## Feuille de route

| Lot | Contenu |
| --- | --- |
| 1 — MVP | Créer, modifier, dupliquer et supprimer des recettes ; recherche ; catégories ; favoris ; portions ajustables ; mode cuisine étape par étape ; hors ligne ; mode sombre ; export / import JSON |
| 2 — Confort | Minuteurs, photos, cases à cocher, sections d'ingrédients, impression, couleur d'accent |
| 3 — Organisation | Liste de courses, planning de la semaine |
| 4 — Avancé | Partage par lien, import depuis une URL, synchronisation entre appareils |

Détails : [cahier des charges](docs/cahier-des-charges.md) · [plan de développement](docs/plan-de-developpement.md).
