/**
 * DEUX RÉGLAGES NEUFS — ce que ces tests tiennent.
 *
 *   1. « Similarité par embeddings » : désactivée par défaut ; en mode local,
 *      GRISÉE et expliquée (les vecteurs vivent sur le serveur) ; en mode
 *      compte, elle se retient sur l'appareil.
 *   2. « E-mail (à chaque alerte) » : un opt-in, lu puis écrit sur la ligne de
 *      l'utilisateur — jamais posé à sa place ; un échec se DIT et ne fait
 *      pas croire à un réglage qui n'a pas eu lieu.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from '@testing-library/react';

const mode = vi.hoisted(() => ({ supabase: true }));
const auth = vi.hoisted(() => ({
  user: { id: 'u1', email: 'famille@exemple.fr' } as {
    id: string;
    email?: string;
  } | null,
}));
const prefs = vi.hoisted(() => ({
  get: vi.fn((_userId: string) => Promise.resolve(false)),
  set: vi.fn((_userId: string, _on: boolean) => Promise.resolve()),
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

vi.mock('@mister-guiiug/dev-pwa-config/react/auth-provider', () => ({
  useAuthContext: () => ({ user: auth.user }),
}));

vi.mock('../../backend/notificationPreferences', () => ({
  getEmailOptIn: (userId: string) => prefs.get(userId),
  setEmailOptIn: (userId: string, on: boolean) => prefs.set(userId, on),
}));

const { EmbeddingToggle } = await import('./EmbeddingToggle');
const { EmailToggle } = await import('./EmailToggle');
const { useEmbeddingPreference, EMBEDDINGS_STORAGE_KEY } =
  await import('../similar/embeddingPreference');

beforeEach(() => {
  mode.supabase = true;
  auth.user = { id: 'u1', email: 'famille@exemple.fr' };
  localStorage.clear();
  useEmbeddingPreference.setState({ enabled: false });
});

afterEach(() => {
  cleanup();
  prefs.get.mockReset();
  prefs.get.mockImplementation(() => Promise.resolve(false));
  prefs.set.mockReset();
  prefs.set.mockImplementation(() => Promise.resolve());
});

const interrupteur = (nom: RegExp) => screen.getByRole('switch', { name: nom });

describe('Similarité par embeddings', () => {
  it('désactivée par défaut', () => {
    render(<EmbeddingToggle />);
    expect(interrupteur(/embeddings/)).toHaveAttribute('aria-checked', 'false');
  });

  it('en mode compte, elle s’active et se retient sur l’appareil', () => {
    render(<EmbeddingToggle />);
    fireEvent.click(interrupteur(/embeddings/));
    expect(interrupteur(/embeddings/)).toHaveAttribute('aria-checked', 'true');
    expect(localStorage.getItem(EMBEDDINGS_STORAGE_KEY)).toBe('on');

    fireEvent.click(interrupteur(/embeddings/));
    expect(localStorage.getItem(EMBEDDINGS_STORAGE_KEY)).toBe('off');
  });

  it('dit son poids et la limite du modèle', () => {
    render(<EmbeddingToggle />);
    const aide = screen.getByText(/poids de 0,2/);
    expect(aide).toHaveTextContent('gte-small');
    expect(aide).toHaveTextContent('anglais');
  });

  it('en mode local, grisée — et la raison est écrite', () => {
    mode.supabase = false;
    // Même choisie avant, elle ne s'affiche pas active là où elle ne peut rien.
    useEmbeddingPreference.setState({ enabled: true });
    render(<EmbeddingToggle />);
    const bouton = interrupteur(/embeddings/);
    // `aria-disabled`, pas `disabled` : atteignable au clavier, et expliquée.
    expect(bouton).toHaveAttribute('aria-disabled', 'true');
    expect(bouton).toHaveAttribute('aria-checked', 'false');
    expect(bouton).toHaveAccessibleDescription(
      /Indisponible en mode démo local/
    );

    fireEvent.click(bouton);
    expect(bouton).toHaveAttribute('aria-checked', 'false');
    expect(localStorage.getItem(EMBEDDINGS_STORAGE_KEY)).toBeNull();
  });
});

describe('Alertes par e-mail', () => {
  it('en mode local, le canal demande le backend', () => {
    mode.supabase = false;
    render(<EmailToggle />);
    expect(screen.getByText('backend requis')).toBeTruthy();
    expect(screen.queryByRole('switch')).toBeNull();
  });

  it('lit l’opt-in du compte, désactivé par défaut, et montre l’adresse', async () => {
    render(<EmailToggle />);
    await act(async () => {});
    expect(prefs.get).toHaveBeenCalledWith('u1');
    expect(interrupteur(/E-mail/)).toHaveAttribute('aria-checked', 'false');
    expect(screen.getByText(/famille@exemple\.fr/)).toBeTruthy();
  });

  it('s’abonne sur SA ligne, et l’affiche', async () => {
    render(<EmailToggle />);
    await act(async () => {});
    await act(async () => {
      fireEvent.click(interrupteur(/E-mail/));
    });
    expect(prefs.set).toHaveBeenCalledWith('u1', true);
    expect(interrupteur(/E-mail/)).toHaveAttribute('aria-checked', 'true');
  });

  it('un échec se dit, et l’interrupteur ne ment pas', async () => {
    prefs.set.mockImplementation(() =>
      Promise.reject(new Error('new row violates row-level security policy'))
    );
    render(<EmailToggle />);
    await act(async () => {});
    await act(async () => {
      fireEvent.click(interrupteur(/E-mail/));
    });
    expect(screen.getByRole('alert')).toHaveTextContent(
      'new row violates row-level security policy'
    );
    expect(interrupteur(/E-mail/)).toHaveAttribute('aria-checked', 'false');
  });
});
