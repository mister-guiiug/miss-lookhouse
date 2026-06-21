/**
 * Jeu de DÉMONSTRATION (mode local). Données 100 % FICTIVES — aucun bien réel,
 * aucune personne physique (conformité RGPD ; cf. mémoire « anonymiser-seed »).
 * Sert à présenter l'app sur GitHub Pages sans backend.
 */
import type { AppData, LocalListing } from '../store/types';

// Vignettes de DÉMO autoportantes (SVG en data-URI : pas de réseau, RGPD-safe).
function photo(label: string, color: string): string {
  const svg =
    `<svg xmlns='http://www.w3.org/2000/svg' width='480' height='360'>` +
    `<rect width='480' height='360' fill='${color}'/>` +
    `<text x='240' y='195' font-family='sans-serif' font-size='30' ` +
    `fill='white' text-anchor='middle'>${label}</text></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

function listing(
  p: Partial<LocalListing> & {
    id: string;
    sourceId: string;
    externalId: string;
  }
): LocalListing {
  return {
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
    firstSeenAt: '2026-06-12T08:00:00.000Z',
    lastSeenAt: '2026-06-21T08:00:00.000Z',
    lastChangedAt: '2026-06-20T08:00:00.000Z',
    sourceStatus: 'active',
    priceHistory: [],
    ...p,
  };
}

const L1 = listing({
  id: 'demo-l1',
  sourceId: 'leboncoin',
  externalId: '1001',
  url: 'https://www.leboncoin.fr/ventes_immobilieres/1001.htm',
  title: 'Appartement T3 lumineux — Lyon 7e',
  description:
    'Bel appartement traversant, cuisine équipée, balcon exposé sud, 3e étage avec ascenseur. Proche métro et commerces.',
  price: 235000,
  surfaceM2: 68,
  rooms: 3,
  bedrooms: 2,
  propertyType: 'appartement',
  floor: '3',
  dpe: 'D',
  charges: 120,
  lat: 45.7333,
  lng: 4.8422,
  postalCode: '69007',
  city: 'Lyon',
  isPro: true,
  contactName: 'Agence Démo Lyon',
  publishedAt: '2026-06-12T08:00:00.000Z',
  phashes: ['ffe7c3810000183c'],
  mediaUrls: [
    photo('Salon', '#0f766e'),
    photo('Cuisine', '#14b8a6'),
    photo('Balcon', '#15803d'),
    photo('Chambre', '#115e59'),
  ],
  relevanceScore: 88,
  clusterId: 'demo-c1',
  priceHistory: [
    { observedAt: '2026-06-12T08:00:00.000Z', price: 245000 },
    { observedAt: '2026-06-18T08:00:00.000Z', price: 240000 },
    { observedAt: '2026-06-20T08:00:00.000Z', price: 235000 },
  ],
});

const L2 = listing({
  id: 'demo-l2',
  sourceId: 'leboncoin',
  externalId: '2002',
  url: 'https://www.leboncoin.fr/ventes_immobilieres/2002.htm',
  title: 'T3 centre ville Lyon 7 — lumineux',
  description:
    'Appartement 3 pièces, balcon, cuisine équipée, ascenseur. Quartier recherché.',
  price: 243000,
  surfaceM2: 68,
  rooms: 3,
  bedrooms: 2,
  propertyType: 'appartement',
  dpe: 'D',
  lat: 45.7335,
  lng: 4.8425,
  postalCode: '69007',
  city: 'Lyon',
  isPro: true,
  contactName: 'Agence Démo Lyon',
  publishedAt: '2026-06-19T08:00:00.000Z',
  firstSeenAt: '2026-06-19T08:00:00.000Z',
  phashes: ['ffe7c3810000183d'],
  relevanceScore: 84,
  clusterId: 'demo-c1',
  priceHistory: [{ observedAt: '2026-06-19T08:00:00.000Z', price: 243000 }],
});

const L3 = listing({
  id: 'demo-l3',
  sourceId: 'pap',
  externalId: '3003',
  url: 'https://www.pap.fr/annonce/3003',
  title: 'Maison 5 pièces avec jardin — Villeurbanne',
  description: 'Maison familiale, 4 chambres, jardin 200 m², garage. Au calme.',
  price: 420000,
  surfaceM2: 120,
  rooms: 5,
  bedrooms: 4,
  propertyType: 'maison',
  dpe: 'C',
  lat: 45.7717,
  lng: 4.8902,
  postalCode: '69100',
  city: 'Villeurbanne',
  isPro: false,
  contactName: 'Particulier',
  publishedAt: '2026-06-20T08:00:00.000Z',
  firstSeenAt: '2026-06-20T08:00:00.000Z',
  phashes: ['0f1e2d3c4b5a6978'],
  mediaUrls: [
    photo('Façade', '#3b4cca'),
    photo('Jardin', '#15803d'),
    photo('Séjour', '#0f766e'),
  ],
  relevanceScore: 71,
  priceHistory: [{ observedAt: '2026-06-20T08:00:00.000Z', price: 420000 }],
});

const L4 = listing({
  id: 'demo-l4',
  sourceId: 'seloger',
  externalId: '4004',
  url: 'https://www.seloger.com/annonces/4004.htm',
  title: 'Studio meublé — Lyon 3e (prix incroyable)',
  description:
    'Studio 18 m². Loyer très bas, envoyez vos coordonnées pour visite rapide.',
  price: 89000,
  surfaceM2: 18,
  rooms: 1,
  bedrooms: 0,
  propertyType: 'appartement',
  lat: 45.758,
  lng: 4.84,
  postalCode: '69003',
  city: 'Lyon',
  isPro: true,
  contactName: 'Contact inconnu',
  publishedAt: '2026-06-21T06:00:00.000Z',
  firstSeenAt: '2026-06-21T06:00:00.000Z',
  phashes: ['a1b2c3d4e5f60718'],
  relevanceScore: 40,
  priceHistory: [{ observedAt: '2026-06-21T06:00:00.000Z', price: 89000 }],
});

export function demoState(): AppData {
  return {
    searches: [
      {
        id: 'demo-s1',
        name: 'T3/T4 Lyon presqu’île & 7e',
        sourceIds: ['leboncoin', 'seloger', 'pap'],
        city: 'Lyon',
        postalCode: '69007',
        centerLat: 45.7485,
        centerLng: 4.8467,
        radiusKm: 5,
        priceMin: 150000,
        priceMax: 280000,
        surfaceMin: 55,
        surfaceMax: 95,
        roomsMin: 3,
        roomsMax: 4,
        propertyTypes: ['appartement'],
        keywordsRequired: ['balcon'],
        keywordsExcluded: ['rez-de-chaussée'],
        frequency: 'hourly',
        active: true,
        lastRunAt: '2026-06-21T07:00:00.000Z',
      },
    ],
    listings: [L1, L2, L3, L4],
    similarities: [
      {
        id: 'demo-sim1',
        aId: 'demo-l1',
        bId: 'demo-l2',
        score: 91,
        bucket: 'doublon_exact',
      },
    ],
    notifications: [
      {
        id: 'demo-n1',
        type: 'price_drop',
        title: 'Baisse de prix',
        body: 'Appartement T3 lumineux — Lyon 7e : −2,1 % (−5 000 €)',
        listingId: 'demo-l1',
        createdAt: '2026-06-20T08:01:00.000Z',
        readAt: null,
      },
      {
        id: 'demo-n2',
        type: 'recycled',
        title: 'Annonce recyclée probable',
        body: 'Annonce quasi identique (91/100) republiée sous un autre identifiant.',
        listingId: 'demo-l2',
        createdAt: '2026-06-19T08:02:00.000Z',
        readAt: null,
      },
      {
        id: 'demo-n3',
        type: 'new_listing',
        title: 'Nouvelle annonce',
        body: 'Maison 5 pièces avec jardin — Villeurbanne — 420 000 €',
        listingId: 'demo-l3',
        createdAt: '2026-06-20T08:03:00.000Z',
        readAt: '2026-06-20T09:00:00.000Z',
      },
    ],
    statuses: {
      'demo-l3': { status: 'interessante', tags: ['jardin', 'famille'] },
      'demo-l4': { status: 'suspecte', tags: [] },
    },
    notes: {
      'demo-l1': [
        {
          id: 'demo-note1',
          body: 'Prix en baisse régulière — relancer l’agence si <230 k€.',
          createdAt: '2026-06-20T10:00:00.000Z',
        },
      ],
    },
    verifications: {
      'demo-l4': [
        {
          id: 'demo-vrf1',
          verified: false,
          confidence: 25,
          checklist: {
            'Prix cohérent vs marché': false,
            'Contact/agence vérifié': false,
          },
          anomalies: ['prix suspect', 'trompeuse'],
          flaggedReason:
            'Prix anormalement bas et demande de coordonnées avant visite — annonce probablement trompeuse.',
          createdAt: '2026-06-21T07:30:00.000Z',
        },
      ],
    },
  };
}
