/**
 * Historisation : calcul des deltas entre versions et synthèse d'une série de
 * prix (pour le graphe d'évolution). Pur, sans I/O.
 */

export interface VersionSnapshot {
  price?: number | null;
  surfaceM2?: number | null;
  rooms?: number | null;
  bedrooms?: number | null;
  title?: string | null;
  description?: string | null;
  mediaCount?: number | null;
  sourceStatus?: string | null;
}

export interface FieldDelta<T> {
  from: T | null;
  to: T | null;
}

export interface VersionDelta {
  changed: boolean;
  price?: FieldDelta<number> & { pct: number | null };
  surfaceM2?: FieldDelta<number>;
  rooms?: FieldDelta<number>;
  bedrooms?: FieldDelta<number>;
  titleChanged?: boolean;
  descriptionChanged?: boolean;
  mediaCount?: FieldDelta<number>;
  statusChanged?: FieldDelta<string>;
}

function num(v: number | null | undefined): number | null {
  return v == null ? null : v;
}

/** Calcule le diff structuré entre deux versions consécutives. */
export function computeDelta(
  prev: VersionSnapshot,
  next: VersionSnapshot
): VersionDelta {
  const delta: VersionDelta = { changed: false };

  if (num(prev.price) !== num(next.price)) {
    const from = num(prev.price);
    const to = num(next.price);
    const pct =
      from && to ? Math.round(((to - from) / from) * 1000) / 10 : null;
    delta.price = { from, to, pct };
    delta.changed = true;
  }
  if (num(prev.surfaceM2) !== num(next.surfaceM2)) {
    delta.surfaceM2 = { from: num(prev.surfaceM2), to: num(next.surfaceM2) };
    delta.changed = true;
  }
  if (num(prev.rooms) !== num(next.rooms)) {
    delta.rooms = { from: num(prev.rooms), to: num(next.rooms) };
    delta.changed = true;
  }
  if (num(prev.bedrooms) !== num(next.bedrooms)) {
    delta.bedrooms = { from: num(prev.bedrooms), to: num(next.bedrooms) };
    delta.changed = true;
  }
  if ((prev.title ?? '') !== (next.title ?? '')) {
    delta.titleChanged = true;
    delta.changed = true;
  }
  if ((prev.description ?? '') !== (next.description ?? '')) {
    delta.descriptionChanged = true;
    delta.changed = true;
  }
  if (num(prev.mediaCount) !== num(next.mediaCount)) {
    delta.mediaCount = { from: num(prev.mediaCount), to: num(next.mediaCount) };
    delta.changed = true;
  }
  if ((prev.sourceStatus ?? '') !== (next.sourceStatus ?? '')) {
    delta.statusChanged = {
      from: prev.sourceStatus ?? null,
      to: next.sourceStatus ?? null,
    };
    delta.changed = true;
  }
  return delta;
}

export interface PricePoint {
  observedAt: string; // ISO
  price: number;
}

export interface PriceSummary {
  first: number | null;
  last: number | null;
  min: number | null;
  max: number | null;
  changePct: number | null;
  direction: 'up' | 'down' | 'flat';
  drops: number; // nombre de baisses successives
}

/** Synthèse d'une série de prix triée chronologiquement. */
export function summarizePriceSeries(points: PricePoint[]): PriceSummary {
  if (points.length === 0) {
    return {
      first: null,
      last: null,
      min: null,
      max: null,
      changePct: null,
      direction: 'flat',
      drops: 0,
    };
  }
  const sorted = [...points].sort((a, b) =>
    a.observedAt.localeCompare(b.observedAt)
  );
  const first = sorted[0]?.price ?? null;
  const last = sorted[sorted.length - 1]?.price ?? null;
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  let drops = 0;
  let prev: number | null = null;
  for (const p of sorted) {
    if (p.price < min) min = p.price;
    if (p.price > max) max = p.price;
    if (prev != null && p.price < prev) drops++;
    prev = p.price;
  }
  const changePct =
    first && last ? Math.round(((last - first) / first) * 1000) / 10 : null;
  const direction =
    changePct == null || changePct === 0
      ? 'flat'
      : changePct < 0
        ? 'down'
        : 'up';
  return {
    first,
    last,
    min: Number.isFinite(min) ? min : null,
    max: Number.isFinite(max) ? max : null,
    changePct,
    direction,
    drops,
  };
}
