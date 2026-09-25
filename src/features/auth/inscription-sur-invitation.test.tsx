/**
 * L'INSCRIPTION SUR INVITATION, À L'ÉCRAN — ce que ces tests tiennent.
 *
 * Le refus est décidé par le serveur (hook de 0018, éprouvé en SQL par
 * `supabase/tests/signup_policy.test.sql`). Ici, la promesse de l'écran : un
 * refus s'affiche comme une phrase qu'on comprend, pas comme une erreur
 * technique — par le lien de connexion (le cas courant : une adresse inconnue
 * passe par la création de compte) comme par l'inscription avec mot de passe.
 * Et rien d'autre ne change : les autres erreurs restent affichées telles que
 * Supabase les rend.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from '@testing-library/react';

const REFUS = {
  ok: false,
  error: { code: null, message: "L'inscription est sur invitation." },
};

const actions = vi.hoisted(() => ({
  signInWithOtp: vi.fn(),
  signIn: vi.fn(),
  signUp: vi.fn(),
}));

vi.mock('@mister-guiiug/dev-pwa-config/react/auth-provider', () => ({
  useAuthContext: () => ({
    status: 'signed-out',
    ready: true,
    signedIn: false,
    session: null,
    user: null,
    client: null,
    signIn: actions.signIn,
    signUp: actions.signUp,
    signInWithOtp: actions.signInWithOtp,
    signOut: vi.fn(),
  }),
}));

const { LoginScreen } = await import('./LoginScreen');

afterEach(() => {
  cleanup();
  actions.signInWithOtp.mockReset();
  actions.signIn.mockReset();
  actions.signUp.mockReset();
});

async function soumettre(nom: string) {
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: nom }));
  });
}

describe('un refus « sur invitation » se lit comme une phrase', () => {
  it('par le lien de connexion vers une adresse inconnue', async () => {
    actions.signInWithOtp.mockResolvedValue(REFUS);
    render(<LoginScreen />);
    fireEvent.change(screen.getByLabelText('E-mail'), {
      target: { value: 'inconnue@exemple.fr' },
    });

    await soumettre('Recevoir un lien de connexion');

    const alerte = screen.getByRole('alert');
    expect(alerte).toHaveTextContent('L’inscription est sur invitation');
    expect(alerte).toHaveTextContent('demandez une invitation');
    // Et surtout pas l'écran « Lien envoyé » : aucun lien n'est parti.
    expect(screen.queryByText('Lien envoyé')).toBeNull();
  });

  it('par l’inscription avec mot de passe', async () => {
    actions.signUp.mockResolvedValue({ ...REFUS, needsConfirmation: false });
    render(<LoginScreen />);
    fireEvent.click(
      screen.getByRole('button', { name: 'Se connecter avec un mot de passe' })
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Pas de compte ? S’inscrire' })
    );
    fireEvent.change(screen.getByLabelText('E-mail'), {
      target: { value: 'inconnue@exemple.fr' },
    });
    fireEvent.change(screen.getByLabelText('Mot de passe'), {
      target: { value: 'Motdepasse1' },
    });

    await soumettre('Créer un compte');

    expect(screen.getByRole('alert')).toHaveTextContent(
      'L’inscription est sur invitation'
    );
  });
});

describe('les autres erreurs ne changent pas', () => {
  it('restent affichées telles que Supabase les rend', async () => {
    actions.signInWithOtp.mockResolvedValue({
      ok: false,
      error: {
        code: 'over_email_send_rate_limit',
        message: 'Email rate limit exceeded',
      },
    });
    render(<LoginScreen />);
    fireEvent.change(screen.getByLabelText('E-mail'), {
      target: { value: 'famille@exemple.fr' },
    });

    await soumettre('Recevoir un lien de connexion');

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Email rate limit exceeded'
    );
  });
});
