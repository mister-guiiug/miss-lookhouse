/**
 * L'APPEL D'EFFACEMENT, VU DU CLIENT.
 *
 * L'écran est éprouvé ailleurs (`supprimer-son-compte.test.tsx`, où ce module
 * est simulé) et l'effacement lui-même en SQL, sur une vraie base
 * (`supabase/tests/delete_my_account.test.sql`). Restait entre les deux le
 * seul endroit que ni l'un ni l'autre ne regarde : ce que le client ENVOIE.
 *
 * Deux promesses y sont tenues, et aucune n'est cosmétique :
 *
 *   1. le nom de la procédure. Il est écrit en toutes lettres dans 0013 ; une
 *      faute de frappe ici rendrait une erreur PostgREST à l'exécution, jamais
 *      à la compilation — et seulement le jour où quelqu'un supprime son
 *      compte pour de bon ;
 *   2. l'ABSENCE d'argument. `delete_my_account()` lit `auth.uid()` : c'est le
 *      serveur qui décide de qui il s'agit. Un client qui passerait un
 *      identifiant en paramètre inviterait à supprimer le compte d'un autre —
 *      et la fonction, `security definer` et propriété de `postgres`, ne
 *      serait plus là pour l'en empêcher.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

const client = vi.hoisted(() => ({
  current: null as { rpc: ReturnType<typeof vi.fn> } | null,
}));

vi.mock('./supabaseClient', () => ({
  getSupabase: () => Promise.resolve(client.current),
}));

const { deleteMyAccount } = await import('./account');

function withRpc(result: { error: { message: string } | null }) {
  const rpc = vi.fn(() => Promise.resolve(result));
  client.current = { rpc };
  return rpc;
}

afterEach(() => {
  client.current = null;
});

describe('deleteMyAccount', () => {
  it('appelle `delete_my_account` — et ne lui dit PAS qui supprimer', async () => {
    const rpc = withRpc({ error: null });

    await deleteMyAccount();

    expect(rpc).toHaveBeenCalledTimes(1);
    // `toHaveBeenCalledWith` avec un seul argument échoue si un second est
    // passé : c'est exactement l'assertion voulue.
    expect(rpc).toHaveBeenCalledWith('delete_my_account');
  });

  it('en mode local, refuse au lieu de faire semblant', async () => {
    client.current = null;
    await expect(deleteMyAccount()).rejects.toThrow('Mode local');
  });

  it('remonte le refus du serveur au lieu de l’avaler', async () => {
    withRpc({ error: { message: 'permission denied for table users' } });
    // Le mode d'échec redouté : un `error` non lu, une promesse tenue, et
    // l'écran qui déconnecte en annonçant un compte effacé qui ne l'est pas.
    await expect(deleteMyAccount()).rejects.toThrow(
      'permission denied for table users'
    );
  });
});
