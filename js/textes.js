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
};
