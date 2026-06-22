/**
 * CRUD des connecteurs `authorized_api` (collecte automatique RESPONSABLE).
 * Disponible uniquement en mode Supabase ; la RLS restreint chaque connecteur à
 * son propriétaire (`user_id = auth.uid()`). Le serveur (`ingest-run`) consomme
 * `config` + `secret_ref` à chaque exécution horaire. Le client ne déclenche
 * jamais la collecte (gated par INGEST_TOKEN côté serveur).
 */
import { getSupabase } from './supabaseClient';

export interface ConnectorConfig {
  url: string;
  method?: string;
  listPath?: string;
  map?: Record<string, string>;
  headers?: Record<string, string>;
  authHeader?: string;
  authScheme?: string;
}

export interface Connector {
  id: string;
  sourceId: string;
  label: string;
  enabled: boolean;
  config: ConnectorConfig;
  secretRef: string | null;
}

export interface ConnectorInput {
  id?: string;
  sourceId: string;
  label: string;
  enabled: boolean;
  config: ConnectorConfig;
  secretRef: string | null;
}

interface Row {
  id: string;
  source_id: string;
  label: string;
  enabled: boolean;
  config: ConnectorConfig | null;
  secret_ref: string | null;
}

function toConnector(r: Row): Connector {
  return {
    id: r.id,
    sourceId: r.source_id,
    label: r.label,
    enabled: r.enabled,
    config: r.config ?? { url: '' },
    secretRef: r.secret_ref,
  };
}

export async function listConnectors(): Promise<Connector[]> {
  const s = getSupabase();
  if (!s) return [];
  const { data, error } = await s
    .from('source_connectors')
    .select('id, source_id, label, enabled, config, secret_ref')
    .eq('mode', 'authorized_api')
    .order('created_at', { ascending: true });
  if (error) throw new Error(error.message);
  return ((data ?? []) as Row[]).map(toConnector);
}

export async function saveConnector(input: ConnectorInput): Promise<void> {
  const s = getSupabase();
  if (!s) throw new Error('Mode local : connecteurs indisponibles.');
  const {
    data: { user },
  } = await s.auth.getUser();
  if (!user) throw new Error('Non connecté.');
  const row = {
    user_id: user.id,
    source_id: input.sourceId,
    label: input.label,
    enabled: input.enabled,
    mode: 'authorized_api',
    config: input.config,
    secret_ref: input.secretRef || null,
  };
  const res = input.id
    ? await s.from('source_connectors').update(row).eq('id', input.id)
    : await s.from('source_connectors').insert(row);
  if (res.error) throw new Error(res.error.message);
}

export async function setConnectorEnabled(
  id: string,
  enabled: boolean
): Promise<void> {
  const s = getSupabase();
  if (!s) return;
  const { error } = await s
    .from('source_connectors')
    .update({ enabled })
    .eq('id', id);
  if (error) throw new Error(error.message);
}

export async function deleteConnector(id: string): Promise<void> {
  const s = getSupabase();
  if (!s) return;
  const { error } = await s.from('source_connectors').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

export interface ConnectorTestSample {
  externalId: string;
  title?: string | null;
  price?: number | null;
  city?: string | null;
  surfaceM2?: number | null;
}
export interface ConnectorTestResult {
  count?: number;
  sample?: ConnectorTestSample[];
  errors?: string[];
  error?: string;
}

/** DRY-RUN d'une config de connecteur (fetch + map + normalise, sans écrire). */
export async function testConnector(
  config: ConnectorConfig & { secretRef?: string | null }
): Promise<ConnectorTestResult> {
  const s = getSupabase();
  if (!s) return { error: 'Mode local : test indisponible.' };
  const { data, error } = await s.functions.invoke<ConnectorTestResult>(
    'connector-test',
    { body: config }
  );
  if (error) return { error: error.message };
  return data ?? {};
}
