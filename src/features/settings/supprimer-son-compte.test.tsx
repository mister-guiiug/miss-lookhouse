/**
 * SUPPRIMER SON COMPTE — ce que ces tests tiennent.
 *
 * L'effacement serveur lui-même est prouvé ailleurs, en SQL, sur une vraie
 * base : `supabase/tests/delete_my_account.test.sql` compte les lignes avant
 * et après. Ici on tient les quatre promesses de l'INTERFACE, celles qu'un
 * test SQL ne peut pas voir :
 *
 *   1. en mode local, la carte n'existe pas — il n'y a pas de compte ;
 *   2. le geste est DÉLIBÉRÉ : tant que l'adresse retapée ne correspond pas,
 *      le bouton reste inerte (une confirmation « OK » ne demanderait rien) ;
 *   3. réussir, c'est aussi ne rien laisser DERRIÈRE : miroir local vidé, file
 *      d'écritures en attente purgée, session fermée ;
 *   4. échouer, c'est le DIRE — et ne surtout pas déconnecter, ce qui ferait
 *      croire à une suppression qui n'a pas eu lieu.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from '@testing-library/react';
import { useAppStore } from '../../store/useAppStore';
import type { AppData } from '../../store/types';

const mode = vi.hoisted(() => ({ supabase: true }));
const auth = vi.hoisted(() => ({
  user: { id: 'u1', email: 'famille@exemple.fr' } as {
    id: string;
    email?: string;
  } | null,
}));

vi.mock('../../backend/config', () => ({
  get BACKEND() {
    return mode.supabase ? 'supabase' : 'local';
  },
  get IS_SUPABASE() {
    return mode.supabase;
  },
  get IS_LOCAL() {
    return !mode.supabase;
  },
}));

const signOut = vi.fn(() => Promise.resolve());
vi.mock('../../auth/useAuth', () => ({
  useAuth: () => ({
    ready: true,
    session: null,
    user: auth.user,
    signIn: vi.fn(),
    signUp: vi.fn(),
    signInWithLink: vi.fn(),
    signOut,
  }),
}));

const deleteMyAccount = vi.fn(() => Promise.resolve());
vi.mock('../../backend/account', () => ({
  deleteMyAccount: () => deleteMyAccount(),
}));

const { DangerZone } = await import('./DangerZone');

const QUEUE_KEY = 'miss-lookhouse-syncq-v1';

function emptyData(): AppData {
  return {
    searches: [
      {
        id: 'srch_1',
        name: 'Maison Clermont',
        sourceIds: [],
        propertyTypes: [],
        keywordsRequired: [],
        keywordsExcluded: [],
        frequency: 'hourly',
        active: true,
      },
    ],
    listings: [],
    notifications: [],
    similarities: [],
    statuses: {},
    notes: {},
    verifications: {},
  };
}

const openButton = () =>
  screen.getByRole('button', { name: 'Supprimer mon compte' });
const confirmButton = () =>
  screen.getByRole('button', { name: 'Supprimer définitivement' });
const retype = (value: string) =>
  fireEvent.change(screen.getByLabelText(/retapez votre adresse/), {
    target: { value },
  });

beforeEach(() => {
  mode.supabase = true;
  auth.user = { id: 'u1', email: 'famille@exemple.fr' };
  localStorage.clear();
  localStorage.setItem(QUEUE_KEY, JSON.stringify([{ id: 'sq_1' }]));
  useAppStore.setState({
    ready: true,
    pendingDeletions: [],
    data: emptyData(),
  });
});

afterEach(() => {
  cleanup();
  deleteMyAccount.mockClear();
  deleteMyAccount.mockImplementation(() => Promise.resolve());
  signOut.mockClear();
  localStorage.clear();
});

describe('la carte n’apparaît que là où il y a un compte', () => {
  it('en mode local, elle n’existe pas — et l’app reste entière', () => {
    mode.supabase = false;
    const { container } = render(<DangerZone />);
    expect(container).toBeEmptyDOMElement();
  });

  it('sans session, elle n’existe pas non plus', () => {
    auth.user = null;
    const { container } = render(<DangerZone />);
    expect(container).toBeEmptyDOMElement();
  });

  it('en mode compte, elle est là', () => {
    render(<DangerZone />);
    expect(
      screen.getByRole('heading', { name: 'Zone dangereuse' })
    ).toBeTruthy();
  });
});

describe('la confirmation demande un geste délibéré', () => {
  it('le champ n’apparaît qu’après avoir demandé la suppression', () => {
    render(<DangerZone />);
    expect(screen.queryByLabelText(/retapez votre adresse/)).toBeNull();
    fireEvent.click(openButton());
    expect(screen.getByLabelText(/retapez votre adresse/)).toBeTruthy();
  });

  it('tant que l’adresse ne correspond pas, le bouton reste inerte', () => {
    render(<DangerZone />);
    fireEvent.click(openButton());

    expect(confirmButton()).toBeDisabled();

    // Une adresse APPROCHANTE ne suffit pas : c'est tout l'intérêt du geste.
    retype('famille@exemple.f');
    expect(confirmButton()).toBeDisabled();

    fireEvent.click(confirmButton());
    expect(deleteMyAccount).not.toHaveBeenCalled();
  });

  it('l’adresse exacte l’active (casse et espaces pardonnés)', () => {
    render(<DangerZone />);
    fireEvent.click(openButton());
    retype('  Famille@Exemple.FR ');
    expect(confirmButton()).toBeEnabled();
  });
});

describe('quand la suppression aboutit', () => {
  it('n’en laisse rien : serveur appelé, miroir local vidé, file purgée, session fermée', async () => {
    render(<DangerZone />);
    fireEvent.click(openButton());
    retype('famille@exemple.fr');

    await act(async () => {
      fireEvent.click(confirmButton());
    });

    expect(deleteMyAccount).toHaveBeenCalledTimes(1);
    expect(useAppStore.getState().data.searches).toEqual([]);
    // La file d'écritures en attente pointait vers un compte qui n'existe
    // plus : la laisser, c'est garder des données personnelles sur l'appareil
    // et rejouer des envois voués à l'échec.
    expect(localStorage.getItem(QUEUE_KEY)).toBe('[]');
    expect(signOut).toHaveBeenCalledTimes(1);
  });
});

describe('quand elle échoue', () => {
  it('le dit, et ne déconnecte pas', async () => {
    deleteMyAccount.mockImplementation(() =>
      Promise.reject(new Error('permission denied for table users'))
    );
    render(<DangerZone />);
    fireEvent.click(openButton());
    retype('famille@exemple.fr');

    await act(async () => {
      fireEvent.click(confirmButton());
    });

    expect(screen.getByRole('alert')).toHaveTextContent(
      'permission denied for table users'
    );
    // Déconnecter ici ferait croire le compte effacé alors qu'il est intact.
    expect(signOut).not.toHaveBeenCalled();
    expect(useAppStore.getState().data.searches).toHaveLength(1);
  });
});

describe('hors ligne', () => {
  it('bloque le geste et dit pourquoi, au lieu de le laisser échouer', () => {
    render(<DangerZone />);

    // Hors de `act`, `useOnline` resterait périmé et le test passerait à vide.
    act(() => {
      window.dispatchEvent(new Event('offline'));
    });

    fireEvent.click(openButton());
    expect(screen.queryByLabelText(/retapez votre adresse/)).toBeNull();
    expect(screen.getByRole('status')).toHaveTextContent(
      'Indisponible hors ligne'
    );

    act(() => {
      window.dispatchEvent(new Event('online'));
    });
  });
});
