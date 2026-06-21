/**
 * Lecture des collectes serveur (`ingestion_runs`) en mode Supabase, ramenées à
 * la forme `IngestionRun` du store pour un affichage uniforme avec les imports
 * locaux. RLS owner (chaque utilisateur ne voit que ses runs).
 */
import { getSupabase } from './supabaseClient';
import type { IngestionRun } from '../store/types';

interface RunRow {
  id: string;
  trigger: string;
  status: string;
  started_at: string | null;
  finished_at: string | null;
  created_at: string;
  stats: Record<string, number> | null;
}

function toRun(r: RunRow): IngestionRun {
  const stats = r.stats ?? {};
  const status: IngestionRun['status'] =
    r.status === 'success'
      ? 'success'
      : r.status === 'error'
        ? 'error'
        : 'partial'; // queued / running / partial
  return {
    id: r.id,
    at: r.finished_at ?? r.started_at ?? r.created_at,
    trigger: r.trigger === 'manual' ? 'manual' : 'schedule',
    status,
    stats: {
      added: stats.new ?? 0,
      updated: stats.updated ?? 0,
      warnings: stats.warnings ?? 0,
    },
    events: [],
  };
}

export async function fetchIngestionRuns(limit = 100): Promise<IngestionRun[]> {
  const s = getSupabase();
  if (!s) return [];
  const { data, error } = await s
    .from('ingestion_runs')
    .select('id, trigger, status, started_at, finished_at, created_at, stats')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return ((data ?? []) as RunRow[]).map(toRun);
}
