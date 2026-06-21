/**
 * Connecteur « URL de recherche sauvegardée » — NE FETCHE RIEN. On stocke un
 * lien profond vers la page de recherche du portail (configuré par
 * l'utilisateur) ; l'app l'ouvre dans le navigateur de l'utilisateur, qui peut
 * ensuite importer/capturer. Choix DÉLIBÉRÉ de collecte responsable : aucune
 * aspiration automatisée côté serveur.
 */
import type {
  ConnectorContext,
  ConnectorInput,
  ConnectorResult,
  SourceConnector,
} from './types';

export const savedSearchUrlConnector: SourceConnector = {
  id: 'saved-search-url',
  mode: 'saved_search_url',
  label: 'URL de recherche (ouverture seule)',
  async collect(
    _input: ConnectorInput,
    _ctx: ConnectorContext
  ): Promise<ConnectorResult> {
    return {
      listings: [],
      warnings: [
        "Ce mode n'aspire aucune donnée : il mémorise l'URL de recherche pour ouverture manuelle, puis import/capture par l'utilisateur.",
      ],
    };
  },
};

/**
 * Place-holder pour un futur connecteur `authorized_api` / `server_fetch` :
 * activé UNIQUEMENT si une API officielle / un flux autorisé existe pour la
 * source, avec respect du robots.txt, des CGU et d'un débit conservateur.
 * Laissé NON implémenté volontairement (pas de contournement).
 */
export const authorizedApiConnectorStub: SourceConnector = {
  id: 'authorized-api-stub',
  mode: 'authorized_api',
  label: 'API autorisée (à configurer)',
  async collect(): Promise<ConnectorResult> {
    return {
      listings: [],
      warnings: [
        'Connecteur API autorisée non configuré pour cette source. Aucune collecte effectuée.',
      ],
    };
  },
};
