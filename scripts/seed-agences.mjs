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
