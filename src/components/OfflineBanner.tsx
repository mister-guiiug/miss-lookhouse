import { ConnectionBanner } from '@mister-guiiug/dev-pwa-config/react/connection-banner';
import { IS_SUPABASE } from '../backend/config';
import { offlineLabel } from './offlineLabel';

/**
 * Le seul endroit de l'app qui dise « vous êtes hors connexion ».
 *
 * CE QUI EXISTAIT, ET POURQUOI ÇA NE SUFFISAIT PAS. `SupabaseSync` affiche
 * déjà un bandeau de synchronisation, et la file du socle fait le travail : les
 * six intentions du store (recherches, statuts, notes, notifications,
 * vérifications) sont mises de côté et rejouées au retour du réseau. Mais son
 * message — « 3 en attente de synchronisation… » — est le MÊME que le réseau
 * soit coupé ou que le serveur soit lent. L'utilisateur ne peut pas savoir
 * lequel des deux, donc ne peut rien décider. Et hors mode Supabase, ou sur
 * l'écran de connexion, rien du tout n'était dit.
 *
 * PAS DE CONCURRENCE VISUELLE. `.sync-banner` est fixé EN BAS (au-dessus de la
 * barre de navigation) ; celui-ci vit dans le flux, en haut, au-dessus de
 * l'en-tête collant. Les deux peuvent s'afficher ensemble sans se recouvrir, et
 * ils disent deux choses différentes : l'état du réseau, et l'état de la file.
 * Aucune invite de mise à jour n'existe dans cette app (`registerType:
 * 'autoUpdate'`, rechargement manuel dans le menu) — rien d'autre à empiler.
 *
 * LE TEXTE DIT LA VÉRITÉ, ET ELLE DÉPEND DU MODE. En Supabase, la file existe
 * vraiment : promettre l'envoi différé n'est pas une politesse, c'est exact.
 * En local, il n'y a rien à envoyer — le promettre serait un mensonge.
 */
export function OfflineBanner() {
  return <ConnectionBanner label={offlineLabel(IS_SUPABASE)} />;
}
