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
    // Bandeau de mise à jour (service worker)
    nouvelleVersion: 'Nouvelle version disponible',
    recharger: 'Recharger',
  },

  // E1 — Liste des recettes
  liste: {
    titre: 'Mes recettes',
    recherche: 'Rechercher une recette',
    rechercheIndication: 'Titre, ingrédient, note…',
    categories: 'Filtrer par catégorie',
    toutes: 'Toutes',
    tri: 'Trier par',
    criteresTri: {
      date: 'Les plus récentes',
      titre: 'Titre (A → Z)',
      temps: 'Temps total',
    },
    // Nombre de résultats, annoncé aux lecteurs d'écran
    resultats: (nombre) => {
      if (nombre === 0) return 'Aucune recette';
      return nombre === 1 ? '1 recette' : `${nombre} recettes`;
    },
    // État vide : aucune recette enregistrée
    videTitre: 'Votre carnet est encore vide',
    videTexte: 'Notez-y vos plats préférés, ou faites le tour de l’app avec quelques recettes d’exemple.',
    creerPremiere: 'Créer ma première recette',
    chargerExemples: 'Charger des exemples',
    chargementExemples: 'Chargement…',
    // État « aucun résultat » : la recherche ne trouve rien
    aucunResultatTitre: (requete) => `Aucune recette pour « ${requete} »`,
    aucunResultatTexte: 'Vérifiez l’orthographe, ou cherchez plutôt un ingrédient.',
    aucunResultatCategorie: (categorie) => `Aucune recette dans « ${categorie} » ne correspond.`,
    effacerRecherche: 'Effacer la recherche',
  },

  // E1 filtré — Favoris
  favoris: {
    titre: 'Favoris',
    videTitre: 'Pas encore de favori',
    videTexte: 'Touchez le cœur d’une recette pour la retrouver ici en un geste.',
    voirRecettes: 'Voir mes recettes',
  },

  // Carte d'une recette dans la liste (js/composants/carte-recette.js)
  carte: {
    tempsTotal: 'Temps total :',
    difficulte: (niveau) => `Difficulté : ${niveau}`,
    favori: 'Favori',
  },

  // E2 — Fiche recette
  fiche: {
    retour: 'Retour à la liste',
    favori: 'Favori',
    categories: 'Catégories',
    // Bloc infos
    infos: 'En bref',
    difficulte: 'Difficulté',
    difficultes: { facile: 'Facile', moyen: 'Moyen', difficile: 'Difficile' },
    preparation: 'Préparation',
    cuisson: 'Cuisson',
    repos: 'Repos',
    total: 'Total',
    // Blocs de contenu
    ingredients: 'Ingrédients',
    etapes: 'Étapes',
    notes: 'Notes',
    source: 'Source :',
    // Actions
    actions: 'Actions sur la recette',
    cuisiner: 'Cuisiner',
    plusActions: 'Plus d’actions',
    modifier: 'Modifier',
    dupliquer: 'Dupliquer',
    partager: 'Partager',
    supprimer: 'Supprimer',
    copieCreee: 'Copie créée. Vous pouvez maintenant la modifier.',
    copieePressePapiers: 'Recette copiée dans le presse-papiers.',
    partageImpossible: 'Le partage n’est pas disponible sur cet appareil.',
    // Confirmation de suppression (<dialog>)
    confirmationTitre: 'Supprimer cette recette ?',
    confirmationTexte: (titre) => `« ${titre} » sera définitivement effacée de cet appareil.`,
    annuler: 'Annuler',
    confirmerSuppression: 'Supprimer',
    supprimee: (titre) => `« ${titre} » a été supprimée.`,
    // Identifiant inconnu
    introuvableTitre: 'Recette introuvable',
    introuvableTexte: 'Cette recette n’existe pas ou a été supprimée.',
    erreurTitre: 'Recette indisponible',
    voirRecettes: 'Voir mes recettes',
  },

  // Sélecteur de portions (js/composants/selecteur-portions.js)
  portions: {
    groupe: 'Nombre de portions',
    moins: 'Une portion de moins',
    plus: 'Une portion de plus',
    unite: (nombre) => (nombre > 1 ? 'portions' : 'portion'),
  },

  // Texte brut d'une recette partagée (modele.js → formaterRecetteTexte)
  partage: {
    portions: (nombre) => `Pour ${nombre} ${nombre > 1 ? 'portions' : 'portion'}`,
    temps: {
      tempsPreparation: 'Préparation',
      tempsCuisson: 'Cuisson',
      tempsRepos: 'Repos',
    },
    ingredients: 'Ingrédients',
    etapes: 'Étapes',
    notes: 'Notes',
    source: 'Source :',
  },

  // Messages éphémères (js/composants/toast.js)
  toast: {
    region: 'Notifications',
  },

  // E3 — Création et modification
  edition: {
    titreNouvelle: 'Nouvelle recette',
    titreModification: 'Modifier la recette',
    // Sections du formulaire
    infos: 'Infos',
    ingredients: 'Ingrédients',
    etapes: 'Étapes',
    notes: 'Notes',
    // Infos
    titre: 'Titre',
    titreIndication: 'Ex. Tarte aux poireaux',
    obligatoire: '(obligatoire)',
    description: 'Description',
    descriptionIndication: 'Quelques mots pour donner envie',
    compteur: (nombre, max) => `${nombre} / ${max}`,
    compteurAide: (max) => `${max} caractères au maximum.`,
    difficulte: 'Difficulté',
    difficultes: { facile: 'Facile', moyen: 'Moyen', difficile: 'Difficile' },
    temps: 'Temps',
    preparation: 'Préparation',
    cuisson: 'Cuisson',
    repos: 'Repos',
    minutes: 'min',
    enMinutes: 'en minutes',
    portions: 'Portions',
    categories: 'Catégories',
    aucuneCategorie: 'Aucune catégorie pour l’instant : créez la première ci-dessous.',
    nouvelleCategorie: 'Nouvelle catégorie',
    nouvelleCategorieIndication: 'Ex. Brunch',
    ajouterCategorie: 'Créer',
    categorieAjoutee: (nom) => `Catégorie « ${nom} » sélectionnée.`,
    // Ingrédients
    ingredient: (numero) => `Ingrédient ${numero}`,
    quantite: 'Quantité',
    quantiteIndication: 'Qté',
    unite: 'Unité',
    nom: 'Nom',
    nomIndication: 'Ingrédient',
    precision: 'Précision',
    precisionIndication: 'Précision',
    menuIngredient: (numero) => `Actions de l’ingrédient ${numero}`,
    positionIngredient: (numero, total) => `Ingrédient déplacé en position ${numero} sur ${total}.`,
    ajouterIngredient: 'Ajouter un ingrédient',
    // Mode « ligne libre » : « 200 g farine » dans un seul champ
    ligneLibre: 'Saisir en une ligne',
    champsDetailles: 'Saisir en champs détaillés',
    ligneLibreLibelle: 'Quantité, unité et nom',
    ligneLibreIndication: 'Ex. 200 g farine',
    // Collage de plusieurs lignes
    ingredientsColles: (nombre) => (nombre > 1 ? `${nombre} ingrédients ajoutés.` : '1 ingrédient ajouté.'),
    etapesCollees: (nombre) => (nombre > 1 ? `${nombre} étapes ajoutées.` : '1 étape ajoutée.'),
    // Étapes
    etape: (numero) => `Étape ${numero}`,
    etapeIndication: 'Décrivez cette étape',
    menuEtape: (numero) => `Actions de l’étape ${numero}`,
    positionEtape: (numero, total) => `Étape déplacée en position ${numero} sur ${total}.`,
    ajouterEtape: 'Ajouter une étape',
    // Notes
    notesLibelle: 'Notes',
    notesIndication: 'Astuces, variantes…',
    source: 'Source',
    sourceIndication: 'Livre, lien web…',
    // Barre d'actions
    actions: 'Actions du formulaire',
    annuler: 'Annuler',
    enregistrer: 'Enregistrer',
    enregistrement: 'Enregistrement…',
    erreursFormulaire: 'Corrigez les champs signalés pour enregistrer la recette.',
    enregistree: 'Recette enregistrée.',
    // Brouillon automatique
    brouillonTitre: 'Brouillon retrouvé',
    brouillonTexte: (date) => `Des modifications non enregistrées${date ? ` du ${date}` : ''} ont été conservées.`,
    reprendreBrouillon: 'Reprendre le brouillon',
    ignorerBrouillon: 'Ignorer',
    brouillonRepris: 'Brouillon repris.',
    // Sortie avec des modifications non enregistrées (<dialog>)
    quitterTitre: 'Quitter sans enregistrer ?',
    quitterTexte: 'Vos modifications seront perdues.',
    continuer: 'Continuer la saisie',
    quitter: 'Quitter',
    // Identifiant inconnu ou base illisible
    introuvableTitre: 'Recette introuvable',
    introuvableTexte: 'Cette recette n’existe pas ou a été supprimée.',
    erreurTitre: 'Recette indisponible',
    voirRecettes: 'Voir mes recettes',
  },

  // Menu d'une ligne d'ingrédient ou d'étape (js/composants/liste-lignes.js)
  lignes: {
    monter: 'Monter',
    descendre: 'Descendre',
    supprimer: 'Supprimer',
  },

  // E4 — Mode cuisine
  cuisine: {
    titre: 'Mode cuisine',
    quitter: 'Quitter le mode cuisine',
    // Progression : « Étape 3 / 8 »
    progression: (numero, total) => `Étape ${numero} / ${total}`,
    progressionFin: 'Terminé',
    etape: (numero, total) => `Étape ${numero} sur ${total}`,
    // Navigation entre les étapes
    navigation: 'Navigation entre les étapes',
    precedent: 'Précédent',
    suivant: 'Suivant',
    termine: 'Terminé',
    // Ingrédients cités (bulle) et panneau
    ingredients: 'Ingrédients',
    pourPortions: (nombre) => `Pour ${nombre} ${nombre > 1 ? 'portions' : 'portion'}`,
    selonGout: 'Quantité selon votre goût',
    fermer: 'Fermer',
    // Écran maintenu allumé (Wake Lock)
    veilleIndisponible: 'Ce navigateur ne peut pas garder l’écran allumé : touchez-le de temps en temps.',
    // Fin de la recette
    finTitre: 'Bon appétit !',
    finTexte: 'Toutes les étapes sont terminées.',
    revenirFiche: 'Revenir à la fiche',
    // Identifiant inconnu ou base illisible
    introuvableTitre: 'Recette introuvable',
    introuvableTexte: 'Cette recette n’existe pas ou a été supprimée.',
    erreurTitre: 'Recette indisponible',
    voirRecettes: 'Voir mes recettes',
  },

  // E5 — Réglages
  reglages: {
    titre: 'Réglages',
    // Thème
    apparence: 'Apparence',
    theme: 'Thème',
    themes: { clair: 'Clair', sombre: 'Sombre', systeme: 'Système' },
    themeAide: '« Système » suit le réglage de votre appareil.',
    // Catégories
    categories: 'Catégories',
    aucuneCategorie: 'Aucune catégorie pour l’instant.',
    nombreRecettes: (nombre) => {
      if (nombre === 0) return 'Aucune recette';
      return nombre === 1 ? '1 recette' : `${nombre} recettes`;
    },
    renommer: (nom) => `Renommer « ${nom} »`,
    nouveauNom: (nom) => `Nouveau nom de « ${nom} »`,
    renommerAide: 'Entrée pour valider, Échap pour annuler.',
    supprimer: (nom) => `Supprimer « ${nom} »`,
    nouvelleCategorie: 'Nouvelle catégorie',
    nouvelleCategorieIndication: 'Ex. Brunch',
    creer: 'Créer',
    categorieCreee: (nom) => `Catégorie « ${nom} » créée.`,
    categorieExiste: (nom) => `La catégorie « ${nom} » existe déjà.`,
    categorieRenommee: (ancien, nouveau) => `« ${ancien} » s’appelle maintenant « ${nouveau} ».`,
    categoriesFusionnees: (ancien, nouveau) => `« ${ancien} » a rejoint « ${nouveau} ».`,
    categorieSupprimee: (nom) => `Catégorie « ${nom} » supprimée.`,
    // Confirmation de suppression d'une catégorie
    supprimerCategorieTitre: (nom) => `Supprimer « ${nom} » ?`,
    supprimerCategorieTexte: (nombre) => {
      if (nombre === 0) return 'Aucune recette n’est rangée dans cette catégorie.';
      if (nombre === 1) return 'Elle sera retirée de 1 recette, qui sera conservée.';
      return `Elle sera retirée de ${nombre} recettes, qui seront conservées.`;
    },
    // Données
    donnees: 'Données',
    donneesAide: 'Vos recettes ne quittent jamais cet appareil. Exportez-les pour les sauvegarder ou les transférer.',
    exporter: 'Exporter mes recettes',
    exportees: (nombre) => (nombre > 1 ? `${nombre} recettes exportées.` : `${nombre} recette exportée.`),
    importer: 'Importer un fichier',
    importerAide: 'Fichier .json créé par « Exporter mes recettes ».',
    fichierIllisible: 'Ce fichier n’est pas un fichier JSON lisible.',
    // Résumé de l'import (<dialog>)
    importTitre: 'Importer ce fichier ?',
    importResume: (nombre, presentes) => {
      const recettes = nombre > 1 ? `${nombre} recettes` : `${nombre} recette`;
      if (presentes === 0) return `${recettes}.`;
      return `${recettes}, dont ${presentes} ${presentes > 1 ? 'déjà présentes' : 'déjà présente'}.`;
    },
    importAucune: 'Ce fichier ne contient aucune recette valide.',
    importInvalides: (nombre) => (nombre > 1
      ? `${nombre} recettes invalides seront ignorées :`
      : '1 recette invalide sera ignorée :'),
    recetteSansTitre: (position) => `Recette n° ${position} (sans titre)`,
    recetteInvalide: (position, titre) => `Recette n° ${position} « ${titre} »`,
    fusionnerAide: 'Fusionner : ajoute les recettes du fichier ; pour celles déjà présentes, garde la version modifiée le plus récemment.',
    remplacerAide: 'Remplacer : efface d’abord toutes vos recettes et catégories.',
    fusionner: 'Fusionner',
    remplacer: 'Remplacer',
    annuler: 'Annuler',
    fermer: 'Fermer',
    importees: (nombre, ignorees) => {
      const texte = nombre > 1 ? `${nombre} recettes importées.` : `${nombre} recette importée.`;
      if (ignorees === 0) return texte;
      return `${texte} ${ignorees > 1 ? `${ignorees} versions locales plus récentes ont été gardées.` : '1 version locale plus récente a été gardée.'}`;
    },
    // Tout effacer (double confirmation)
    toutEffacer: 'Tout effacer',
    effacerTitre: 'Tout effacer ?',
    effacerTexte: (nombre) => {
      const recettes = nombre > 1 ? `Vos ${nombre} recettes` : nombre === 1 ? 'Votre recette' : 'Toutes les données';
      return `${recettes}, vos catégories et vos réglages seront définitivement effacés de cet appareil. Pensez à exporter vos recettes avant.`;
    },
    continuer: 'Continuer',
    effacerConfirmationTitre: 'Dernière confirmation',
    motConfirmation: 'EFFACER',
    effacerConfirmationTexte: 'Cette action est irréversible. Pour confirmer, tapez EFFACER.',
    effacerSaisie: 'Mot de confirmation',
    effacerDefinitivement: 'Effacer définitivement',
    toutEfface: 'Toutes les données ont été effacées.',
    // À propos
    aPropos: 'À propos',
    version: 'Version',
    espaceUtilise: 'Espace utilisé',
    espaceDisponible: 'Espace disponible',
    espaceInconnu: 'Inconnu sur ce navigateur',
    persistance: 'Stockage persistant',
    persistanceAccordee: 'Accordé : le navigateur n’effacera pas vos recettes de lui-même.',
    persistanceRefusee: 'Non accordé : le navigateur peut effacer vos recettes s’il manque de place.',
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
    recetteIllisible: 'Cet élément n’est pas une recette.',
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
    versionImport: 'Ce fichier vient d’une version plus récente de l’application. Mettez-la à jour, puis réessayez.',
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
