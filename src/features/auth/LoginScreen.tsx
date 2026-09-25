import { useState } from 'react';
import { Telescope } from 'lucide-react';
import { useActionGuard } from '@mister-guiiug/dev-pwa-config/react/use-action-guard';
import { usePageViews } from '@mister-guiiug/dev-pwa-config/react/use-page-views';
import { useAuthContext } from '@mister-guiiug/dev-pwa-config/react/auth-provider';
import { adresseDeRetour } from '../../auth';
import {
  MESSAGE_INSCRIPTION_SUR_INVITATION,
  messageErreurConnexion,
} from '../../auth/inscription';

type Mode = 'link' | 'signin' | 'signup';

/**
 * Connexion par e-mail (mode Supabase) : LE LIEN D'ABORD, LE MOT DE PASSE EN
 * OPTION.
 *
 * Un lien à usage unique arrive dans la boîte : rien à retenir, rien à voler,
 * rien à réinitialiser — et une adresse inconnue reçoit aussi son lien, c'est
 * l'inscription sans mot de passe. Le formulaire par mot de passe (connexion
 * et création de compte) reste à un clic, pour qui y tient. C'est la règle de
 * la famille depuis l'étape 5 d'AMELIORATIONS.md, et ce que deux applications
 * faisaient déjà.
 */
