/**
 * Store applicatif (Zustand). En mode LOCAL, il exécute réellement le moteur
 * d'ingestion dans le navigateur (import → dédup → score → notifications), ce
 * qui rend la PWA pleinement démontrable sans backend.
 *
 * ⚠️ Sélecteurs : ne JAMAIS filter/map/sort DANS un sélecteur (réf. instable →
 * boucle useSyncExternalStore). Sélectionner une slice stable puis filtrer dans
 * le composant. Cf. mémoire « zustand-selecteurs-stables ».
 */
import { create } from 'zustand';
import type {
  AppData,
  LocalListing,
  LocalSearch,
  LocalVerification,
  UserStatus,
} from './types';
import type { SearchCriteria } from '../domain/types';
import { relevanceScore } from '../domain/scoring';
import { planIngestion } from '../ingestion/pipeline';
import type { ExistingListing } from '../ingestion/pipeline';
import { manualImportConnector } from '../ingestion/connectors/manualImport';
import { demoState } from '../demo/seed';
import { clearState, loadState, saveState } from './persistence';
import { makeId } from './ids';

type Theme = 'light' | 'dark';

interface AppState {
  ready: boolean;
  theme: Theme;
  data: AppData;
  init: () => void;
  setTheme: (t: Theme) => void;
  toggleTheme: () => void;
  importPayload: (
    payload: string,
    searchId?: string
  ) => Promise<{ added: number; updated: number; warnings: string[] }>;
  setStatus: (listingId: string, status: UserStatus) => void;
  toggleTag: (listingId: string, tag: string) => void;
  addNote: (listingId: string, body: string) => void;
  addVerification: (
    listingId: string,
    payload: {
      verified: boolean;
      confidence?: number | null;
      checklist?: Record<string, boolean>;
      anomalies?: string[];
      flaggedReason?: string | null;
    }
  ) => void;
  markNotificationRead: (id: string) => void;
  markAllRead: () => void;
  addSearch: (s: Omit<LocalSearch, 'id'>) => string;
  deleteSearch: (id: string) => void;
  runSearchNow: (id: string) => void;
  resetDemo: () => void;
}

function emptyData(): AppData {
  return {
    searches: [],
    listings: [],
    notifications: [],
    similarities: [],
    statuses: {},
    notes: {},
    verifications: {},
  };
}

function toCriteria(s: LocalSearch): SearchCriteria {
  return {
    priceMin: s.priceMin,
    priceMax: s.priceMax,
    surfaceMin: s.surfaceMin,
    surfaceMax: s.surfaceMax,
    roomsMin: s.roomsMin,
    roomsMax: s.roomsMax,
    propertyTypes: s.propertyTypes,
    keywordsRequired: s.keywordsRequired,
    keywordsExcluded: s.keywordsExcluded,
    centerLat: s.centerLat,
    centerLng: s.centerLng,
    radiusKm: s.radiusKm,
  };
}

function applyTheme(theme: Theme): void {
  if (typeof document === 'undefined') return;
  document.documentElement.setAttribute('data-theme', theme);
  const meta = document.getElementById('meta-theme-color');
  if (meta)
    meta.setAttribute('content', theme === 'dark' ? '#08201e' : '#0f766e');
  try {
    localStorage.setItem('lh_theme', theme);
  } catch {
    /* silencieux */
  }
}

function initialTheme(): Theme {
  try {
    const v = localStorage.getItem('lh_theme');
    if (v === 'light' || v === 'dark') return v;
    if (
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-color-scheme: dark)').matches
    ) {
      return 'dark';
    }
  } catch {
    /* silencieux */
  }
  return 'light';
}

