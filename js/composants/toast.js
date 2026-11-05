// Message éphémère (toast) posé en bas de l'écran, au-dessus de la barre d'onglets.
// La zone est créée une seule fois dans <body>, hors de <main> : le message survit
// à un changement d'écran (ex. « Recette supprimée » après le retour à la liste).

import { T } from '../textes.js';

/** Durée d'affichage par défaut, en millisecondes. */
const DUREE = 4000;

let zone = null;
let minuterie = null;

/** Crée la zone annoncée (role="status") au premier appel. */
function zoneToasts() {
  if (zone?.isConnected) return zone;
  zone = document.createElement('div');
  zone.className = 'toasts';
  zone.setAttribute('role', 'status');
  zone.setAttribute('aria-live', 'polite');
  zone.setAttribute('aria-label', T.toast.region);
  document.body.append(zone);
  return zone;
}

/**
 * Affiche un message éphémère, qui remplace le précédent.
 * @param {string} message texte affiché (inséré via textContent)
 * @param {object} [options]
 * @param {boolean} [options.erreur] style d'erreur
 * @param {number} [options.duree] durée d'affichage en millisecondes
 */
export function afficherToast(message, { erreur = false, duree = DUREE } = {}) {
  const conteneur = zoneToasts();
  clearTimeout(minuterie);

  const toast = document.createElement('p');
  toast.className = erreur ? 'toast toast--erreur' : 'toast';
  toast.textContent = message;

  // Laisse au lecteur d'écran le temps de repérer la zone avant d'y écrire
  requestAnimationFrame(() => {
    conteneur.replaceChildren(toast);
    minuterie = setTimeout(() => {
      toast.classList.add('toast--sortie');
      toast.addEventListener('animationend', () => toast.remove(), { once: true });
      // Repli si l'animation n'a pas lieu (onglet en arrière-plan, mouvement réduit)
      setTimeout(() => toast.remove(), 400);
    }, duree);
  });
}
