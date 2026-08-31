import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from '@testing-library/react';

/**
 * CE QUE CES TESTS TIENNENT, ET CE QU'ILS NE TIENNENT PAS.
 *
 * Miss LookHouse était déjà la mieux armée du parc : les six intentions du
 * store passent par la file persistante du socle, rejouées au retour du
 * réseau, et chaque écriture directe (connecteurs, partage, push, collecte)
 * attrape son erreur et l'affiche. RIEN n'échoue en silence — il n'y avait
 * donc rien à garder de ce côté-là.
 *
 * Ce qui manquait est plus simple, et plus gênant : personne ne disait
 * « hors ligne ». Le bandeau de synchro affiche « 3 en attente de
 * synchronisation… » que le réseau soit coupé ou que le serveur soit lent, et
 * l'écran de connexion — la seule action sans file ni repli — n'affichait
 * rien du tout avant d'échouer.
 *
 * Deux comportements d'usage sont donc éprouvés : le bandeau qui ne clignote
 * pas, et la connexion qui refuse d'aller au mur.
 */

const signIn = vi.fn(() => Promise.resolve({ error: null }));
vi.mock('./auth/useAuth', () => ({
  useAuth: () => ({
    ready: true,
    user: null,
    signIn,
    signUp: vi.fn(() =>
      Promise.resolve({ error: null, needsConfirmation: false })
    ),
    signOut: vi.fn(),
  }),
}));

const { OfflineBanner } = await import('./components/OfflineBanner');
const { offlineLabel } = await import('./components/offlineLabel');
const { LoginScreen } = await import('./features/auth/LoginScreen');

/** La coupure telle que le navigateur l'annonce. */
function goOffline() {
  act(() => {
    window.dispatchEvent(new Event('offline'));
  });
}
function goOnline() {
  act(() => {
    window.dispatchEvent(new Event('online'));
  });
}
function wait(ms: number) {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
}

const banner = () => document.querySelector('[data-dwc="connection-banner"]');

afterEach(() => {
  cleanup();
  signIn.mockClear();
});

describe('le shell dit qu’on est hors connexion — après un délai, pas avant', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('ne dit rien tant que la coupure n’a pas duré', () => {
    render(<OfflineBanner />);
    expect(banner()).toBeNull();

    goOffline();
    expect(banner()).toBeNull();

    wait(1499);
    expect(banner()).toBeNull();
  });

  it('ignore une micro-coupure : réseau revenu avant la fin du délai', () => {
    render(<OfflineBanner />);
    goOffline();
    wait(900);
    expect(banner()).toBeNull();

    goOnline();
    wait(5000);
    expect(banner()).toBeNull();
  });

  it('parle après la temporisation', () => {
    render(<OfflineBanner />);
    goOffline();
    wait(1500);

    const shown = banner();
    expect(shown).not.toBeNull();
    expect(shown).toHaveAttribute('role', 'status');
    expect(shown).toHaveTextContent(/^Hors ligne —/);
  });

  it('se tait dès le retour du réseau', () => {
    render(<OfflineBanner />);
    goOffline();
    wait(1500);
    expect(banner()).not.toBeNull();

    goOnline();
    expect(banner()).toBeNull();
  });
});

describe('le texte du bandeau ne promet que ce que le mode tient', () => {
  it('en Supabase, la file existe : l’envoi différé est une promesse EXACTE', () => {
    expect(offlineLabel(true)).toMatch(/partiront au retour du réseau/);
  });

  it('en local, il n’y a rien à envoyer : le promettre serait un mensonge', () => {
    expect(offlineLabel(false)).not.toMatch(/réseau/);
    expect(offlineLabel(false)).toMatch(/données de cet appareil/);
  });
});

describe('la connexion refuse de partir hors ligne, et dit pourquoi', () => {
  const submitButton = () =>
    screen.getByRole('button', { name: 'Se connecter' });

  function fill() {
    fireEvent.change(screen.getByLabelText('E-mail'), {
      target: { value: 'famille@exemple.fr' },
    });
    fireEvent.change(screen.getByLabelText('Mot de passe'), {
      target: { value: 'motdepasse1' },
    });
  }

  it('en ligne : la connexion part', () => {
    render(<LoginScreen />);
    fill();

    expect(submitButton()).toBeEnabled();
    fireEvent.click(submitButton());

    expect(signIn).toHaveBeenCalledWith('famille@exemple.fr', 'motdepasse1');
  });

  it('hors ligne : bouton désactivé ET motif affiché', () => {
    render(<LoginScreen />);
    fill();

    goOffline();

    expect(submitButton()).toBeDisabled();
    // Le libellé du paquet, pas une chaîne recopiée ici.
    expect(screen.getByRole('status')).toHaveTextContent(
      'Indisponible hors ligne'
    );
  });

  it('hors ligne : soumettre au clavier ne déclenche rien non plus', () => {
    const { container } = render(<LoginScreen />);
    fill();

    goOffline();

    // La touche Entrée soumet le formulaire sans passer par le bouton : c'est
    // le trou que `disabled` seul laisserait ouvert.
    fireEvent.submit(container.querySelector('form') as HTMLFormElement);

    expect(signIn).not.toHaveBeenCalled();
  });
});
