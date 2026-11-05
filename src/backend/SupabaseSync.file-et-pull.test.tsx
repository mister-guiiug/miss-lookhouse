/**
 * LA FILE AVANT LE PULL — ce que ces tests tiennent.
 *
 * Au relevé du 05/11/2026 (audit hors ligne du parc), trois défauts, un même
 * effet : des écritures que la personne croit enregistrées disparaissent.
 *
 *   1. le pull de connexion partait EN MÊME TEMPS que la file : `hydrate`
 *      remplaçait le store par l'état du serveur, qui ne connaissait pas
 *      encore ce qui attendait — et l'écriture suivante sur la même entité,
 *      construite sur cet état, remplaçait dans la file celle qui attendait ;
 *   2. un démarrage hors ligne laissait « Synchro : Failed to fetch » pour
 *      toute la session : le pull n'était jamais relancé au retour du réseau ;
 *   3. une déconnexion SUBIE (jeton révoqué) jetait la file sans un mot.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { ToastProvider } from '@mister-guiiug/dev-pwa-config/react/toast';
import { useAppStore } from '../store/useAppStore';
import type { AppData } from '../store/types';

const auth = vi.hoisted(() => ({
  user: { id: 'u1', email: 'famille@exemple.fr' } as {
    id: string;
    email?: string;
  } | null,
}));

const { pullAll, upsertStatus } = vi.hoisted(() => ({
  pullAll: vi.fn(),
  upsertStatus: vi.fn(),
}));

vi.mock('./config', () => ({
  BACKEND: 'supabase',
  IS_SUPABASE: true,
  IS_LOCAL: false,
}));

vi.mock('@mister-guiiug/dev-pwa-config/react/auth-provider', () => ({
  useAuthContext: () => ({ user: auth.user }),
}));

// Un client quelconque : le dépôt, qui seul s'en sert, est remplacé.
vi.mock('./supabaseClient', () => ({ getSupabase: async () => ({}) }));

vi.mock('./repository', () => ({
  pullAll: (...args: unknown[]) => pullAll(...args),
  upsertStatus: (...args: unknown[]) => upsertStatus(...args),
  upsertSearch: vi.fn(),
  deleteSearchRemote: vi.fn(),
  addNoteRemote: vi.fn(),
  setNotificationRead: vi.fn(),
  addVerificationRemote: vi.fn(),
}));

const { SupabaseSync } = await import('./SupabaseSync');

const QUEUE_KEY = 'miss-lookhouse-syncq-v1';
const DEAD_KEY = 'miss-lookhouse-syncq-dead-v1';

function donnees(statut: 'visitee' | 'interessante'): AppData {
  return {
    searches: [],
    listings: [],
    notifications: [],
    similarities: [],
    statuses: { l1: { status: statut, tags: [] } },
    notes: {},
    verifications: {},
  };
}

/** Une écriture laissée en file par la session précédente (format du socle). */
function laisserEnFile(n = 1) {
  localStorage.setItem(
    QUEUE_KEY,
    JSON.stringify(
      Array.from({ length: n }, (_, i) => ({
        id: `q${i}`,
        payload: {
          kind: 'upsertStatus',
          listingId: `l${i + 1}`,
          entry: { status: 'visitee', tags: [] },
        },
        key: `upsertStatus:l${i + 1}`,
        attempts: 0,
        enqueuedAt: '2026-11-05T08:00:00.000Z',
      }))
    )
  );
}

const statutAffiche = () => useAppStore.getState().data.statuses.l1?.status;
const enFile = () =>
  (JSON.parse(localStorage.getItem(QUEUE_KEY) ?? '[]') as unknown[]).length;

let onLineOriginal: PropertyDescriptor | undefined;
function reseau(enLigne: boolean) {
  Object.defineProperty(navigator, 'onLine', {
    configurable: true,
    get: () => enLigne,
  });
}

function monter() {
  return render(
    <ToastProvider>
      <SupabaseSync />
    </ToastProvider>
  );
}

/** Laisse filer les promesses en cours (client, drain, pull). */
async function laisserFiler() {
  await act(async () => {
    for (let i = 0; i < 10; i++) await Promise.resolve();
  });
}

