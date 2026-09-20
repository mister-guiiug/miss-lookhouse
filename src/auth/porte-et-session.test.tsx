import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from '@testing-library/react';
import {
  AuthProvider,
  useAuthContext,
} from '@mister-guiiug/dev-pwa-config/react/auth-provider';

/**
 * LA COUCHE AUTH DU SOCLE, CÂBLÉE SUR CETTE APP — ce que ces tests tiennent.
 *
 * Le port, le fournisseur et la porte sont éprouvés dans le socle. Ici on
 * tient ce qui est à nous, et que personne ne testait quand c'était recopié
 * dans `useAuth.tsx` :
 *
 *   1. le SDK arrive APRÈS le montage (import à la demande), et la porte
 *      attend qu'il ait parlé avant de montrer quoi que ce soit ;
 *   2. avec une session, l'application — et l'utilisateur lisible par les
 *      écrans ; sans, l'écran de connexion ; se déconnecter la referme ;
 *   3. LE SILENCE DU RÉSEAU N'EST PAS UNE DÉCONNEXION : hors ligne, un
 *      évènement sans session n'éjecte personne tant que la session est encore
 *      écrite sur l'appareil — la garde que le socle n'a pas ;
 *   4. en mode local, tout passe sans qu'on demande le SDK ;
 *   5. le désabonnement fonctionne, que le SDK soit arrivé ou non.
 */

const mode = vi.hoisted(() => ({ supabase: true }));
const sdk = vi.hoisted(() => ({
  current: null as { auth: object } | null,
  demandes: 0,
}));

