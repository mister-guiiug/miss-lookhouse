// ╔══════════════════════════════════════════════════════════════════════╗
// ║ seed-agences — amorçage de la collecte « Agences 63 ».                 ║
// ║                                                                        ║
// ║ Crée (idempotent) : un utilisateur SYSTÈME propriétaire des annonces,  ║
// ║ une source `laurecavard`, une recherche surveillée « Agences 63 »       ║
// ║ (frequency=daily → due au prochain cron) et un `source_connector`       ║
// ║ `authorized_api` dont la config porte `kind: 'wordpress_rest'`.         ║
// ║ Le cron `ingest-run` collecte alors les annonces via le connecteur de   ║
// ║ site (cf. src/ingestion/sites).                                         ║
// ║                                                                        ║
// ║ Usage (clé SERVICE ROLE — JAMAIS commitée) :                           ║
// ║   SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… npm run seed:agences       ║
// ╚══════════════════════════════════════════════════════════════════════╝
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

const URL = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SYSTEM_EMAIL =
  process.env.COLLECTOR_EMAIL ?? 'collector@miss-lookhouse.test';

if (!URL || !KEY) {
  console.error('Définis SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY.');
  process.exit(1);
}

const admin = createClient(URL, KEY, { auth: { persistSession: false } });

/** Connecteurs de site « prêts » à amorcer. Étendre au fil des PR. */
const SOURCES = [
  {
    id: 'laurecavard',
    label: 'Laure Cavard Immobilier',
    homepage: 'https://laurecavardimmobilier.fr',
    config: {
      kind: 'wordpress_rest',
      baseUrl: 'https://laurecavardimmobilier.fr',
      postType: 'home-details',
      taxonomies: {
        propertyType: 'property-type',
        location: 'location',
        rooms: 'nombres-de-pieces',
        status: 'listing-status',
      },
      enrichDetail: true,
      maxListings: 60,
    },
  },
  {
    id: 'immobiliernova',
    label: 'Immo Nova',
    homepage: 'https://www.immobiliernova.com',
    config: {
      kind: 'sitemap_html',
      sitemapUrl: 'https://www.immobiliernova.com/sitemap.xml',
      detailUrlPattern: '/vente/[^/]+/[^/]+/[^/]+',
      maxListings: 60,
    },
  },
  {
    id: 'vosagents',
    label: 'Vos Agents',
    homepage: 'https://vosagents.fr',
    config: {
      kind: 'sitemap_html',
      sitemapUrl: 'https://vosagents.fr/sitemap.xml',
      detailUrlPattern: '/vente/[^/]+/[^/]+/[^/]+',
      maxListings: 60,
    },
  },
  {
    id: 'gti',
    label: 'GTI Immobilier',
    homepage: 'https://gti-immobilier.fr',
    config: {
      kind: 'sitemap_html',
      sitemapUrl: 'https://gti-immobilier.fr/sitemap.xml',
      detailUrlPattern: '/vente/[^/]+/[^/]+/[^/]+',
      maxListings: 60,
    },
  },
  {
    id: 'bsleimmo',
    label: 'BSL Immobilier',
    homepage: 'https://www.bsleimmo.com',
    config: {
      kind: 'netty',
      sitemapUrl: 'https://www.bsleimmo.com/sitemap.xml',
      detailUrlPattern: '/vente/[^,]+,V',
      maxListings: 60,
    },
  },
  {
    id: 'lesclesdechloe',
    label: 'Les Clés de Chloé',
    homepage: 'https://www.lesclesdechloe.fr',
    config: {
      kind: 'netty',
      sitemapUrl: 'https://www.lesclesdechloe.fr/sitemap.xml',
      detailUrlPattern: '/immobilier/.*vente.*_V',
      maxListings: 60,
    },
  },
  {
    id: 'squarehabitat',
    label: 'Square Habitat',
    homepage: 'https://www.squarehabitat.fr',
    config: {
      kind: 'jsonld_sitemap',
      sitemapUrl: 'https://www.squarehabitat.fr/sitemap-achat.xml',
      detailUrlPattern: '/annonces/biens/',
      baseUrl: 'https://www.squarehabitat.fr',
      maxPages: 20,
      maxListings: 60,
    },
  },
  {
    id: 'safti',
    label: 'SAFTI',
    homepage: 'https://www.safti.fr',
    config: {
      kind: 'sitemap_network',
      sitemapUrls: [
        'https://www.safti.fr/sitemaps/sitemap.annonce.maison.disponible.xml',
        'https://www.safti.fr/sitemaps/sitemap.annonce.appartement.disponible.xml',
        'https://www.safti.fr/sitemaps/sitemap.annonce.terrain.disponible.xml',
      ],
      detailUrlPattern: '/annonces/achat/[^/]+/[^/]+/[0-9]+',
      maxListings: 50,
    },
  },
  {
    id: 'eraimmobilier',
    label: 'ERA Immobilier',
    homepage: 'https://www.eraimmobilier.com',
    config: {
      kind: 'sitemap_html',
      sitemapUrl:
        'https://www.eraimmobilier.com/sitemap/sitemap_silo_achat_biens.xml',
      detailUrlPattern: '/annonces/[0-9]+$',
      maxListings: 50,
    },
  },
  {
    id: 'century21cournon',
    label: 'Century 21 Gervillie (Cournon)',
    homepage: 'https://www.century21-gi-cournon.com',
    config: {
      kind: 'sitemap_html',
      sitemapUrl:
        'https://www.century21-gi-cournon.com/sitemap-vente_detail.xml',
      detailUrlPattern: '/trouver_logement/detail/[0-9]+/?$',
      maxListings: 50,
    },
  },
  {
    id: 'laforet',
    label: 'Laforêt',
    homepage: 'https://www.laforet.com',
    config: {
      kind: 'sitemap_network',
      sitemapUrl: 'https://www.laforet.com/storage/sitemaps/produits.xml',
      detailUrlPattern:
        '/agence-immobiliere/[^/]+/acheter/[^/]+/[a-z0-9-]+-[0-9]+$',
      maxListings: 50,
    },
  },
  {
    id: 'iadfrance',
    label: 'IAD France',
    homepage: 'https://www.iadfrance.fr',
    config: {
      kind: 'jsonld_sitemap',
      sitemapUrl: 'https://www.iadfrance.fr/sitemap/fr/ads.xml',
      detailUrlPattern: '/annonce/[a-z0-9-]+/r[0-9]+$',
      maxListings: 50,
    },
  },
];