export const useAppStore = create<AppState>()((set, get) => ({
  ready: false,
  theme: 'light',
  data: emptyData(),

  init: () => {
    if (get().ready) return;
    const persisted = loadState();
    const base = persisted ?? demoState();
    // Normalise les états persistés antérieurs à l'ajout des vérifications.
    const data: AppData = { ...base, verifications: base.verifications ?? {} };
    if (!persisted) saveState(data); // sème la démo au premier lancement
    const theme = initialTheme();
    applyTheme(theme);
    set({ ready: true, data, theme });
  },

  setTheme: t => {
    applyTheme(t);
    set({ theme: t });
  },
  toggleTheme: () => {
    const next: Theme = get().theme === 'dark' ? 'light' : 'dark';
    applyTheme(next);
    set({ theme: next });
  },

  importPayload: async (payload, searchId) => {
    const { data } = get();
    const res = await manualImportConnector.collect(
      { payload },
      { config: {}, now: Date.now() }
    );
    if (res.listings.length === 0) {
      return { added: 0, updated: 0, warnings: res.warnings };
    }

    const existing: ExistingListing[] = data.listings.map(l => ({
      id: l.id,
      sourceId: l.sourceId,
      externalId: l.externalId,
      fingerprint: l.fingerprint,
      price: l.price,
      sourceStatus: l.sourceStatus,
      title: l.title,
      description: l.description,
      surfaceM2: l.surfaceM2,
      rooms: l.rooms,
      propertyType: l.propertyType,
      lat: l.lat,
      lng: l.lng,
      contactName: l.contactName,
      phashes: l.phashes,
      disappeared: l.disappeared,
    }));

    const search = searchId
      ? data.searches.find(s => s.id === searchId)
      : undefined;
    const criteria = search ? toCriteria(search) : undefined;
    const plan = planIngestion(res.listings, existing, {
      criteria,
      minRelevance: 50,
    });

    const now = new Date().toISOString();
    const listings = [...data.listings];
    const indexByKey = new Map<string, number>();
    listings.forEach((l, i) =>
      indexByKey.set(`${l.sourceId}:${l.externalId}`, i)
    );

    let added = 0;
    let updated = 0;
    for (const up of plan.upserts) {
      if (up.kind === 'insert') {
        const c = up.canonical;
        const rel = criteria ? relevanceScore(c, criteria).score : undefined;
        const newListing: LocalListing = {
          ...c,
          id: makeId('lst'),
          firstSeenAt: now,
          lastSeenAt: now,
          lastChangedAt: now,
          sourceStatus: 'active',
          fingerprint: up.fingerprint,
          relevanceScore: rel,
          priceHistory:
            c.price != null ? [{ observedAt: now, price: c.price }] : [],
        };
        listings.push(newListing);
        indexByKey.set(up.key, listings.length - 1);
        added++;
      } else {
        const idx = indexByKey.get(up.key);
        if (idx === undefined) continue;
        const prev = listings[idx];
        if (!prev) continue;
        const newPrice = up.canonical.price;
        const priceChanged = newPrice != null && newPrice !== prev.price;
        listings[idx] = {
          ...prev,
          ...up.canonical,
          id: prev.id,
          firstSeenAt: prev.firstSeenAt,
          lastSeenAt: now,
          lastChangedAt:
            up.fingerprint !== prev.fingerprint ? now : prev.lastChangedAt,
          fingerprint: up.fingerprint,
          relevanceScore: criteria
            ? relevanceScore(up.canonical, criteria).score
            : prev.relevanceScore,
          priceHistory:
            priceChanged && newPrice != null
              ? [...prev.priceHistory, { observedAt: now, price: newPrice }]
              : prev.priceHistory,
        };
        updated++;
      }
    }

    const notifications = [...data.notifications];
    for (const n of plan.notifications) {
      const idx = indexByKey.get(n.subjectKey);
      const listingId = idx !== undefined ? listings[idx]?.id : undefined;
      notifications.unshift({
        id: makeId('ntf'),
        type: n.type,
        title: n.title,
        body: n.body,
        listingId,
        createdAt: now,
        readAt: null,
      });
    }

    const similarities = [...data.similarities];
    for (const sim of plan.similarities) {
      const idx = indexByKey.get(sim.subjectKey);
      const aId = idx !== undefined ? listings[idx]?.id : undefined;
      if (!aId) continue;
      similarities.push({
        id: makeId('sim'),
        aId,
        bId: sim.withId,
        score: sim.score,
        bucket: sim.bucket,
      });
    }

    const nextData: AppData = {
      ...data,
      listings,
      notifications,
      similarities,
    };
    set({ data: nextData });
    saveState(nextData);
    return { added, updated, warnings: res.warnings };
  },

  addVerification: (listingId, payload) => {
    const { data } = get();
    const existing = data.verifications[listingId] ?? [];
    const entry: LocalVerification = {
      id: makeId('vrf'),
      verified: payload.verified,
      confidence: payload.confidence ?? null,
      checklist: payload.checklist ?? {},
      anomalies: payload.anomalies ?? [],
      flaggedReason: payload.flaggedReason ?? null,
      createdAt: new Date().toISOString(),
    };
    // Une vérification positive promeut le statut à « vérifiée » ; la présence
    // d'anomalies bascule en « suspecte » (sans écraser une qualification forte).
    const tags = data.statuses[listingId]?.tags ?? [];
    let statuses = data.statuses;
    if (payload.verified) {
      statuses = { ...statuses, [listingId]: { status: 'verifiee', tags } };
    } else if ((payload.anomalies?.length ?? 0) > 0) {
      statuses = { ...statuses, [listingId]: { status: 'suspecte', tags } };
    }
    const nextData: AppData = {
      ...data,
      verifications: {
        ...data.verifications,
        [listingId]: [entry, ...existing],
      },
      statuses,
    };
    set({ data: nextData });
    saveState(nextData);
  },

  setStatus: (listingId, status) => {
    const { data } = get();
    const prev = data.statuses[listingId];
    const nextData: AppData = {
      ...data,
      statuses: {
        ...data.statuses,
        [listingId]: { status, tags: prev?.tags ?? [] },
      },
    };
    set({ data: nextData });
    saveState(nextData);
  },

  toggleTag: (listingId, tag) => {
    const { data } = get();
    const prev = data.statuses[listingId] ?? {
      status: 'a_revoir' as UserStatus,
      tags: [],
    };
    const tags = prev.tags.includes(tag)
      ? prev.tags.filter(t => t !== tag)
      : [...prev.tags, tag];
    const nextData: AppData = {
      ...data,
      statuses: { ...data.statuses, [listingId]: { ...prev, tags } },
    };
    set({ data: nextData });
    saveState(nextData);
  },

  addNote: (listingId, body) => {
    const trimmed = body.trim();
    if (!trimmed) return;
    const { data } = get();
    const existing = data.notes[listingId] ?? [];
    const nextData: AppData = {
      ...data,
      notes: {
        ...data.notes,
        [listingId]: [
          {
            id: makeId('note'),
            body: trimmed,
            createdAt: new Date().toISOString(),
          },
          ...existing,
        ],
      },
    };
    set({ data: nextData });
    saveState(nextData);
  },

  markNotificationRead: id => {
    const { data } = get();
    const now = new Date().toISOString();
    const notifications = data.notifications.map(n =>
      n.id === id ? { ...n, readAt: n.readAt ?? now } : n
    );
    const nextData: AppData = { ...data, notifications };
    set({ data: nextData });
    saveState(nextData);
  },

  markAllRead: () => {
    const { data } = get();
    const now = new Date().toISOString();
    const notifications = data.notifications.map(n => ({
      ...n,
      readAt: n.readAt ?? now,
    }));
    const nextData: AppData = { ...data, notifications };
    set({ data: nextData });
    saveState(nextData);
  },

  addSearch: s => {
    const { data } = get();
    const id = makeId('srch');
    const nextData: AppData = {
      ...data,
      searches: [...data.searches, { ...s, id }],
    };
    set({ data: nextData });
    saveState(nextData);
    return id;
  },

  deleteSearch: id => {
    const { data } = get();
    const nextData: AppData = {
      ...data,
      searches: data.searches.filter(s => s.id !== id),
    };
    set({ data: nextData });
    saveState(nextData);
  },

  runSearchNow: id => {
    const { data } = get();
    const now = new Date().toISOString();
    const searches = data.searches.map(s =>
      s.id === id ? { ...s, lastRunAt: now } : s
    );
    const nextData: AppData = { ...data, searches };
    set({ data: nextData });
    saveState(nextData);
  },

  resetDemo: () => {
    clearState();
    const data = demoState();
    saveState(data);
    set({ data });
  },
}));