vi.mock('../backend/config', () => ({
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

vi.mock('../backend/supabaseClient', () => ({
  getSupabase: () => {
    sdk.demandes += 1;
    // Une microtâche plus tard, comme un import dynamique déjà en cache.
    return Promise.resolve(sdk.current);
  },
}));

vi.mock('../features/auth/LoginScreen', () => ({
  LoginScreen: () => <p>écran de connexion</p>,
}));

const { AuthGate } = await import('./AuthGate');
const { authAdapter } = await import('./index');

type Ecouteur = (event: string, session: unknown) => void;

const SESSION = {
  access_token: 'jeton',
  refresh_token: 'rafraichissement',
  expires_at: 1,
  user: { id: 'u1', email: 'famille@exemple.fr' },
};

/** Le nom de case que le SDK construit depuis l'URL du projet. */
const CASE = 'sb-abcdefgh-auth-token';

/** Le SDK tel que le port le voit : lecture de session, évènements, déconnexion. */
function fauxSdk(sessionInitiale: object | null) {
  const etat = { session: sessionInitiale };
  const ecouteurs = new Set<Ecouteur>();
  const desabonne = vi.fn();
  const emet = (event: string, session: unknown) => {
    for (const cb of ecouteurs) cb(event, session);
  };
  const auth = {
    getSession: vi.fn(() =>
      Promise.resolve({ data: { session: etat.session }, error: null })
    ),
    onAuthStateChange: vi.fn((cb: Ecouteur) => {
      ecouteurs.add(cb);
      return {
        data: {
          subscription: {
            unsubscribe: () => {
              desabonne();
              ecouteurs.delete(cb);
            },
          },
        },
      };
    }),
    // Comme le vrai : le stockage est vidé AVANT que `SIGNED_OUT` parte.
    signOut: vi.fn(() => {
      etat.session = null;
      localStorage.removeItem(CASE);
      emet('SIGNED_OUT', null);
      return Promise.resolve({ error: null });
    }),
  };
  return { client: { auth }, auth, desabonne, emet };
}

function Sonde() {
  const { user, signOut } = useAuthContext<unknown, { id: string }>();
  return (
    <>
      <p>{user ? `application de ${user.id}` : 'application sans compte'}</p>
      <button type="button" onClick={() => void signOut()}>
        quitter
      </button>
    </>
  );
}

function monter() {
  return render(
    <AuthProvider adapter={authAdapter()}>
      <AuthGate>
        <Sonde />
      </AuthGate>
    </AuthProvider>
  );
}

function adaptateurSupabase() {
  const adaptateur = authAdapter();
  if (!adaptateur) throw new Error('mode supabase attendu');
  return adaptateur;
}

function horsLigne() {
  Object.defineProperty(window.navigator, 'onLine', {
    configurable: true,
    get: () => false,
  });
}

/** Laisse passer le SDK (une microtâche) et ce que le port en déduit. */
async function laisserFaire() {
  await act(async () => {
    await new Promise(resolve => setTimeout(resolve, 0));
  });
}

beforeEach(() => {
  mode.supabase = true;
  sdk.current = null;
  sdk.demandes = 0;
  localStorage.clear();
});

afterEach(() => {
  cleanup();
  // Rend le `onLine` du prototype : la redéfinition ne vivait que sur l'instance.
  Reflect.deleteProperty(window.navigator, 'onLine');
});

describe('la porte attend le SDK, puis décide', () => {
  it('sans session : « Chargement… », puis l’écran de connexion', async () => {
    sdk.current = fauxSdk(null).client;
    monter();

    expect(screen.getByText('Chargement…')).toBeTruthy();
    expect(screen.queryByText('écran de connexion')).toBeNull();

    expect(await screen.findByText('écran de connexion')).toBeTruthy();
    expect(screen.queryByText(/application/)).toBeNull();
  });

  it('avec une session : l’application, et l’utilisateur lisible par les écrans', async () => {
    sdk.current = fauxSdk(SESSION).client;
    monter();

    expect(await screen.findByText('application de u1')).toBeTruthy();
    expect(screen.queryByText('écran de connexion')).toBeNull();
  });

  it('se déconnecter depuis un écran referme la porte', async () => {
    const faux = fauxSdk(SESSION);
    sdk.current = faux.client;
    monter();
    await screen.findByText('application de u1');

    fireEvent.click(screen.getByRole('button', { name: 'quitter' }));

    expect(await screen.findByText('écran de connexion')).toBeTruthy();
    expect(faux.auth.signOut).toHaveBeenCalledTimes(1);
  });
});

describe('le silence du réseau n’est pas une déconnexion', () => {
  it('en ligne, un évènement sans session ferme la porte', async () => {
    const faux = fauxSdk(SESSION);
    sdk.current = faux.client;
    localStorage.setItem(CASE, JSON.stringify(SESSION));
    monter();
    await screen.findByText('application de u1');

    act(() => faux.emet('SIGNED_OUT', null));

    expect(await screen.findByText('écran de connexion')).toBeTruthy();
  });

  it('hors ligne, tant que la session est encore sur l’appareil, personne n’est éjecté', async () => {
    const faux = fauxSdk(SESSION);
    sdk.current = faux.client;
    localStorage.setItem(CASE, JSON.stringify(SESSION));
    monter();
    await screen.findByText('application de u1');

    horsLigne();
    // Ce que la bibliothèque finit par émettre quand le renouvellement du
    // jeton n'aboutit pas : « pas de session », sans avoir rien effacé.
    act(() => faux.emet('SIGNED_OUT', null));
    await laisserFaire();

    expect(screen.getByText('application de u1')).toBeTruthy();
    expect(screen.queryByText('écran de connexion')).toBeNull();
  });

  it('hors ligne, une vraie déconnexion — stockage vidé d’abord — est honorée', async () => {
    const faux = fauxSdk(SESSION);
    sdk.current = faux.client;
    localStorage.setItem(CASE, JSON.stringify(SESSION));
    monter();
    await screen.findByText('application de u1');

    horsLigne();
    localStorage.removeItem(CASE);
    act(() => faux.emet('SIGNED_OUT', null));

    expect(await screen.findByText('écran de connexion')).toBeTruthy();
  });
});

describe('en mode local', () => {
  it('tout passe, et le SDK n’est jamais demandé', async () => {
    mode.supabase = false;
    monter();

    expect(screen.getByText('application sans compte')).toBeTruthy();
    await laisserFaire();
    expect(sdk.demandes).toBe(0);
  });
});

describe('le désabonnement ne dépend pas de l’arrivée du SDK', () => {
  it('demandé avant le SDK : aucun abonnement n’est posé', async () => {
    const faux = fauxSdk(null);
    sdk.current = faux.client;

    const off = adaptateurSupabase().onAuthStateChange(() => {});
    off();
    await laisserFaire();

    expect(faux.auth.onAuthStateChange).not.toHaveBeenCalled();
  });

  it('demandé après : l’abonnement réel est retiré', async () => {
    const faux = fauxSdk(null);
    sdk.current = faux.client;

    const off = adaptateurSupabase().onAuthStateChange(() => {});
    await laisserFaire();
    expect(faux.auth.onAuthStateChange).toHaveBeenCalledTimes(1);

    off();

    expect(faux.desabonne).toHaveBeenCalledTimes(1);
  });
});
