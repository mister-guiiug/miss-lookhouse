/**
 * Pilotage des connecteurs du catalogue PARTAGÉ depuis l'écran Traitements.
 * Passe par l'Edge `connectors-admin` (verify_jwt + service_role) : tout
 * utilisateur authentifié peut activer/désactiver une source et fixer son
 * périmètre (départements). Le client ne possède aucun secret.
 */
import { getSupabase } from './supabaseClient';

export interface SharedConnector {
  id: string;
  sourceId: string;
  label: string;
  enabled: boolean;
  kind: string;
  /** Départements du périmètre (ex. ['63','03']) ; vide = national. */
  departments: string[];
}

export async function listSharedConnectors(): Promise<SharedConnector[]> {
  const s = getSupabase();
  if (!s) return [];
  const { data, error } = await s.functions.invoke<{
    connectors: SharedConnector[];
  }>('connectors-admin', { body: { action: 'list' } });
  if (error) throw new Error(error.message);
  return data?.connectors ?? [];
}

export async function updateSharedConnector(
  id: string,
  patch: { enabled?: boolean; departments?: string[] }
): Promise<void> {
  const s = getSupabase();
  if (!s) throw new Error('Pilotage indisponible (mode local).');
  const { error } = await s.functions.invoke('connectors-admin', {
    body: { action: 'update', id, ...patch },
  });
  if (error) throw new Error(error.message);
}
