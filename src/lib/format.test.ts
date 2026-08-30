/**
 * Tests d'USAGE : ce que l'écran affiche, pas la mécanique d'`Intl` — celle-ci
 * est éprouvée chez le socle. Le dernier bloc vérifie ce que l'adoption rend
 * possible : l'app n'a pas d'i18n, mais son formatage n'est plus figé.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  getDefaultLocale,
  setDefaultLocale,
} from '@mister-guiiug/dev-wpa-config/format';
import {
  formatDate,
  formatPrice,
  formatRooms,
  formatSurface,
  pricePerM2,
  timeAgo,
} from './format';

const initial = getDefaultLocale();
afterEach(() => {
  setDefaultLocale(initial);
  vi.useRealTimers();
});

/** `Intl` sépare les milliers par une espace insécable, ordinaire ou étroite. */
const norm = (text: string) => text.replace(/\s/gu, ' ');

describe('formatPrice', () => {
  it('rend un prix de bien SANS centimes', () => {
    expect(norm(formatPrice(249000))).toBe('249 000 €');
    expect(norm(formatPrice(0))).toBe('0 €');
  });

  it('rend un tiret quand le prix manque', () => {
    expect(formatPrice(null)).toBe('—');
    expect(formatPrice(undefined)).toBe('—');
  });
});

describe('formatSurface / formatRooms / pricePerM2', () => {
  it('sépare désormais les milliers d’un grand terrain', () => {
    expect(norm(formatSurface(1200))).toBe('1 200 m²');
    expect(norm(formatSurface(78))).toBe('78 m²');
    expect(formatSurface(null)).toBe('—');
  });

  it('abrège les pièces, et n’affiche rien sans valeur', () => {
    expect(formatRooms(4)).toBe('4 p.');
    expect(formatRooms(null)).toBe('');
  });

  it('rapporte le prix à la surface, séparateur compris', () => {
    expect(norm(pricePerM2(250000, 20))).toBe('12 500 €/m²');
    expect(pricePerM2(250000, 0)).toBe('—');
    expect(pricePerM2(null, 80)).toBe('—');
  });
});

describe('formatDate', () => {
  it('rend une date courte à jour sur deux chiffres', () => {
    expect(formatDate('2026-08-05T12:00:00Z')).toBe('05 août 2026');
    expect(formatDate(null)).toBe('—');
    expect(formatDate('pas une date')).toBe('—');
  });
});

describe('timeAgo', () => {
  it('monte au-delà du jour — ce que la version précédente ne faisait pas', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-30T12:00:00Z'));

    expect(norm(timeAgo('2026-08-30T09:00:00Z'))).toBe('il y a 3 heures');
    // Avant : « il y a 1 j », puis « il y a 365 j » pour l'an dernier.
    expect(timeAgo('2026-08-29T12:00:00Z')).toBe('hier');
    expect(timeAgo('2025-08-30T12:00:00Z')).toBe('l’année dernière');
  });

  it('n’affiche rien sans date exploitable', () => {
    expect(timeAgo(null)).toBe('');
    expect(timeAgo('pas une date')).toBe('');
  });
});

describe('la locale n’est plus figée', () => {
  it('un seul appel à setDefaultLocale suffirait à basculer l’app', () => {
    // L'app n'a pas d'i18n : sa locale reste « fr-FR ». Ce test décrit ce que
    // l'adoption rend possible — trois littéraux `'fr-FR'` ont disparu.
    setDefaultLocale('en-GB');
    expect(norm(formatPrice(249000))).toBe('€249,000');
    expect(formatDate('2026-08-05T12:00:00Z')).toBe('05 Aug 2026');
  });
});
