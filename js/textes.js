// Tous les textes de l'interface, regroupés par écran.
// Aucun texte ne doit être écrit en dur dans les écrans : on passe toujours par T.

export const T = {
  // Coquille de l'application : en-tête, onglets, bouton flottant, routeur
  app: {
    nom: 'Recette',
    navigation: 'Navigation principale',
    onglets: {
      recettes: 'Recettes',
      favoris: 'Favoris',
      reglages: 'Réglages',
    },
    nouvelleRecette: 'Nouvelle recette',
    // Titre de l'onglet du navigateur : « Favoris — Recette »
    titreDocument: (titreEcran) => `${titreEcran} — Recette`,
    erreurChargement: "Cet écran n'a pas pu s'afficher. Vérifiez votre connexion puis réessayez.",
    reessayer: 'Réessayer',
  },

  // Texte commun aux écrans provisoires (remplacés au fil des étapes)
  provisoire: {
    enConstruction: 'Écran en construction.',
    parametres: 'Paramètres de la route',
    aucunParametre: 'Aucun paramètre.',
  },

  // E1 — Liste des recettes
  liste: {
    titre: 'Mes recettes',
    exemple: 'Ouvrir une recette d’exemple',
  },

  // E1 filtré — Favoris
  favoris: {
    titre: 'Favoris',
  },

  // E2 — Fiche recette
  fiche: {
    titre: 'Recette',
    cuisiner: 'Cuisiner',
    modifier: 'Modifier',
  },

  // E3 — Création et modification
  edition: {
    titreNouvelle: 'Nouvelle recette',
    titreModification: 'Modifier la recette',
    annuler: 'Annuler',
  },

  // E4 — Mode cuisine
  cuisine: {
    titre: 'Mode cuisine',
    quitter: 'Quitter le mode cuisine',
  },

  // E5 — Réglages
  reglages: {
    titre: 'Réglages',
  },

  // Messages de validation d'une recette (modele.js → validerRecette), affichés sous le champ concerné
  validation: {
    identifiant: 'La recette n’a pas d’identifiant.',
    titreObligatoire: 'Donnez un titre à la recette.',
    titreTropLong: (max) => `Le titre ne doit pas dépasser ${max} caractères.`,
    descriptionTropLongue: (max) => `La description ne doit pas dépasser ${max} caractères.`,
    difficulte: 'Choisissez une difficulté : facile, moyen ou difficile.',
    temps: (max) => `Indiquez un nombre entier de minutes, entre 0 et ${max}.`,
    portions: (min, max) => `Indiquez un nombre entier de portions, entre ${min} et ${max}.`,
    categories: 'Les catégories doivent être des noms non vides.',
    favori: 'La valeur « favori » doit être vraie ou fausse.',
    photo: 'La photo doit être une image.',
    texte: 'Ce champ doit contenir du texte.',
    date: 'La date est absente ou invalide.',
    ingredientsObligatoires: 'Ajoutez au moins un ingrédient.',
    ingredientSansNom: 'Chaque ingrédient doit avoir un nom.',
    quantite: 'Les quantités doivent être des nombres positifs.',
    etapesObligatoires: 'Ajoutez au moins une étape.',
    minuteur: 'La durée d’un minuteur doit être un nombre entier de secondes.',
  },

  // Erreurs du stockage local (db.js), affichées telles quelles à l'utilisateur
  stockage: {
    indisponible: 'Le stockage local n’est pas disponible dans ce navigateur (navigation privée ?). Vos recettes ne peuvent pas être enregistrées.',
    bloquee: 'La base de recettes est bloquée par un autre onglet. Fermez les autres onglets de l’application, puis réessayez.',
    version: 'Les données ont été enregistrées par une version plus récente de l’application. Rechargez la page.',
    quota: 'L’espace de stockage est plein. Supprimez des photos ou des recettes, puis réessayez.',
    generique: 'L’enregistrement a échoué. Réessayez dans un instant.',
    recetteInvalide: 'La recette contient des erreurs et n’a pas été enregistrée.',
    recetteInconnue: 'Cette recette n’existe pas ou a été supprimée.',
    categorieVide: 'Donnez un nom à la catégorie.',
    categorieInconnue: 'Cette catégorie n’existe pas.',
    importInvalide: 'Ce fichier ne contient pas de recettes au format attendu.',
    modeImport: 'Mode d’import inconnu : choisissez « fusionner » ou « remplacer ».',
  },

  // Unités des durées affichées (modele.js → formaterDuree) : « 1 h 15 », « 2 j 3 h »
  duree: {
    minutes: 'min',
    heures: 'h',
    jours: 'j',
  },

  // Textes produits par la logique métier (modele.js)
  modele: {
    // Ajouté au titre d'une recette dupliquée
    suffixeCopie: ' (copie)',
  },
};
