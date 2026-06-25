import { useCallback, useEffect, useState } from 'react';
import { useAppStore } from '../../store/useAppStore';
import { formatDate, timeAgo } from '../../lib/format';
import { IS_SUPABASE } from '../../backend/config';
import { fetchIngestionRuns } from '../../backend/ingestionRuns';
import { triggerIngestNow } from '../../backend/ingest';
import {
  listSharedConnectors,
  updateSharedConnector,
  type SharedConnector,
} from '../../backend/connectorsAdmin';
import { aggregateRuns } from '../../lib/runStats';
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

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ minWidth: 84 }}>
      <div className="price" style={{ fontSize: '1.3rem' }}>
        {value}
      </div>
      <div className="muted" style={{ fontSize: '0.74rem' }}>
        {label}
      </div>
    </div>
  );
}

/**
 * Traitements + observabilité. En local : journal des imports (`data.runs`).
 * En mode Supabase : on y ajoute les collectes planifiées (`ingestion_runs`).
 * Un encart de métriques agrège l'ensemble (taux de succès, volumes…).
 */
export function ProcessingScreen() {
  const localRuns = useAppStore(s => s.data.runs);
  const [serverRuns, setServerRuns] = useState<IngestionRun[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [connectors, setConnectors] = useState<SharedConnector[]>([]);
  const [savingCfg, setSavingCfg] = useState(false);

  const loadRuns = useCallback(() => {
    if (!IS_SUPABASE) return;
    fetchIngestionRuns()
      .then(setServerRuns)
      .catch(e => setErr(e instanceof Error ? e.message : String(e)));
  }, []);

  useEffect(() => {
    if (!IS_SUPABASE) return;
    loadRuns();
    listSharedConnectors()
      .then(setConnectors)
      .catch(e => setErr(e instanceof Error ? e.message : String(e)));
  }, [loadRuns]);

  function setConn(id: string, patch: Partial<SharedConnector>) {
    setConnectors(cs => cs.map(c => (c.id === id ? { ...c, ...patch } : c)));
  }

  async function saveConnectors() {
    setSavingCfg(true);
    setErr(null);
    setMsg(null);
    try {
      for (const c of connectors) {
        await updateSharedConnector(c.id, {
          enabled: c.enabled,
          departments: c.departments,
        });
      }
      setMsg('Connecteurs enregistrés.');
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setSavingCfg(false);
    }
  }

  async function refreshCatalog() {
    setBusy(true);
    setErr(null);
    setMsg(null);
    try {
      const res = await triggerIngestNow();
      const done = res.results.filter(r => r.status === 'ok').length;
      const skipped = res.results.filter(r => r.status === 'too-recent').length;
      setMsg(
        `Collecte lancée : ${done} recherche(s) traitée(s)` +
          (skipped ? `, ${skipped} ignorée(s) (trop récente)` : '') +
          '.'
      );
      loadRuns();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const all = [...(localRuns ?? []), ...serverRuns];
  const sorted = [...all].sort((a, b) => b.at.localeCompare(a.at));
  const m = aggregateRuns(all);

  return (
    <>
      <h2 className="section-title">Traitements / observabilité</h2>
      <p className="muted" style={{ fontSize: '0.84rem' }}>
        Historique des imports et collectes (le plus récent en premier).
      </p>

      {IS_SUPABASE && (
        <div className="card">
          <div className="h-title">Connecteurs du catalogue partagé</div>
          <p className="muted" style={{ fontSize: '0.82rem' }}>
            Activez les sources et limitez leur périmètre par département (ex. «
            63,03 » ; vide = national). La collecte alimente le catalogue
            commun, visible par tous.
          </p>
          {connectors.length === 0 ? (
            <div className="muted" style={{ fontSize: '0.82rem' }}>
              Aucun connecteur partagé (lancez le seed « Agences 63 »).
            </div>
          ) : (
            connectors.map(c => (
              <div
                key={c.id}
                className="row spread"
                style={{ gap: '0.6rem', margin: '0.3rem 0', flexWrap: 'wrap' }}
              >
                <label
                  className="row"
                  style={{ gap: '0.4rem', alignItems: 'center' }}
                >
                  <input
                    type="checkbox"
                    checked={c.enabled}
                    onChange={e => setConn(c.id, { enabled: e.target.checked })}
                  />
                  <span>
                    {c.label}{' '}
                    <span className="muted" style={{ fontSize: '0.74rem' }}>
                      ({c.kind})
                    </span>
                  </span>
                </label>
                <input
                  className="input"
                  placeholder="Départements (vide = national)"
                  value={c.departments.join(',')}
                  onChange={e =>
                    setConn(c.id, {
                      departments: e.target.value
                        .split(',')
                        .map(s => s.trim())
                        .filter(Boolean),
                    })
                  }
                  style={{ maxWidth: 220 }}
                />
              </div>
            ))
          )}
          <div
            className="row"
            style={{ gap: '0.6rem', alignItems: 'center', marginTop: '0.6rem' }}
          >
            <button
              className="btn"
              onClick={saveConnectors}
              disabled={savingCfg || connectors.length === 0}
            >
              {savingCfg ? 'Enregistrement…' : 'Enregistrer les connecteurs'}
            </button>
            <button className="btn" onClick={refreshCatalog} disabled={busy}>
              {busy ? 'Collecte en cours…' : 'Actualiser le catalogue'}
            </button>
            {msg && (
              <span className="muted" style={{ fontSize: '0.82rem' }}>
                {msg}
              </span>
            )}
          </div>
        </div>
      )}

      {m.total > 0 && (
        <div className="card">
          <div
            className="row spread"
            style={{ flexWrap: 'wrap', gap: '0.8rem' }}
          >
            <Metric label="Traitements" value={String(m.total)} />
            <Metric
              label="Taux de succès"
              value={m.successRate == null ? '—' : `${m.successRate} %`}
            />
            <Metric label="Annonces ajoutées" value={String(m.totalAdded)} />
            <Metric
              label="Dernière"
              value={m.lastAt ? timeAgo(m.lastAt) : '—'}
            />
          </div>
          <div className="row" style={{ marginTop: '0.6rem' }}>
            <span className="badge badge-ok">{m.success} succès</span>
            {m.partial > 0 && (
              <span className="badge badge-warn">{m.partial} partiel(s)</span>
            )}
            {m.error > 0 && (
              <span className="badge badge-danger">{m.error} échec(s)</span>
            )}
            {m.totalWarnings > 0 && (
              <span className="badge badge-muted">
                {m.totalWarnings} avertissement(s)
              </span>
            )}
          </div>
        </div>
      )}

      {err && (
        <div
          className="card"
          style={{ borderColor: 'var(--danger)', color: 'var(--danger)' }}
        >
          {err}
        </div>
      )}

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
