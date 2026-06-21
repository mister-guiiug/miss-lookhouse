/**
 * Agrégation PURE des traitements d'ingestion → métriques d'observabilité.
 * Indépendant de la source (journal local OU `ingestion_runs` serveur, déjà
 * ramenés à la forme `IngestionRun`). Aucune I/O, testable.
 */
import type { IngestionRun } from '../store/types';

export interface RunMetrics {
  total: number;
  success: number;
  partial: number;
  error: number;
  /** Taux de succès sur les runs finalisés (0..100), null si aucun. */
  successRate: number | null;
  totalAdded: number;
  totalUpdated: number;
  totalWarnings: number;
  lastAt: string | null;
}

export function aggregateRuns(runs: IngestionRun[]): RunMetrics {
  let success = 0;
  let partial = 0;
  let error = 0;
  let totalAdded = 0;
  let totalUpdated = 0;
  let totalWarnings = 0;
  let lastAt: string | null = null;

  for (const r of runs) {
    if (r.status === 'success') success++;
    else if (r.status === 'partial') partial++;
    else if (r.status === 'error') error++;
    totalAdded += r.stats.added ?? 0;
    totalUpdated += r.stats.updated ?? 0;
    totalWarnings += r.stats.warnings ?? 0;
    if (!lastAt || r.at > lastAt) lastAt = r.at;
  }

  const finalized = success + partial + error;
  return {
    total: runs.length,
    success,
    partial,
    error,
    successRate: finalized > 0 ? Math.round((success / finalized) * 100) : null,
    totalAdded,
    totalUpdated,
    totalWarnings,
    lastAt,
  };
}
