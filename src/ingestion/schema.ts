/**
 * Validation STRICTE des entrées d'import (zod). Accepte un payload hétérogène
 * (JSON d'annonce) et le normalise en `CanonicalListing`. Toute donnée externe
 * passe par ici avant d'entrer dans le système.
 */
import { z } from 'zod';
import type { CanonicalListing } from '../domain/types';
import {
  fnv1aHex,
  normalizePropertyType,
  parseNumberFr,
} from '../domain/normalize';

/** Champ numérique tolérant : nombre, chaîne FR (« 245 000 € ») ou vide → null. */
const numberish = z
  .union([z.number(), z.string()])
  .nullish()
  .transform(v => parseNumberFr(v ?? null));

const stringish = z
  .union([z.string(), z.number()])
  .nullish()
  .transform(v => (v == null ? null : String(v).trim() || null));

/** Schéma d'une annonce importée (souple en entrée, strict en sortie). */
export const rawListingSchema = z
  .object({
    sourceId: z.string().min(1).optional(),
    source: z.string().min(1).optional(), // alias toléré
    externalId: stringish,
    id: stringish, // alias toléré pour externalId
    url: stringish,
    title: stringish,
    description: stringish,
    price: numberish,
    currency: z.string().optional(),
    surfaceM2: numberish,
    surface: numberish, // alias
    rooms: numberish,
    bedrooms: numberish,
    propertyType: stringish,
    type: stringish, // alias
    floor: stringish,
    dpe: stringish,
    charges: numberish,
    agencyFees: numberish,
    lat: numberish,
    lng: numberish,
    postalCode: stringish,
    city: stringish,
    isPro: z.boolean().nullish(),
    contactName: stringish,
    publishedAt: stringish,
    mediaUrls: z.array(z.string()).optional(),
    phashes: z.array(z.string()).optional(),
  })
  .transform((r): CanonicalListing => {
    const sourceId = r.sourceId ?? r.source ?? 'import_generique';
    const externalId = r.externalId ?? r.id ?? deriveExternalId(r.url);
    return {
      sourceId,
      externalId: externalId ?? fallbackId(r),
      url: r.url ?? null,
      title: r.title ?? null,
      description: r.description ?? null,
      price: toNum(r.price),
      currency: r.currency ?? 'EUR',
      surfaceM2: toNum(r.surfaceM2 ?? r.surface),
      rooms: toInt(r.rooms),
      bedrooms: toInt(r.bedrooms),
      propertyType: normalizePropertyType(r.propertyType ?? r.type),
      floor: r.floor ?? null,
      dpe: r.dpe ?? null,
      charges: toNum(r.charges),
      agencyFees: toNum(r.agencyFees),
      lat: toNum(r.lat),
      lng: toNum(r.lng),
      postalCode: r.postalCode ?? null,
      city: r.city ?? null,
      addressApprox: null,
      isPro: r.isPro ?? null,
      contactName: r.contactName ?? null,
      publishedAt: r.publishedAt ?? null,
      sourceUpdatedAt: null,
      mediaUrls: r.mediaUrls ?? [],
      phashes: r.phashes ?? [],
    };
  });

function toNum(v: number | null): number | null {
  return v == null || Number.isNaN(v) ? null : v;
}
function toInt(v: number | null): number | null {
  return v == null || Number.isNaN(v) ? null : Math.round(v);
}

/** Déduit un identifiant source depuis une URL (dernier segment numérique). */
export function deriveExternalId(
  url: string | null | undefined
): string | null {
  if (!url) return null;
  const m = url.match(/(\d{5,})/);
  if (m && m[1]) return m[1];
  try {
    const u = new URL(url);
    return `${u.hostname}${u.pathname}`.replace(/\/$/, '');
  } catch {
    return null;
  }
}

/**
 * Identifiant de secours STABLE : empreinte du contenu de l'annonce importée.
 * Deux imports identiques (sans id source) produisent le même externalId → pas
 * de doublon involontaire en base.
 */
function fallbackId(r: {
  title?: string | null;
  url?: string | null;
  price?: number | null;
}): string {
  return `imp-${fnv1aHex(`${r.title ?? ''}|${r.url ?? ''}|${r.price ?? ''}`)}`;
}

export interface ParseResult {
  listings: CanonicalListing[];
  errors: string[];
}

/** Parse + valide un tableau ou un objet d'annonces. */
export function parseListings(input: unknown): ParseResult {
  const arr = Array.isArray(input) ? input : [input];
  const listings: CanonicalListing[] = [];
  const errors: string[] = [];
  arr.forEach((item, i) => {
    const res = rawListingSchema.safeParse(item);
    if (res.success) {
      listings.push(res.data);
    } else {
      // Zod 4 : les détails sont dans `.issues` (pas `.errors`).
      const msg = res.error.issues
        .map(e => `${e.path.join('.')}: ${e.message}`)
        .join(', ');
      errors.push(`Annonce #${i + 1} invalide — ${msg}`);
    }
  });
  return { listings, errors };
}
