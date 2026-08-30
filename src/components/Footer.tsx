import { AppFooter } from '@mister-guiiug/dev-wpa-config/react/app-footer';
import { REPO_URL, SPONSOR_URL } from '../links';

/**
 * Pied de page : liens famille (code source + soutien) délégués au socle
 * (`react/app-footer` — icônes GitHub/café intégrées, liens externes
 * sécurisés, cible tactile), plus la devise « collecte responsable » propre à
 * l'app, que le composant partagé ne couvre pas.
 */
export function Footer() {
  return (
    <div className="footer">
      <AppFooter
        repoUrl={REPO_URL}
        sponsorUrl={SPONSOR_URL}
        sourceLabel="Code source"
        sponsorLabel="Soutenir"
      />
      <div style={{ marginTop: '0.4rem' }}>
        Collecte responsable · données locales à votre appareil en mode démo.
      </div>
    </div>
  );
}
