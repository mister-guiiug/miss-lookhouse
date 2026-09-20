import { useTransition, type MouseEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Map as MapIcon } from 'lucide-react';
import { usePrefetch } from '@mister-guiiug/dev-pwa-config/react/use-prefetch';
import { chargeMapScreen } from './lazyMapScreen';

/**
 * LE SEUL CHEMIN VERS LA CARTE, ET IL RÉPONDAIT DANS LE VIDE.
 *
 * Deux défauts se cumulaient, aucun n'étant une lenteur anormale.
 *
 * 1. LE REPLI DE `Suspense` NE PEUT PAS PARAÎTRE SUR UN CLIC. `HashRouter`
 *    enveloppe tout changement d'URL dans `startTransition` — exactement comme
 *    `BrowserRouter`, même code — et React 19 garde alors délibérément l'écran
 *    déjà affiché plutôt que de le remplacer par un repli. Le
 *    « Chargement de la carte… » posé sur la route dans `App.tsx` ne se montre
 *    donc QUE sur un atterrissage direct sur `#/carte`. Cliquer depuis le
 *    tableau de bord ne produisait rien du tout.
 *
 * 2. ET IL Y A VRAIMENT DE QUOI ATTENDRE. Ouvrir la carte demande deux
 *    morceaux : `MapScreen` (1,5 ko compressés) et surtout **Leaflet, 43 ko**.
 *    Sur un téléphone, c'est de l'ordre de la seconde — passée sans qu'aucun
 *    pixel ne bouge.
 *
 * CE QUI EST FAIT, ET CE QUI NE L'EST PAS. On précharge à l'INTENTION —
 * survol, tabulation, doigt posé — et non à l'inactivité. C'est le socle qui
 * s'en charge (`react/use-prefetch`) : ses écouteurs sont passifs, ne lancent
 * le morceau qu'UNE fois, avalent l'échec — au clic, `lazy` redemandera le
 * morceau et c'est lui qui portera l'erreur, dans son propre `Suspense` — et
 * s'abstiennent quand le visiteur économise ses données ou navigue en 2G. Le
 * service worker précharge déjà Leaflet de son côté (il est dans son
 * manifeste) : doubler ce travail par une requête concurrente n'apporterait
 * rien et pourrait la gêner. L'intention, elle, donne de l'avance précisément
 * dans la fenêtre où le cache du service worker n'est pas encore rempli — la
 * première visite, celle où le défaut se voit.
 *
 * Et la navigation passe par NOTRE transition : `enCours` reste vrai tant que
 * les morceaux ne sont pas arrivés, ce que react-router n'expose pas hors d'un
 * routeur de données. C'est la seule information qui manquait pour répondre.
 */
export function MapLink() {
  const navigate = useNavigate();
  const [enCours, demarre] = useTransition();

  // Le socle déduplique sur l'IDENTITÉ du chargeur : `chargeMapScreen` est une
  // constante de module, jamais une fonction écrite en ligne ici.
  const { linkProps } = usePrefetch(chargeMapScreen);

  const versLaCarte = (e: MouseEvent<HTMLAnchorElement>) => {
    // On laisse le navigateur faire son travail quand le visiteur le lui
    // demande : nouvel onglet, nouvelle fenêtre, enregistrement de la cible.
    if (
      e.defaultPrevented ||
      e.button !== 0 ||
      e.metaKey ||
      e.ctrlKey ||
      e.shiftKey ||
      e.altKey
    ) {
      return;
    }
    e.preventDefault();
    demarre(() => navigate('/carte'));
  };

  return (
    <Link
      to="/carte"
      className="btn"
      style={{ justifyContent: 'center' }}
      {...linkProps}
      onClick={versLaCarte}
      aria-busy={enCours || undefined}
    >
      {/* Le libellé porte l'état, comme partout ailleurs dans cette
          application — « Chargement… » en toutes lettres, sans animation à
          inventer. Le bouton venant d'être actionné, il a le focus : le
          changement de libellé est annoncé. */}
      <MapIcon size={16} aria-hidden />{' '}
      {enCours ? 'Chargement de la carte…' : 'Voir la carte'}
    </Link>
  );
}
