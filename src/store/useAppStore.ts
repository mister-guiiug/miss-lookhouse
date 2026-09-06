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
  IngestionRun,
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
import { emitSync } from '../backend/syncBus';
import { IS_SUPABASE } from '../backend/config';

// LE THÈME N'EST PLUS ICI. Il vit dans `ThemeProvider`
// (`@mister-guiiug/dev-pwa-config/react/theme-provider`), seul écrivain de
// `data-theme` et de la balise `theme-color`. La clé historique `lh_theme` est
// reprise par `legacyKeys` dans `App.tsx`, donc rien n'est perdu.
/**
 * Délai pendant lequel une suppression de recherche reste rattrapable.
 * Huit secondes : le temps de lire « supprimée » et de comprendre qu'on ne
 * voulait pas ça, sans laisser l'app dans un état indécis.
 */
export const UNDO_DELETE_MS = 8000;

/**
 * Les minuteries de suppression vivent au niveau du MODULE, pas d'un
 * composant : quitter l'écran « Recherches » ne doit ni annuler ni précipiter
 * une suppression en cours. Le store est le seul à les poser et à les lever.
 */
const undoTimers = new Map<string, ReturnType<typeof setTimeout>>();

function clearUndoTimer(id: string): void {
  const timer = undoTimers.get(id);
  if (timer !== undefined) {
    clearTimeout(timer);
    undoTimers.delete(id);
  }
}

function clearAllUndoTimers(): void {
  for (const timer of undoTimers.values()) clearTimeout(timer);
  undoTimers.clear();
}

/**
 * Ce que les écrans doivent montrer : le magasin MOINS les suppressions en
 * sursis.
 *
 * Fonction PURE, appelée dans le corps des composants — surtout pas dans un
 * sélecteur zustand : un `filter` y rendrait une référence neuve à chaque
 * appel, donc une boucle `useSyncExternalStore`. Les composants sélectionnent
 * `data.searches` et `pendingDeletions` séparément, puis appellent ceci.
 *
 * UN SEUL ENDROIT, parce que quatre écrans LISTENT les recherches :
 * « Recherches », la vue d'ensemble (le compteur), l'import (le sélecteur) et
 * la carte (les zones). Filtrer dans un seul d'entre eux laisserait une
 * recherche « supprimée » choisissable ailleurs pendant huit secondes — on
 * pourrait y rattacher un import qui partirait avec elle.
 *
 * L'écran d'ÉDITION n'est pas concerné : il ne liste rien, il résout un id
 * d'URL. On n'y arrive plus par la liste, et le masquer ferait passer une
 * modification pour une création.
 */
export function visibleSearches(
  searches: LocalSearch[],
  pendingDeletions: string[]
): LocalSearch[] {
  if (pendingDeletions.length === 0) return searches;
  return searches.filter(s => !pendingDeletions.includes(s.id));
}

interface AppState {
  ready: boolean;
  data: AppData;
  /**
   * Recherches supprimées mais pas encore définitivement : elles sont encore
   * dans `data.searches` (donc rien n'est perdu, ni localement ni sur le
   * serveur), simplement masquées par les écrans. Non persisté : une session
   * interrompue pendant le délai laisse la recherche intacte — le sens de la
   * panne va du bon côté.
   */
  pendingDeletions: string[];
  init: () => void;
  hydrate: (data: AppData) => void;
  wipeLocal: () => void;
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
  markNotificationUnread: (id: string) => void;
  markAllRead: () => void;
  addSearch: (s: Omit<LocalSearch, 'id'>) => string;
  updateSearch: (id: string, patch: Partial<Omit<LocalSearch, 'id'>>) => void;
  setSearchActive: (id: string, active: boolean) => void;
  /** Masque la recherche et arme le délai d'annulation. Rien n'est encore perdu. */
  deleteSearch: (id: string) => void;
  /** Rend la recherche, avec tous ses critères — c'est le même objet. */
  undoDeleteSearch: (id: string) => void;
  /** Le délai a filé : la suppression devient réelle, et part au serveur. */
  commitDeleteSearch: (id: string) => void;
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
    polygon: s.polygon,
  };
}

