import { lazy } from 'react';

/**
 * LE MORCEAU DE LA CARTE, NOMMÉ UNE SEULE FOIS.
 *
 * Ce thunk sert DEUX FOIS : à `lazy` ci-dessous, pour la route `/carte`, et au
 * préchargement que `MapLink` déclenche à l'intention. Il faut que ce soit
 * LITTÉRALEMENT le même spécificateur dans les deux cas, sinon le bundler émet
 * deux morceaux et le préchargement ne sert plus à rien — il téléchargerait
 * une copie que la route n'utiliserait pas.
 *
 * POURQUOI CE FICHIER EXISTE. `MapScreen` était déclaré paresseux dans
 * `App.tsx`, donc hors de portée du tableau de bord qui porte le seul lien
 * vers la carte. Un module minuscule, sans import statique lourd, rend le
 * thunk partageable sans faire entrer Leaflet dans le bundle de qui l'importe.
 */
export const chargeMapScreen = () => import('./MapScreen');

export const MapScreen = lazy(() =>
  chargeMapScreen().then(m => ({ default: m.MapScreen }))
);
