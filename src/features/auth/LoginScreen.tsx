import { useState } from 'react';
import { Telescope } from 'lucide-react';
import { useAuth } from '../../auth/useAuth';

/** Connexion / inscription par e-mail + mot de passe (mode Supabase). */
export function LoginScreen() {
  const { signIn, signUp } = useAuth();
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      if (mode === 'signin') {
        const { error } = await signIn(email.trim(), password);
        if (error) setError(error);
      } else {
        const { error, needsConfirmation } = await signUp(
          email.trim(),
          password
        );
        if (error) setError(error);
        else if (needsConfirmation)
          setInfo(
            'Compte créé. Vérifiez votre e-mail pour confirmer, puis connectez-vous.'
          );
      }
    } finally {
      setBusy(false);
    }
  };

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

          {error && (
            <p
              className="badge badge-danger"
              style={{ width: '100%', justifyContent: 'center' }}
            >
              {error}
            </p>
          )}
          {info && (
            <p className="muted" style={{ fontSize: '0.85rem' }}>
              {info}
            </p>
          )}

          <button
            type="submit"
            className="btn btn-primary"
            disabled={busy}
            style={{ width: '100%', justifyContent: 'center' }}
          >
            {busy
              ? '…'
              : mode === 'signin'
                ? 'Se connecter'
                : 'Créer un compte'}
          </button>

          <button
            type="button"
            className="btn"
            style={{
              width: '100%',
              justifyContent: 'center',
              marginTop: '0.5rem',
            }}
            onClick={() => {
              setMode(m => (m === 'signin' ? 'signup' : 'signin'));
              setError(null);
              setInfo(null);
            }}
          >
            {mode === 'signin'
              ? 'Pas de compte ? S’inscrire'
              : 'Déjà un compte ? Se connecter'}
          </button>
        </form>
      </main>
    </div>
  );
}
