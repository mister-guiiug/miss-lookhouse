import { useAppStore } from '../../store/useAppStore';
import { formatDate, timeAgo } from '../../lib/format';
import type { IngestionRun } from '../../store/types';

const TRIGGER_LABEL: Record<IngestionRun['trigger'], string> = {
  manual: 'Import manuel',
  capture: 'Capture navigateur',
  schedule: 'Collecte planifiée',
};

const STATUS_META: Record<
  IngestionRun['status'],
  { label: string; cls: string }
> = {
  success: { label: 'Succès', cls: 'badge-ok' },
  partial: { label: 'Partiel', cls: 'badge-warn' },
  error: { label: 'Échec', cls: 'badge-danger' },
};

/**
 * File d'attente / historique des traitements. Alimentée en local par chaque
 * import (le store journalise un run) ; en mode Supabase, les collectes
 * planifiées (`ingestion_runs`) s'y ajouteront.
 */
export function ProcessingScreen() {
  const runs = useAppStore(s => s.data.runs);
  const sorted = [...(runs ?? [])].sort((a, b) => b.at.localeCompare(a.at));

  return (
    <>
      <h2 className="section-title">Traitements / imports</h2>
      <p className="muted" style={{ fontSize: '0.84rem' }}>
        Historique des imports et collectes (le plus récent en premier).
      </p>

      {sorted.length === 0 ? (
        <div className="empty">
          Aucun traitement. Lancez un <strong>Import</strong> pour en créer un.
        </div>
      ) : (
        sorted.map(run => {
          const st = STATUS_META[run.status];
          return (
            <div key={run.id} className="card">
              <div className="row spread">
                <span className="h-title">
                  {TRIGGER_LABEL[run.trigger]}
                  {run.searchName ? ` · ${run.searchName}` : ''}
                </span>
                <span className={`badge ${st.cls}`}>{st.label}</span>
              </div>
              <div className="muted" style={{ fontSize: '0.78rem' }}>
                {timeAgo(run.at)} · {formatDate(run.at)}
              </div>
              <div className="row" style={{ marginTop: '0.4rem' }}>
                <span className="badge badge-ok">
                  +{run.stats.added} ajoutée(s)
                </span>
                <span className="badge badge-muted">
                  {run.stats.updated} mise(s) à jour
                </span>
                {run.stats.warnings > 0 && (
                  <span className="badge badge-warn">
                    {run.stats.warnings} avertissement(s)
                  </span>
                )}
              </div>
              {run.events.length > 0 && (
                <details style={{ marginTop: '0.4rem' }}>
                  <summary
                    className="muted"
                    style={{ fontSize: '0.8rem', cursor: 'pointer' }}
                  >
                    Détails ({run.events.length})
                  </summary>
                  <ul
                    className="muted"
                    style={{ fontSize: '0.8rem', marginBottom: 0 }}
                  >
                    {run.events.map((e, i) => (
                      <li key={i}>{e.message}</li>
                    ))}
                  </ul>
                </details>
              )}
            </div>
          );
        })
      )}
    </>
  );
}