beforeEach(() => {
  localStorage.clear();
  onLineOriginal ??= Object.getOwnPropertyDescriptor(
    Navigator.prototype,
    'onLine'
  );
  reseau(true);
  auth.user = { id: 'u1', email: 'famille@exemple.fr' };
  pullAll.mockReset();
  upsertStatus.mockReset();
  upsertStatus.mockResolvedValue(undefined);
  // Ce que l'appareil montre : le statut changé hors ligne, pas encore parti.
  useAppStore.setState({ ready: true, data: donnees('visitee') });
});

afterEach(() => {
  cleanup();
  localStorage.clear();
  if (onLineOriginal)
    Object.defineProperty(navigator, 'onLine', onLineOriginal);
});

describe('la file d’abord, le pull ensuite', () => {
  it('à la connexion, ce qui attend part AVANT la lecture du serveur', async () => {
    laisserEnFile();
    pullAll.mockResolvedValue(donnees('visitee'));
    monter();

    await waitFor(() => expect(pullAll).toHaveBeenCalledTimes(1));
    expect(upsertStatus).toHaveBeenCalledTimes(1);
    expect(upsertStatus.mock.invocationCallOrder[0]).toBeLessThan(
      pullAll.mock.invocationCallOrder[0]!
    );
  });

  it('hors ligne, une file non vide : pas de pull, l’écran garde la modification', async () => {
    reseau(false);
    laisserEnFile();
    pullAll.mockResolvedValue(donnees('interessante'));
    monter();

    await laisserFiler();

    expect(pullAll).not.toHaveBeenCalled();
    expect(statutAffiche()).toBe('visitee');
    expect(enFile()).toBe(1);
  });

  it('une écriture PENDANT la lecture : la réponse périmée n’écrase rien, on relit', async () => {
    let repondre!: (data: AppData) => void;
    pullAll
      .mockReturnValueOnce(
        new Promise<AppData>(resolve => {
          repondre = resolve;
        })
      )
      .mockResolvedValue(donnees('visitee'));
    useAppStore.setState({ data: donnees('interessante') });
    monter();
    await waitFor(() => expect(pullAll).toHaveBeenCalledTimes(1));

    // La personne change le statut pendant que le serveur répond.
    act(() => useAppStore.getState().setStatus('l1', 'visitee'));
    await waitFor(() => expect(upsertStatus).toHaveBeenCalledTimes(1));
    // …et la réponse, partie avant, arrive après.
    await act(async () => repondre(donnees('interessante')));

    await waitFor(() => expect(pullAll).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(statutAffiche()).toBe('visitee'));
  });
});

describe('un démarrage hors ligne n’est pas définitif', () => {
  it('le pull échoué repart au retour du réseau', async () => {
    reseau(false);
    pullAll
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValue(donnees('interessante'));
    monter();

    expect(await screen.findByText(/Failed to fetch/)).toBeInTheDocument();

    reseau(true);
    act(() => {
      window.dispatchEvent(new Event('online'));
    });

    // Le répit du socle (1,5 s) passe avant la relance.
    await waitFor(() => expect(pullAll).toHaveBeenCalledTimes(2), {
      timeout: 3000,
    });
    await waitFor(() => expect(statutAffiche()).toBe('interessante'));
    expect(screen.queryByText(/Failed to fetch/)).toBeNull();
  });
});

describe('une déconnexion subie', () => {
  it('purge la file quand même, et dit combien d’écritures sont parties', async () => {
    reseau(false);
    laisserEnFile(2);
    localStorage.setItem(DEAD_KEY, JSON.stringify([]));
    pullAll.mockResolvedValue(donnees('visitee'));
    const { rerender } = monter();
    await laisserFiler();

    // Jeton révoqué : l'utilisateur disparaît sans que personne l'ait demandé.
    auth.user = null;
    rerender(
      <ToastProvider>
        <SupabaseSync />
      </ToastProvider>
    );

    expect(
      await screen.findByText(/2 modification\(s\) non envoyée\(s\)/)
    ).toBeInTheDocument();
    expect(enFile()).toBe(0);
  });
});