async function ensureSystemUser() {
  const { data, error } = await admin.auth.admin.listUsers({
    page: 1,
    perPage: 200,
  });
  if (error) throw new Error(`listUsers: ${error.message}`);
  const found = data.users.find(u => u.email === SYSTEM_EMAIL);
  if (found) return found.id;
  const created = await admin.auth.admin.createUser({
    email: SYSTEM_EMAIL,
    email_confirm: true,
    password: randomUUID() + randomUUID(),
  });
  if (created.error) throw new Error(`createUser: ${created.error.message}`);
  return created.data.user.id;
}

async function ensureSource(s) {
  const { error } = await admin.from('sources').upsert(
    {
      id: s.id,
      label: s.label,
      homepage_url: s.homepage,
      default_mode: 'authorized_api',
      server_fetch_allowed: true,
    },
    { onConflict: 'id' }
  );
  if (error) throw new Error(`source ${s.id}: ${error.message}`);
}

async function ensureSearch(userId, sourceIds) {
  const { data: existing } = await admin
    .from('saved_searches')
    .select('id')
    .eq('user_id', userId)
    .eq('name', 'Agences 63')
    .maybeSingle();
  if (existing?.id) return existing.id;
  const { data, error } = await admin
    .from('saved_searches')
    .insert({
      user_id: userId,
      name: 'Agences 63',
      source_ids: sourceIds,
      frequency: 'daily',
      active: true,
    })
    .select('id')
    .single();
  if (error) throw new Error(`saved_search: ${error.message}`);
  return data.id;
}

async function ensureConnector(userId, s) {
  const { data: existing } = await admin
    .from('source_connectors')
    .select('id')
    .eq('user_id', userId)
    .eq('source_id', s.id)
    .maybeSingle();
  if (existing?.id) {
    const { error } = await admin
      .from('source_connectors')
      .update({ enabled: true, mode: 'authorized_api', config: s.config })
      .eq('id', existing.id);
    if (error) throw new Error(`update connector ${s.id}: ${error.message}`);
    return existing.id;
  }
  const { data, error } = await admin
    .from('source_connectors')
    .insert({
      user_id: userId,
      source_id: s.id,
      label: s.label,
      enabled: true,
      mode: 'authorized_api',
      config: s.config,
    })
    .select('id')
    .single();
  if (error) throw new Error(`insert connector ${s.id}: ${error.message}`);
  return data.id;
}

async function main() {
  const userId = await ensureSystemUser();
  console.log(`Utilisateur système : ${SYSTEM_EMAIL} (${userId})`);
  for (const s of SOURCES) await ensureSource(s);
  const searchId = await ensureSearch(
    userId,
    SOURCES.map(s => s.id)
  );
  console.log(`Recherche « Agences 63 » : ${searchId}`);
  for (const s of SOURCES) {
    const id = await ensureConnector(userId, s);
    console.log(`Connecteur ${s.id} (${s.config.kind}) : ${id}`);
  }
  console.log(
    '\nAmorçage terminé. Le prochain cron ingest-run collectera les annonces.'
  );
}

main().catch(e => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
