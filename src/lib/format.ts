/** Helpers de formatage (FR). */

const priceFmt = new Intl.NumberFormat('fr-FR', {
  style: 'currency',
  currency: 'EUR',
  maximumFractionDigits: 0,
});

export function formatPrice(n: number | null | undefined): string {
  return n == null ? '—' : priceFmt.format(n);
}

export function formatSurface(n: number | null | undefined): string {
  return n == null ? '—' : `${n} m²`;
}

export function formatRooms(rooms: number | null | undefined): string {
  return rooms == null ? '' : `${rooms} p.`;
}

export function pricePerM2(
  price: number | null | undefined,
  surface: number | null | undefined
): string {
  if (price == null || surface == null || surface <= 0) return '—';
  return `${Math.round(price / surface)} €/m²`;
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

export function timeAgo(iso: string | null | undefined): string {
  if (!iso) return '';
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const diffMs = Date.now() - then;
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "à l'instant";
  if (mins < 60) return `il y a ${mins} min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `il y a ${hours} h`;
  const days = Math.floor(hours / 24);
  return `il y a ${days} j`;
}

/** Horodatage courant, isolé ici pour garder les composants « purs » au lint. */
export function nowMs(): number {
  return Date.now();
}
