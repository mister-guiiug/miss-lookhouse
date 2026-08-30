/**
 * Réglage du thème, en un seul endroit.
 *
 * POURQUOI UN MODULE POUR TROIS CONSTANTES. Elles sont lues par TROIS endroits
 * qui doivent rester d'accord, et dont deux ne se voient pas l'un l'autre :
 * `ThemeProvider` dans `App.tsx`, le script anti-FOUC d'`index.html`, et le
 * test qui vérifie que les deux lisent bien les mêmes clés. Un désaccord ne
 * casse rien au build : il affiche simplement le premier écran dans le mauvais
 * thème, puis bascule.
 */

/** Clé famille, partagée par les apps d'une même origine. */
export const THEME_STORAGE_KEY = 'dwc_theme';

/**
 * Clé historique de miss-lookhouse, lue une dernière fois puis réécrite sous
 * `THEME_STORAGE_KEY`. Sans elle, adopter le socle remettrait chaque
 * utilisateur au thème système — sans erreur, et une seule fois, donc sans que
 * personne ne le remonte.
 */
export const THEME_LEGACY_KEYS = ['lh_theme'];

/** Couleur de la barre du navigateur, reprise telle quelle de l'ancien store. */
export const THEME_COLOR = { light: '#0f766e', dark: '#08201e' };
