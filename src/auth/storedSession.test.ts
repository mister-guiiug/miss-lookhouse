import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { navigateurHorsLigne, storedSession } from './storedSession';

/**
 * C'est ce module qui décide si quelqu'un sans réseau voit son écran ou le
 * formulaire de connexion. Il est lu au tout premier rendu, avant tout appel
 * Supabase — d'où ces cas, qui fixent ses deux bords.
 */
const CASE_SUPABASE = 'sb-ypcpvliriceprnmilxkd-auth-token';

const session = (expiresAt: number) => ({
  access_token: 'entete.charge.signature',
  refresh_token: 'jeton-de-rafraichissement',
  expires_at: expiresAt,
  expires_in: 3600,
  token_type: 'bearer',
  user: { id: 'uid-1', email: 'veille@exemple.fr' },
});

beforeEach(() => localStorage.clear());
afterEach(() => localStorage.clear());

describe('la session écrite sur l’appareil', () => {
  it('est lue sous le nom de case que Supabase construit', () => {
    localStorage.setItem(CASE_SUPABASE, JSON.stringify(session(9_999_999_999)));
    expect(storedSession()?.user.id).toBe('uid-1');
  });

  it('est rendue MÊME PÉRIMÉE — c’est tout l’objet du module', () => {
    // Un jeton d'accès vit une heure. Hors ligne, son expiration ne dit rien
    // de l'utilisateur : elle dit qu'une heure a passé. Refuser ici recréerait
    // la panne qu'on répare.
    localStorage.setItem(CASE_SUPABASE, JSON.stringify(session(1)));
    expect(storedSession()?.user.id).toBe('uid-1');
  });

  it('ignore les cases voisines (`-code-verifier`, `-user`)', () => {
    localStorage.setItem(`${CASE_SUPABASE}-code-verifier`, '"verifieur"');
    localStorage.setItem(`${CASE_SUPABASE}-user`, '{"user":{"id":"uid-1"}}');
    expect(storedSession()).toBeNull();
  });

  it('rend null sur un contenu illisible ou incomplet', () => {
    localStorage.setItem(CASE_SUPABASE, 'ceci n’est pas du JSON');
    expect(storedSession()).toBeNull();

    const { refresh_token: _, ...sansJeton } = session(1);
    localStorage.setItem(CASE_SUPABASE, JSON.stringify(sansJeton));
    expect(storedSession()).toBeNull();

    // Sans `user.id`, la session ne désigne personne.
    localStorage.setItem(
      CASE_SUPABASE,
      JSON.stringify({ ...session(1), user: {} })
    );
    expect(storedSession()).toBeNull();
  });

  it('rend null quand rien n’est rangé', () => {
    expect(storedSession()).toBeNull();
  });
});

describe('« hors ligne »', () => {
  it('n’est affirmé que sur `onLine === false`', () => {
    // `!navigator.onLine` vaudrait VRAI là où la propriété n'existe pas : tout
    // environnement de test se croirait coupé du réseau.
    const original = Object.getOwnPropertyDescriptor(navigator, 'onLine');
    const poser = (valeur: boolean | undefined) =>
      Object.defineProperty(navigator, 'onLine', {
        configurable: true,
        get: () => valeur,
      });
    try {
      poser(false);
      expect(navigateurHorsLigne()).toBe(true);
      poser(true);
      expect(navigateurHorsLigne()).toBe(false);
      poser(undefined);
      expect(navigateurHorsLigne()).toBe(false);
    } finally {
      if (original) Object.defineProperty(navigator, 'onLine', original);
    }
  });
});
