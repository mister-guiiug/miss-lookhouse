import type { Session } from '@supabase/supabase-js';

/**
 * LA SESSION TELLE QU'ELLE EST ÉCRITE SUR L'APPAREIL, lue sans passer par
 * Supabase.
 *
 * POURQUOI NE PAS APPELER `auth.getSession()`. Parce que ce n'est pas une
 * lecture : jeton d'accès périmé — il ne vit qu'une heure — il part le
 * RENOUVELER contre le réseau, avec des reprises à intervalle croissant.
 * Sans réseau, aucune ne peut aboutir. Mesuré sur la production le
 * 2026-09-10 : **26,3 secondes de « Chargement… », puis l'écran de
 * connexion** — qu'on ne peut évidemment pas franchir hors ligne.
 *
 * Le nom de la case est celui que `@supabase/supabase-js` construit depuis
 * l'URL du projet (`sb-<ref>-auth-token`). On ne le recalcule pas : on le
 * RECONNAÎT. Reproduire la formule engagerait à la suivre à chaque version, et
 * écrire `storageKey` à la main déconnecterait d'un coup tous ceux dont la
 * session est rangée sous l'ancien nom.
 *
 * À MIGRER : le socle publie désormais le même module sous
 * `@mister-guiiug/dev-pwa-config/auth/stored-session`. Cette copie disparaîtra
 * à la prochaine montée de version du socle — elle n'attend que ça.
 */
const NOM_DE_CASE = /^sb-[a-z0-9]+-auth-token$/;

function estUneSession(valeur: unknown): valeur is Session {
  if (typeof valeur !== 'object' || valeur === null) return false;
  const s = valeur as Record<string, unknown>;
  return (
    typeof s.access_token === 'string' &&
    typeof s.refresh_token === 'string' &&
    typeof s.expires_at === 'number' &&
    typeof s.user === 'object' &&
    s.user !== null &&
    typeof (s.user as Record<string, unknown>).id === 'string'
  );
}

/**
 * La session rangée sur cet appareil, ou `null`. **Best-effort** : navigation
 * privée, stockage refusé, contenu illisible — tout rend `null`, comme une
 * absence de session.
 *
 * PÉRIMÉE OU NON, ELLE EST RENDUE. Hors ligne, un jeton expiré ne dit rien de
 * l'utilisateur : il dit qu'une heure a passé. Le renouvellement se fera au
 * retour du réseau, et `onAuthStateChange` corrigera — ou fermera la porte sur
 * `SIGNED_OUT` si le jeton de rafraîchissement a été révoqué.
 */
export function storedSession(): Session | null {
  try {
    const stockage = globalThis.localStorage;
    if (!stockage) return null;
    for (let i = 0; i < stockage.length; i++) {
      const nom = stockage.key(i);
      if (!nom || !NOM_DE_CASE.test(nom)) continue;
      const brut = stockage.getItem(nom);
      if (!brut) continue;
      const valeur: unknown = JSON.parse(brut);
      if (estUneSession(valeur)) return valeur;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Le navigateur affirme-t-il être HORS LIGNE ?
 *
 * `=== false` et non `!onLine` : hors navigateur (tests) la propriété n'existe
 * pas, et `!undefined` ferait croire à une coupure permanente. L'inverse n'est
 * pas fiable non plus — `onLine` est vrai derrière un portail captif comme sur
 * un Wi-Fi qui ne route rien. D'où l'attente bornée, côté appelant.
 */
export function navigateurHorsLigne(): boolean {
  return globalThis.navigator?.onLine === false;
}