export function LoginScreen() {
  /*
   * L'ÉCRAN DE CONNEXION EST UNE VUE DE PAGE, et c'est ici qu'elle se déclare.
   *
   * `usePageViews` vit dans `Layout`, une route de `RoutedApp` — donc derrière
   * `AuthGate`. Hors session, il ne s'exécute jamais. Mesuré en production le
   * 16/09/2026, socle 4.20.0 en place : consentement accordé, bandeau parti,
   * ZÉRO vue. Sur une app à connexion, c'est l'essentiel du trafic qui ne
   * comptait pas.
   *
   * La vue est déclarée par l'écran plutôt que par une condition posée
   * au-dessus de la porte : une condition dupliquée finit par diverger de la
   * porte qu'elle imite.
   */
  usePageViews('/connexion');
  // Les actions du socle rendent `{ ok, error }`, jamais une exception ; le
  // message affiché reste celui de Supabase, tel quel, comme avant — sauf le
  // refus d'une inscription sur invitation (hook de 0018), dit en clair.
  const { signIn, signUp, signInWithOtp } = useAuthContext();
  const [mode, setMode] = useState<Mode>('link');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);

  /**
   * LA SEULE ACTION DE L'APP QU'IL FAUT REFUSER AVANT, ET NON APRÈS.
   *
   * Tout le reste est déjà armé : les six intentions du store passent par la
   * file persistante du socle (rejeu au retour du réseau), et les écritures
   * directes — connecteurs, partage, push, déclenchement de collecte —
   * attrapent toutes leur erreur et l'affichent. Aucune n'échoue en silence.
   *
   * La connexion, elle, n'a pas de file possible et pas de repli : sans
   * réseau, `signInWithPassword` revient avec un `Failed to fetch` que
   * l'écran affiche tel quel, APRÈS avoir fait saisir une adresse et un mot
   * de passe et attendre. Le dire avant coûte un clic de moins et une phrase
   * compréhensible de plus.
   */
  const guard = useActionGuard({ online: true });

  const login = async () => {
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      if (mode === 'link') {
        // Un lien à usage unique, par e-mail : l'application ne voit passer
        // aucun secret et n'en stocke aucun. La session arrivera par
        // `onAuthStateChange` quand le lien sera ouvert.
        const { error } = await signInWithOtp({
          email: email.trim(),
          emailRedirectTo: adresseDeRetour(),
        });
        // Une adresse inconnue passe par la création de compte : c'est ici
        // que le refus « sur invitation » arrive le plus souvent.
        if (error) setError(messageErreurConnexion(error));
        else setSentTo(email.trim());
      } else if (mode === 'signin') {
        const { error } = await signIn(email.trim(), password);
        if (error) setError(messageErreurConnexion(error));
      } else {
        // Confirmation e-mail activée sur le projet : aucune session n'est
        // renvoyée, et le socle le dit par `needsConfirmation`.
        const { error, needsConfirmation } = await signUp({
          email: email.trim(),
          password,
        });
        if (error) setError(messageErreurConnexion(error));
        else if (needsConfirmation)
          setInfo(
            'Compte créé. Vérifiez votre e-mail pour confirmer, puis connectez-vous.'
          );
      }
    } finally {
      setBusy(false);
    }
  };

  /**
   * `preventDefault` AVANT la garde : `wrap` rend la fonction inerte, et une
   * soumission inerte qui n'a pas annulé l'événement laisse le navigateur
   * recharger la page. La touche Entrée passe aussi par ici — ne garder que
   * le bouton laisserait la porte ouverte.
   */
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    void guard.wrap(login)();
  };

  const switchTo = (next: Mode) => {
    setMode(next);
    setError(null);
    setInfo(null);
  };

  const libelle =
    mode === 'link'
      ? 'Recevoir un lien de connexion'
      : mode === 'signin'
        ? 'Se connecter'
        : 'Créer un compte';

  return (
    <div className="app-shell">
      <main
        className="app-main"
        style={{ justifyContent: 'center', maxWidth: 420, margin: '0 auto' }}
      >
        <div style={{ textAlign: 'center', marginBottom: '0.5rem' }}>
          <Telescope size={40} color="var(--primary)" aria-hidden />
          <h1 style={{ margin: '0.4rem 0 0' }}>Miss LookHouse</h1>
          <p className="muted" style={{ fontSize: '0.85rem' }}>
            Veille immobilière responsable
          </p>
        </div>

        {sentTo ? (
          <div className="card">
            <h2 style={{ margin: '0 0 0.5rem' }}>Lien envoyé</h2>
            <p role="status" className="muted" style={{ fontSize: '0.9rem' }}>
              Un lien vient d’être envoyé à {sentTo}. Ouvrez-le depuis cet
              appareil : il vous ramènera ici, connecté·e. Il n’est valable
              qu’une fois.
            </p>
            <button
              type="button"
              className="btn"
              style={{ width: '100%', justifyContent: 'center' }}
              onClick={() => setSentTo(null)}
            >
              Recevoir un autre lien
            </button>
          </div>
        ) : (
          <form className="card" onSubmit={submit}>
            <div className="field">
              <label htmlFor="email">E-mail</label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
              />
            </div>
            {mode !== 'link' && (
              <div className="field">
                <label htmlFor="password">Mot de passe</label>
                <input
                  id="password"
                  type="password"
                  autoComplete={
                    mode === 'signin' ? 'current-password' : 'new-password'
                  }
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                  minLength={8}
                />
              </div>
            )}

            {error &&
              (error === MESSAGE_INSCRIPTION_SUR_INVITATION ? (
                // Trois lignes à lire, pas une pastille : un encadré.
                <p
                  role="alert"
                  style={{
                    margin: 0,
                    padding: '0.6rem 0.75rem',
                    border: '1px solid var(--danger)',
                    borderRadius: 'var(--radius)',
                    fontSize: '0.85rem',
                    lineHeight: 1.45,
                  }}
                >
                  {error}
                </p>
              ) : (
                <p
                  role="alert"
                  className="badge badge-danger"
                  style={{ width: '100%', justifyContent: 'center' }}
                >
                  {error}
                </p>
              ))}
            {info && (
              <p className="muted" style={{ fontSize: '0.85rem' }}>
                {info}
              </p>
            )}

            <button
              type="submit"
              className="btn btn-primary"
              disabled={busy || guard.disabled}
              style={{ width: '100%', justifyContent: 'center' }}
            >
              {busy ? '…' : libelle}
            </button>

            {mode === 'link' && (
              <p
                className="muted"
                style={{ fontSize: '0.85rem', textAlign: 'center' }}
              >
                Un lien à usage unique arrive dans votre boîte : aucun mot de
                passe à retenir, ni à voler. Pas encore de compte ? Le lien le
                crée.
              </p>
            )}

            {/* Le motif, sous le bouton qu'il explique : un bouton grisé sans
                explication est le même cul-de-sac, en plus poli. */}
            {guard.reason && (
              <p
                role="status"
                className="muted"
                style={{ fontSize: '0.85rem', textAlign: 'center' }}
              >
                {guard.reason}
              </p>
            )}

            <button
              type="button"
              className="btn"
              style={{
                width: '100%',
                justifyContent: 'center',
                marginTop: '0.5rem',
              }}
              onClick={() => switchTo(mode === 'link' ? 'signin' : 'link')}
            >
              {mode === 'link'
                ? 'Se connecter avec un mot de passe'
                : 'Recevoir un lien plutôt'}
            </button>
            {mode !== 'link' && (
              <button
                type="button"
                className="btn"
                style={{
                  width: '100%',
                  justifyContent: 'center',
                  marginTop: '0.5rem',
                }}
                onClick={() =>
                  switchTo(mode === 'signin' ? 'signup' : 'signin')
                }
              >
                {mode === 'signin'
                  ? 'Pas de compte ? S’inscrire'
                  : 'Déjà un compte ? Se connecter'}
              </button>
            )}
          </form>
        )}
      </main>
    </div>
  );
}
