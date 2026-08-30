/**
 * Formatage propre au métier de miss-lookhouse : un prix de bien, une surface,
 * un nombre de pièces, un prix au mètre carré.
 *
 * CE QUI N'EST PLUS ICI. Le rendu du NOMBRE et de la DATE passe par
 * `@mister-guiiug/dev-wpa-config/format`. Ce fichier construisait un
 * `Intl.NumberFormat('fr-FR', …)` au niveau module et appelait
 * `toLocaleDateString('fr-FR', …)` : trois littéraux `'fr-FR'` recopiés.
 *
 * L'app n'a PAS d'i18n : sa locale reste donc « fr-FR », exactement comme
 * avant. Ce qui change, c'est qu'elle n'est plus recopiée — un futur
 * `setDefaultLocale('en-GB')` suffirait désormais à faire suivre tout l'écran.
 *
 * CE QUI RESTE ICI, ET POURQUOI. Les cinq fonctions ci-dessous sont des règles
 * métier, sans équivalent au socle : le tiret d'absence, l'euro SANS centimes
 * (`formatCurrency` du socle n'accepte pas d'options `Intl`), le suffixe
 * « m² », l'abréviation « p. » des pièces, et le rapport prix/surface.
 */
import {
  formatDate as formatDateIntl,
  formatNumber,
  formatRelativeTime,
} from '@mister-guiiug/dev-wpa-config/format';

/**
 * Un prix de bien s'écrit sans centimes : « 249 000 € », pas « 249 000,00 € ».
 * `formatCurrency` du socle ne prend pas d'options `Intl`, d'où le passage par
 * `formatNumber` en style monétaire — même rendu, locale suivie.
 */
const PRICE: Intl.NumberFormatOptions = {
  style: 'currency',
  currency: 'EUR',
  maximumFractionDigits: 0,
};

export function formatPrice(n: number | null | undefined): string {
  return n == null ? '—' : formatNumber(n, undefined, PRICE);
}

export function formatSurface(n: number | null | undefined): string {
  return n == null ? '—' : `${formatNumber(n)} m²`;
}

export function formatRooms(rooms: number | null | undefined): string {
  return rooms == null ? '' : `${rooms} p.`;
}

export function pricePerM2(
  price: number | null | undefined,
  surface: number | null | undefined
): string {
  if (price == null || surface == null || surface <= 0) return '—';
  return `${formatNumber(Math.round(price / surface))} €/m²`;
}

/** Date courte d'un relevé : « 30 août 2026 ». */
export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return formatDateIntl(d, undefined, { day: '2-digit' });
}

/**
 * Ancienneté d'une annonce.
 *
 * La version précédente s'arrêtait aux JOURS : une annonce vue il y a deux ans
 * affichait « il y a 730 j ». `formatRelativeTime` monte jusqu'aux semaines,
 * mois et années, et dit « hier » plutôt que « il y a 1 j ».
 */
export function timeAgo(iso: string | null | undefined): string {
  if (!iso) return '';
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  return formatRelativeTime(then);
}

/** Horodatage courant, isolé ici pour garder les composants « purs » au lint. */
export function nowMs(): number {
  return Date.now();
}
