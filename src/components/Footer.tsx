import { AppFooter } from '@mister-guiiug/dev-pwa-config/react/app-footer';
import {
  SPONSOR_URL,
  repoUrl,
} from '@mister-guiiug/dev-pwa-config/apps-catalog';

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
        repoUrl={repoUrl('miss-lookhouse')}
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