export const useAppStore = create<AppState>()((set, get) => ({
  ready: false,
  data: emptyData(),
  pendingDeletions: [],

  init: () => {
    if (get().ready) return;
    const persisted = loadState();
    // En mode Supabase, on démarre vide (données du serveur via SupabaseSync) ;
    // en local, on sème la démo au premier lancement.
    const base = persisted ?? (IS_SUPABASE ? emptyData() : demoState());
    // Normalise les états persistés antérieurs à l'ajout des vérifications.
    const data: AppData = { ...base, verifications: base.verifications ?? {} };
    if (!persisted) saveState(data);
    set({ ready: true, data });
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

    // Journalise le traitement (visible dans l'écran « Traitements »).
    const run: IngestionRun = {
      id: makeId('run'),
      at: now,
      trigger: 'manual',
      searchId: searchId ?? null,
      searchName: search?.name ?? null,
      status: res.warnings.length > 0 ? 'partial' : 'success',
      stats: { added, updated, warnings: res.warnings.length },
      events: res.warnings.map(m => ({ level: 'warn' as const, message: m })),
    };
    const nextData: AppData = {
      ...data,
      listings,
      notifications,
      similarities,
      runs: [run, ...(data.runs ?? [])].slice(0, 50),
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
    emitSync({ kind: 'addVerification', listingId, verification: entry });
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
    emitSync({
      kind: 'upsertStatus',
      listingId,
      entry: { status, tags: prev?.tags ?? [] },
    });
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
    emitSync({ kind: 'upsertStatus', listingId, entry: { ...prev, tags } });
  },

  addNote: (listingId, body) => {
    const trimmed = body.trim();
    if (!trimmed) return;
    const { data } = get();
    const existing = data.notes[listingId] ?? [];
    const note = {
      id: makeId('note'),
      body: trimmed,
      createdAt: new Date().toISOString(),
    };
    const nextData: AppData = {
      ...data,
      notes: { ...data.notes, [listingId]: [note, ...existing] },
    };
    set({ data: nextData });
    saveState(nextData);
    emitSync({ kind: 'addNote', listingId, note });
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
    emitSync({ kind: 'setNotificationRead', id, readAt: now });
  },

  markNotificationUnread: id => {
    const { data } = get();
    const notifications = data.notifications.map(n =>
      n.id === id ? { ...n, readAt: null } : n
    );
    const nextData: AppData = { ...data, notifications };
    set({ data: nextData });
    saveState(nextData);
    emitSync({ kind: 'setNotificationRead', id, readAt: null });
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
    for (const n of data.notifications) {
      if (!n.readAt)
        emitSync({ kind: 'setNotificationRead', id: n.id, readAt: now });
    }
  },

  addSearch: s => {
    const { data } = get();
    const id = makeId('srch');
    const search = { ...s, id };
    const nextData: AppData = {
      ...data,
      searches: [...data.searches, search],
    };
    set({ data: nextData });
    saveState(nextData);
    emitSync({ kind: 'upsertSearch', search });
    return id;
  },

  updateSearch: (id, patch) => {
    const { data } = get();
    let updated: LocalSearch | undefined;
    const searches = data.searches.map(s => {
      if (s.id !== id) return s;
      updated = { ...s, ...patch };
      return updated;
    });
    const nextData: AppData = { ...data, searches };
    set({ data: nextData });
    saveState(nextData);
    if (updated) emitSync({ kind: 'upsertSearch', search: updated });
  },

  setSearchActive: (id, active) => {
    const { data } = get();
    let updated: LocalSearch | undefined;
    const searches = data.searches.map(s => {
      if (s.id !== id) return s;
      updated = { ...s, active };
      return updated;
    });
    const nextData: AppData = { ...data, searches };
    set({ data: nextData });
    saveState(nextData);
    if (updated) emitSync({ kind: 'upsertSearch', search: updated });
  },

  /**
   * ANNULER PLUTÔT QUE CONFIRMER. Une `LocalSearch` porte des critères longs à
   * ressaisir — nom, sources, centre et rayon, polygone, fourchettes de prix,
   * de surface et de pièces, types de bien, mots-clés requis et exclus,
   * fréquence. Une boîte « êtes-vous sûr ? » demandait cet effort à CHAQUE
   * suppression pour n'éviter que la minorité d'erreurs ; huit secondes
   * d'annulation les rattrapent toutes et ne coûtent rien au geste voulu.
   *
   * RIEN N'EST ENFILÉ AVANT L'EXPIRATION, et c'est le point qui décide de tout
   * en mode compte. Enfiler l'intention tout de suite, puis la retirer à
   * l'annulation, ne marche que si la file n'a pas encore drainé — or en ligne
   * elle draine en quelques millisecondes. « Annuler » devrait alors RECRÉER la
   * recherche sur le serveur, c'est-à-dire empiler une mutation contraire :
   * exactement ce qu'on veut éviter. On diffère donc l'émission jusqu'au
   * commit, et l'annulation n'a plus rien à défaire.
   */
  deleteSearch: id => {
    const { data, pendingDeletions } = get();
    if (pendingDeletions.includes(id)) return;
    if (!data.searches.some(s => s.id === id)) return;
    set({ pendingDeletions: [...pendingDeletions, id] });
    clearUndoTimer(id);
    undoTimers.set(
      id,
      setTimeout(() => {
        get().commitDeleteSearch(id);
      }, UNDO_DELETE_MS)
    );
  },

  undoDeleteSearch: id => {
    clearUndoTimer(id);
    const { pendingDeletions } = get();
    if (!pendingDeletions.includes(id)) return;
    set({ pendingDeletions: pendingDeletions.filter(x => x !== id) });
  },

  commitDeleteSearch: id => {
    clearUndoTimer(id);
    const { data, pendingDeletions } = get();
    // Déjà annulée (ou déjà commitée) : ne rien faire. La minuterie et l'appel
    // explicite peuvent se croiser, le commit doit rester idempotent.
    if (!pendingDeletions.includes(id)) return;
    const nextData: AppData = {
      ...data,
      searches: data.searches.filter(s => s.id !== id),
    };
    set({
      data: nextData,
      pendingDeletions: pendingDeletions.filter(x => x !== id),
    });
    saveState(nextData);
    emitSync({ kind: 'deleteSearch', id });
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

  // Les suppressions en sursis portent sur des identifiants du jeu PRÉCÉDENT :
  // les garder au travers d'un remplacement de données masquerait une
  // recherche du serveur qui porterait le même id, ou attendrait un commit
  // sans objet. On repart de zéro à chaque hydratation.
  hydrate: data => {
    clearAllUndoTimers();
    set({ data, pendingDeletions: [] });
    saveState(data);
  },

  // Purge le miroir local (déconnexion / appareil partagé — RGPD).
  wipeLocal: () => {
    clearAllUndoTimers();
    clearState();
    set({ data: emptyData(), pendingDeletions: [] });
  },

  resetDemo: () => {
    clearAllUndoTimers();
    clearState();
    const data = demoState();
    saveState(data);
    set({ data, pendingDeletions: [] });
  },
}));
