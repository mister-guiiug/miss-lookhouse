import { useState } from 'react';
import { AlertTriangle, ShieldCheck } from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import { formatDate } from '../../lib/format';

const CHECKLIST = [
  'Photos cohérentes',
  'Prix cohérent vs marché',
  'Adresse vérifiée',
  'Contact/agence vérifié',
  'Annonce complète',
];
const ANOMALIES = [
  'recyclée',
  'trompeuse',
  'incohérente',
  'incomplète',
  'prix suspect',
];

/**
 * Vérification métier d'une annonce : statut vérifié, niveau de confiance,
 * checklist, anomalies signalées + historique. Alimente `listing_verifications`
 * (et bascule le statut utilisateur en « vérifiée » / « suspecte »).
 */
export function VerificationCard({ listingId }: { listingId: string }) {
  const verifications = useAppStore(s => s.data.verifications);
  const addVerification = useAppStore(s => s.addVerification);
  const history = verifications[listingId] ?? [];

  const [verified, setVerified] = useState(false);
  const [confidence, setConfidence] = useState(60);
  const [checklist, setChecklist] = useState<Record<string, boolean>>({});
  const [anomalies, setAnomalies] = useState<string[]>([]);
  const [reason, setReason] = useState('');

  const toggleCheck = (k: string) => setChecklist(c => ({ ...c, [k]: !c[k] }));
  const toggleAnomaly = (a: string) =>
    setAnomalies(arr =>
      arr.includes(a) ? arr.filter(x => x !== a) : [...arr, a]
    );

  const save = () => {
    addVerification(listingId, {
      verified,
      confidence,
      checklist,
      anomalies,
      flaggedReason: reason.trim() || null,
    });
    setReason('');
    setAnomalies([]);
    setChecklist({});
    setVerified(false);
    setConfidence(60);
  };

  return (
    <div className="card">
      <h3 className="section-title">Vérification métier</h3>

      <div className="row spread" style={{ marginTop: '0.5rem' }}>
        <span className="row">
          <ShieldCheck size={16} aria-hidden /> Marquer comme vérifiée
        </span>
        <button
          type="button"
          role="switch"
          aria-checked={verified}
          className={`badge ${verified ? 'badge-ok' : 'badge-muted'}`}
          onClick={() => setVerified(v => !v)}
        >
          {verified ? 'Vérifiée' : 'Non vérifiée'}
        </button>
      </div>

      <div className="field" style={{ marginTop: '0.6rem' }}>
        <label htmlFor="conf">Niveau de confiance : {confidence}/100</label>
        <input
          id="conf"
          type="range"
          min={0}
          max={100}
          value={confidence}
          onChange={e => setConfidence(Number(e.target.value))}
        />
      </div>

      <h4 className="section-title">Checklist</h4>
      <div className="row" style={{ marginTop: '0.4rem' }}>
        {CHECKLIST.map(item => (
          <button
            key={item}
            type="button"
            className={`badge ${checklist[item] ? 'badge-ok' : 'badge-muted'}`}
            onClick={() => toggleCheck(item)}
          >
            {checklist[item] ? '✓ ' : ''}
            {item}
          </button>
        ))}
      </div>

      <h4 className="section-title">Anomalies</h4>
      <div className="row" style={{ marginTop: '0.4rem' }}>
        {ANOMALIES.map(a => (
          <button
            key={a}
            type="button"
            className={`badge ${anomalies.includes(a) ? 'badge-danger' : 'badge-muted'}`}
            onClick={() => toggleAnomaly(a)}
          >
            {a}
          </button>
        ))}
      </div>

      <div className="field" style={{ marginTop: '0.6rem' }}>
        <label htmlFor="reason">Commentaire / signalement</label>
        <textarea
          id="reason"
          rows={2}
          value={reason}
          onChange={e => setReason(e.target.value)}
          placeholder="Ex. annonce trompeuse, incohérence surface/photos…"
        />
      </div>

      <button
        className="btn btn-primary"
        onClick={save}
        style={{ width: '100%', justifyContent: 'center' }}
      >
        Enregistrer la vérification
      </button>

      {history.length > 0 && (
        <>
          <h4 className="section-title" style={{ marginTop: '0.8rem' }}>
            Historique
          </h4>
          {history.map(v => (
            <div
              key={v.id}
              className="card"
              style={{ marginTop: '0.4rem', background: 'var(--surface-2)' }}
            >
              <div className="row spread">
                <span
                  className={`badge ${v.verified ? 'badge-ok' : 'badge-muted'}`}
                >
                  {v.verified ? 'Vérifiée' : 'Non vérifiée'}
                </span>
                {v.confidence != null && (
                  <span className="badge badge-primary">
                    Confiance {v.confidence}
                  </span>
                )}
              </div>
              {v.anomalies.length > 0 && (
                <div className="row" style={{ marginTop: '0.3rem' }}>
                  <AlertTriangle size={14} color="var(--danger)" aria-hidden />
                  {v.anomalies.map(a => (
                    <span key={a} className="badge badge-danger">
                      {a}
                    </span>
                  ))}
                </div>
              )}
              {v.flaggedReason && (
                <p style={{ margin: '0.3rem 0 0', fontSize: '0.85rem' }}>
                  {v.flaggedReason}
                </p>
              )}
              <span className="muted" style={{ fontSize: '0.74rem' }}>
                {formatDate(v.createdAt)}
              </span>
            </div>
          ))}
        </>
      )}
    </div>
  );
}
