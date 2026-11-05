// Recettes d'exemple, proposées sur l'écran vide (« Charger des exemples »).
// Elles couvrent les trois difficultés, les catégories de base, le temps de repos,
// les sections d'ingrédients et des étapes avec durée (minuteurs).
// Ce sont des données, pas des textes d'interface : elles restent ici, hors de textes.js.

import { creerRecette } from './modele.js';
import { enregistrerRecette, lireRecette } from './db.js';

/** Données des recettes d'exemple ; les id fixes évitent les doublons au rechargement. */
export const EXEMPLES = [
  {
    id: 'exemple-tarte-poireaux',
    titre: 'Tarte aux poireaux',
    description: 'Une tarte fondante et généreuse, parfaite avec une salade verte.',
    difficulte: 'facile',
    tempsPreparation: 20,
    tempsCuisson: 35,
    portions: 6,
    categories: ['Plat', 'Végétarien'],
    ingredients: [
      { quantite: 1, unite: 'pièce', nom: 'pâte brisée' },
      { quantite: 3, unite: 'pièce', nom: 'poireaux', precision: 'émincés' },
      { quantite: 200, unite: 'ml', nom: 'crème fraîche' },
      { quantite: 3, unite: 'pièce', nom: 'œufs' },
      { quantite: 100, unite: 'g', nom: 'gruyère râpé' },
      { quantite: 20, unite: 'g', nom: 'beurre' },
      { quantite: 1, unite: 'pincée', nom: 'noix de muscade' },
      { nom: 'sel et poivre' },
    ],
    etapes: [
      { texte: 'Préchauffer le four à 180 °C. Foncer un moule avec la pâte brisée et la piquer à la fourchette.' },
      { texte: 'Faire fondre les poireaux 15 min à feu doux dans le beurre.', minuteur: 900 },
      { texte: 'Battre les œufs avec la crème fraîche, la noix de muscade, le sel et le poivre.' },
      { texte: 'Répartir les poireaux sur la pâte, verser l’appareil et parsemer de gruyère râpé.' },
      { texte: 'Enfourner 35 min, jusqu’à ce que la tarte soit bien dorée.', minuteur: 2100 },
    ],
    notes: 'Variante : ajouter 100 g de lardons revenus avec les poireaux.',
    source: 'Cahier des charges',
  },
  {
    id: 'exemple-veloute-potimarron',
    titre: 'Velouté de potimarron',
    description: 'Une soupe douce et veloutée, sans éplucher le potimarron.',
    difficulte: 'facile',
    tempsPreparation: 15,
    tempsCuisson: 30,
    portions: 4,
    categories: ['Entrée', 'Végétarien'],
    ingredients: [
      { quantite: 1, unite: 'kg', nom: 'potimarron' },
      { quantite: 1, unite: 'pièce', nom: 'oignon', precision: 'émincé' },
      { quantite: 75, unite: 'cl', nom: 'bouillon de légumes' },
      { quantite: 10, unite: 'cl', nom: 'crème liquide' },
      { quantite: 1, unite: 'c. à s.', nom: 'huile d’olive' },
      { nom: 'sel et poivre' },
    ],
    etapes: [
      { texte: 'Laver le potimarron, l’ouvrir, retirer les graines et le couper en cubes avec la peau.' },
      { texte: 'Faire revenir l’oignon 5 min dans l’huile d’olive.', minuteur: 300 },
      { texte: 'Ajouter le potimarron et le bouillon de légumes, puis cuire 25 min à couvert.', minuteur: 1500 },
      { texte: 'Mixer finement avec la crème liquide, saler et poivrer.' },
    ],
    notes: 'Servir avec quelques graines de courge grillées.',
  },
  {
    id: 'exemple-salade-chevre-chaud',
    titre: 'Salade de chèvre chaud',
    description: 'Le classique des bistrots, prêt en un quart d’heure.',
    difficulte: 'facile',
    tempsPreparation: 10,
    tempsCuisson: 5,
    portions: 2,
    categories: ['Entrée', 'Rapide', 'Végétarien'],
    ingredients: [
      { quantite: 1, unite: 'pièce', nom: 'bûche de chèvre', precision: 'en 6 rondelles' },
      { quantite: 6, unite: 'pièce', nom: 'tranches de baguette' },
      { quantite: 150, unite: 'g', nom: 'mesclun' },
      { quantite: 1, unite: 'c. à s.', nom: 'miel' },
      { quantite: 30, unite: 'g', nom: 'cerneaux de noix' },
      { quantite: 3, unite: 'c. à s.', nom: 'huile de noix' },
      { quantite: 1, unite: 'c. à s.', nom: 'vinaigre balsamique' },
    ],
    etapes: [
      { texte: 'Préchauffer le gril du four. Poser une rondelle de bûche de chèvre sur chaque tranche de baguette et arroser d’un filet de miel.' },
      { texte: 'Passer sous le gril 5 min, jusqu’à ce que le chèvre soit doré.', minuteur: 300 },
      { texte: 'Pendant ce temps, mélanger l’huile de noix et le vinaigre balsamique, puis assaisonner le mesclun.' },
      { texte: 'Servir les toasts chauds sur la salade, avec les cerneaux de noix.' },
    ],
  },
  {
    id: 'exemple-gratin-dauphinois',
    titre: 'Gratin dauphinois',
    description: 'Des pommes de terre fondantes cuites lentement dans le lait et la crème.',
    difficulte: 'moyen',
    tempsPreparation: 25,
    tempsCuisson: 75,
    portions: 6,
    categories: ['Plat', 'Végétarien'],
    ingredients: [
      { quantite: 1.5, unite: 'kg', nom: 'pommes de terre', precision: 'à chair ferme' },
      { quantite: 50, unite: 'cl', nom: 'lait entier' },
      { quantite: 25, unite: 'cl', nom: 'crème fraîche' },
      { quantite: 2, unite: 'gousse', nom: 'ail' },
      { quantite: 20, unite: 'g', nom: 'beurre' },
      { quantite: 1, unite: 'pincée', nom: 'noix de muscade' },
      { nom: 'sel et poivre' },
    ],
    etapes: [
      { texte: 'Préchauffer le four à 150 °C. Frotter un plat à gratin avec l’ail, puis le beurrer.' },
      { texte: 'Éplucher les pommes de terre et les couper en fines rondelles, sans les laver.' },
      { texte: 'Porter à frémissement le lait entier avec la crème fraîche, la noix de muscade, le sel et le poivre. Y cuire les pommes de terre 10 min en remuant délicatement.', minuteur: 600 },
      { texte: 'Verser le tout dans le plat et enfourner 1 h 05, jusqu’à ce que le dessus soit bien gratiné.', minuteur: 3900 },
    ],
    notes: 'Ne pas laver les pommes de terre après les avoir coupées : leur amidon lie la sauce.',
  },
  {
    id: 'exemple-creme-brulee',
    titre: 'Crème brûlée',
    description: 'Une crème onctueuse à la vanille sous une fine couche de caramel craquant.',
    difficulte: 'moyen',
    tempsPreparation: 20,
    tempsCuisson: 45,
    tempsRepos: 240,
    portions: 6,
    categories: ['Dessert'],
    ingredients: [
      { quantite: 6, unite: 'pièce', nom: 'jaunes d’œufs' },
      { quantite: 50, unite: 'cl', nom: 'crème liquide entière' },
      { quantite: 25, unite: 'cl', nom: 'lait' },
      { quantite: 100, unite: 'g', nom: 'sucre' },
      { quantite: 1, unite: 'pièce', nom: 'gousse de vanille' },
      { quantite: 6, unite: 'c. à c.', nom: 'cassonade' },
    ],
    etapes: [
      { texte: 'Préchauffer le four à 100 °C. Faire chauffer le lait et la crème liquide entière avec la gousse de vanille fendue, puis laisser infuser 10 min hors du feu.', minuteur: 600 },
      { texte: 'Fouetter les jaunes d’œufs avec le sucre sans les faire mousser, puis verser le mélange chaud en remuant.' },
      { texte: 'Répartir dans six ramequins et cuire 45 min : la crème doit rester tremblotante au centre.', minuteur: 2700 },
      { texte: 'Laisser refroidir, puis réserver au moins 4 h au réfrigérateur.', minuteur: 14400 },
      { texte: 'Au moment de servir, saupoudrer chaque crème d’une cuillère de cassonade et caraméliser au chalumeau.' },
    ],
    notes: 'Sans chalumeau, passer les ramequins 2 min sous le gril très chaud, en surveillant.',
  },
  {
    id: 'exemple-boeuf-bourguignon',
    titre: 'Bœuf bourguignon',
    description: 'Le grand classique de Bourgogne, mariné une nuit puis mijoté longuement.',
    difficulte: 'difficile',
    tempsPreparation: 45,
    tempsCuisson: 180,
    tempsRepos: 720,
    portions: 6,
    categories: ['Plat'],
    ingredients: [
      { quantite: 1.5, unite: 'kg', nom: 'bœuf à braiser', precision: 'en gros cubes', section: 'Pour la marinade' },
      { quantite: 75, unite: 'cl', nom: 'vin rouge de Bourgogne', section: 'Pour la marinade' },
      { quantite: 2, unite: 'pièce', nom: 'carottes', precision: 'en rondelles', section: 'Pour la marinade' },
      { quantite: 1, unite: 'pièce', nom: 'oignon', precision: 'émincé', section: 'Pour la marinade' },
      { quantite: 1, unite: 'pièce', nom: 'bouquet garni', section: 'Pour la marinade' },
      { quantite: 200, unite: 'g', nom: 'lardons', section: 'Pour la cuisson' },
      { quantite: 250, unite: 'g', nom: 'champignons de Paris', section: 'Pour la cuisson' },
      { quantite: 2, unite: 'c. à s.', nom: 'farine', section: 'Pour la cuisson' },
      { quantite: 2, unite: 'c. à s.', nom: 'huile', section: 'Pour la cuisson' },
      { quantite: 30, unite: 'g', nom: 'beurre', section: 'Pour la cuisson' },
      { nom: 'sel et poivre', section: 'Pour la cuisson' },
    ],
    etapes: [
      { texte: 'La veille, mettre le bœuf dans un saladier avec les carottes, l’oignon, le bouquet garni et le vin rouge. Couvrir et laisser mariner 12 h au réfrigérateur.', minuteur: 43200 },
      { texte: 'Égoutter la viande en gardant la marinade. Bien sécher les morceaux de bœuf.' },
      { texte: 'Dans une cocotte, faire dorer les lardons, les retirer, puis saisir le bœuf dans l’huile 10 min, en plusieurs fois.', minuteur: 600 },
      { texte: 'Saupoudrer de farine, remuer 2 min, puis verser la marinade avec ses légumes. Saler, poivrer.', minuteur: 120 },
      { texte: 'Couvrir et laisser mijoter 3 h à feu très doux, en remuant de temps en temps.', minuteur: 10800 },
      { texte: 'Faire sauter les champignons dans le beurre 10 min, puis les ajouter avec les lardons 15 min avant la fin.', minuteur: 600 },
    ],
    notes: 'Encore meilleur réchauffé le lendemain. Servir avec des pommes de terre vapeur ou des pâtes fraîches.',
  },
];

/**
 * Enregistre les recettes d'exemple absentes de la base. Rappeler la fonction ne crée
 * pas de doublon et n'écrase pas un exemple que l'utilisateur a modifié.
 * @returns {Promise<import('./modele.js').Recette[]>} les recettes ajoutées
 */
export async function chargerExemples() {
  const ajoutees = [];
  for (const donnees of EXEMPLES) {
    if (await lireRecette(donnees.id)) continue;
    ajoutees.push(await enregistrerRecette(creerRecette(structuredClone(donnees))));
  }
  return ajoutees;
}
