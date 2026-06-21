/**
 * Connecteur d'IMPORT MANUEL — toujours disponible, zéro risque CGU.
 * L'utilisateur colle un JSON (objet ou tableau d'annonces), une URL d'annonce,
 * ou un payload capturé. On valide puis on normalise.
 */
import type {
  ConnectorContext,
  ConnectorInput,
  ConnectorResult,
  SourceConnector,
} from './types';
import { parseListings, deriveExternalId } from '../schema';
import type { CanonicalListing } from '../../domain/types';

function looksLikeUrl(s: string): boolean {
  return /^https?:\/\//i.test(s.trim());
}

function sourceFromHostname(host: string): string {
  const h = host.replace(/^www\./, '');
  if (h.includes('leboncoin')) return 'leboncoin';
  if (h.includes('seloger')) return 'seloger';
  if (h.includes('bienici')) return 'bienici';
  if (h.includes('pap.fr')) return 'pap';
  return 'import_generique';
}

/** Construit une annonce minimale depuis une simple URL. */
function listingFromUrl(url: string): CanonicalListing {
  let sourceId = 'import_generique';
  try {
    sourceId = sourceFromHostname(new URL(url).hostname);
  } catch {
    /* URL invalide : on garde la source générique */
  }
  return {
    sourceId,
    externalId: deriveExternalId(url) ?? url,
    url,
    currency: 'EUR',
    title: null,
    description: null,
    price: null,
    surfaceM2: null,
    rooms: null,
    bedrooms: null,
    propertyType: null,
    lat: null,
    lng: null,
    mediaUrls: [],
    phashes: [],
  };
}

export const manualImportConnector: SourceConnector = {
  id: 'manual-import',
  mode: 'manual_import',
  label: 'Import manuel (JSON / URL)',
  async collect(
    input: ConnectorInput,
    _ctx: ConnectorContext
  ): Promise<ConnectorResult> {
    const payload = (input.payload ?? '').trim();
    if (!payload) return { listings: [], warnings: ['Payload vide.'] };

    // Cas 1 : une simple URL d'annonce.
    if (
      looksLikeUrl(payload) &&
      !payload.startsWith('[') &&
      !payload.startsWith('{')
    ) {
      return { listings: [listingFromUrl(payload)], warnings: [] };
    }

    // Cas 2 : JSON (objet ou tableau).
    let json: unknown;
    try {
      json = JSON.parse(payload);
    } catch {
      return {
        listings: [],
        warnings: [
          'Format non reconnu : collez un JSON valide ou une URL d’annonce.',
        ],
      };
    }
    const { listings, errors } = parseListings(json);
    return { listings, warnings: errors };
  },
};
