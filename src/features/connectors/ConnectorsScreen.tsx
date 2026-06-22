import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Trash2, Save, X, Power, FlaskConical } from 'lucide-react';
import { IS_SUPABASE } from '../../backend/config';
import { useAuth } from '../../auth/useAuth';
import {
  listConnectors,
  saveConnector,
  setConnectorEnabled,
  deleteConnector,
  testConnector,
  type Connector,
  type ConnectorInput,
  type ConnectorTestResult,
} from '../../backend/connectors';

const SOURCES = ['leboncoin', 'seloger', 'bienici', 'pap', 'import_generique'];

interface FormState {
  id?: string;
  label: string;
  sourceId: string;
  url: string;
  listPath: string;
  mapText: string;
  secretRef: string;
  enabled: boolean;
}

const EMPTY: FormState = {
  label: '',
  sourceId: 'import_generique',
  url: '',
  listPath: '',
  mapText: '{\n  "externalId": "id",\n  "title": "title"\n}',
  secretRef: '',
  enabled: true,
};

function toForm(c: Connector): FormState {
  return {
    id: c.id,
    label: c.label,
    sourceId: c.sourceId,
    url: c.config.url ?? '',
    listPath: c.config.listPath ?? '',
    mapText: c.config.map ? JSON.stringify(c.config.map, null, 2) : '',
    secretRef: c.secretRef ?? '',
    enabled: c.enabled,
  };
}

/** Parse le formulaire en ConnectorInput (lève si URL non https / mappage invalide). */
function buildInput(form: FormState): ConnectorInput {
  const u = new URL(form.url.trim());
  if (u.protocol !== 'https:') throw new Error('L’URL doit être en https.');
  let map: Record<string, string> | undefined;
  const t = form.mapText.trim();
  if (t) {
    const parsed: unknown = JSON.parse(t);
    if (typeof parsed !== 'object' || Array.isArray(parsed) || !parsed)
      throw new Error('Le mappage doit être un objet JSON.');
    map = parsed as Record<string, string>;
  }
  return {
    id: form.id,
    sourceId: form.sourceId,
    label: form.label.trim() || form.sourceId,
    enabled: form.enabled,
    config: {
      url: form.url.trim(),
      listPath: form.listPath.trim() || undefined,
      map,
    },
    secretRef: form.secretRef.trim() || null,
  };
}

export function ConnectorsScreen() {
  const { user } = useAuth();
  const [list, setList] = useState<Connector[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [form, setForm] = useState<FormState | null>(null);
  const [busy, setBusy] = useState(false);
  const [test, setTest] = useState<ConnectorTestResult | null>(null);
  const [testing, setTesting] = useState(false);

  const reload = () => {
    setErr(null);
    listConnectors()
      .then(setList)
      .catch(e => setErr(e instanceof Error ? e.message : String(e)));
  };
  useEffect(() => {
    if (IS_SUPABASE && user) reload();
  }, [user]);

  if (!IS_SUPABASE) {
    return (
      <div className="empty">
        Les connecteurs de collecte automatique nécessitent le backend Supabase.
        <br />
        <Link to="/import">Utiliser l’import manuel</Link>
      </div>
    );
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form) return;
    setBusy(true);
    setErr(null);
    try {
      await saveConnector(buildInput(form));
      setForm(null);
      reload();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Échec de l’enregistrement.');
    } finally {
      setBusy(false);
    }
  };

  const runTest = async () => {
    if (!form) return;
    setTesting(true);
    setErr(null);
    setTest(null);
    try {
      const input = buildInput(form);
      setTest(
        await testConnector({ ...input.config, secretRef: input.secretRef })
      );
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Configuration invalide.');
    } finally {
      setTesting(false);
    }
  };

  const remove = async (c: Connector) => {
    if (!window.confirm(`Supprimer le connecteur « ${c.label} » ?`)) return;
    try {
      await deleteConnector(c.id);
      reload();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Échec.');
    }
  };

  const toggle = async (c: Connector) => {
    try {
      await setConnectorEnabled(c.id, !c.enabled);
      reload();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Échec.');
    }
  };

  return (
    <>
      <div className="row spread">
        <h2 className="section-title" style={{ margin: 0 }}>
          Connecteurs (collecte auto)
        </h2>
        {!form && (
          <button
            className="btn btn-primary"
            onClick={() => setForm({ ...EMPTY })}
          >
            <Plus size={16} aria-hidden /> Ajouter
          </button>
        )}
      </div>

      <p className="muted" style={{ fontSize: '0.84rem' }}>
        Collecte <strong>responsable</strong> : seules les{' '}
        <strong>API / flux autorisés</strong> que vous configurez ici sont
        interrogées, automatiquement <strong>toutes les heures</strong>. Aucun
        scraping de portail. Le serveur normalise et déduplique comme l’import
        manuel.
      </p>

      {err && (
        <div
          className="card"
          style={{ borderColor: 'var(--danger)', color: 'var(--danger)' }}
        >
          {err}
        </div>
      )}

      {form && (
        <form className="card" onSubmit={submit}>
          <div className="field">
            <label htmlFor="c-label">Nom</label>
            <input
              id="c-label"
              value={form.label}
              onChange={e => setForm({ ...form, label: e.target.value })}
              placeholder="Mon flux autorisé"
            />
          </div>
          <div className="row" style={{ gap: '0.5rem' }}>
            <div className="field" style={{ flex: 1 }}>
              <label htmlFor="c-source">Source</label>
              <select
                id="c-source"
                value={form.sourceId}
                onChange={e => setForm({ ...form, sourceId: e.target.value })}
              >
                {SOURCES.map(s => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
            <div className="field" style={{ width: 120 }}>
              <label htmlFor="c-enabled">Actif</label>
              <select
                id="c-enabled"
                value={form.enabled ? '1' : '0'}
                onChange={e =>
                  setForm({ ...form, enabled: e.target.value === '1' })
                }
              >
                <option value="1">Oui</option>
                <option value="0">Non</option>
              </select>
            </div>
          </div>
          <div className="field">
            <label htmlFor="c-url">URL de l’API (https)</label>
            <input
              id="c-url"
              value={form.url}
              onChange={e => setForm({ ...form, url: e.target.value })}
              placeholder="https://api.exemple.fr/annonces"
              inputMode="url"
              required
            />
          </div>
          <div className="field">
            <label htmlFor="c-listpath">Chemin du tableau (optionnel)</label>
            <input
              id="c-listpath"
              value={form.listPath}
              onChange={e => setForm({ ...form, listPath: e.target.value })}
              placeholder="data.items"
            />
          </div>
          <div className="field">
            <label htmlFor="c-map">Mappage des champs (JSON, optionnel)</label>
            <textarea
              id="c-map"
              rows={5}
              value={form.mapText}
              onChange={e => setForm({ ...form, mapText: e.target.value })}
              placeholder='{ "externalId": "id", "title": "title", "price": "prix" }'
              style={{ fontFamily: 'monospace', fontSize: '0.82rem' }}
            />
            <span className="muted" style={{ fontSize: '0.76rem' }}>
              Associe un champ canonique (externalId, title, price, url,
              surfaceM2, rooms, city, postalCode, lat, lng…) à un chemin dans la
              réponse.
            </span>
          </div>
          <div className="field">
            <label htmlFor="c-secret">
              Secret d’API (optionnel) — nom du secret d’Edge Function
            </label>
            <input
              id="c-secret"
              value={form.secretRef}
              onChange={e => setForm({ ...form, secretRef: e.target.value })}
              placeholder="MON_API_TOKEN"
            />
            <span className="muted" style={{ fontSize: '0.76rem' }}>
              La valeur du jeton vit dans les secrets Supabase (jamais en base)
              ; ici, seulement son nom.
            </span>
          </div>
          <div className="row" style={{ gap: '0.5rem' }}>
            <button
              type="button"
              className="btn"
              onClick={() => setForm(null)}
              style={{ flex: 1, justifyContent: 'center' }}
            >
              <X size={15} aria-hidden /> Annuler
            </button>
            <button
              type="button"
              className="btn"
              onClick={() => void runTest()}
              disabled={testing}
              style={{ flex: 1, justifyContent: 'center' }}
            >
              <FlaskConical size={15} aria-hidden />{' '}
              {testing ? 'Test…' : 'Tester'}
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={busy}
              style={{ flex: 2, justifyContent: 'center' }}
            >
              <Save size={15} aria-hidden />{' '}
              {busy
                ? 'Enregistrement…'
                : form.id
                  ? 'Enregistrer'
                  : 'Créer le connecteur'}
            </button>
          </div>
          {test && (
            <div
              className="card"
              style={{ marginTop: '0.5rem', background: 'var(--surface-2)' }}
            >
              {test.error ? (
                <span style={{ color: 'var(--danger)', fontSize: '0.84rem' }}>
                  {test.error}
                </span>
              ) : (
                <>
                  <div className="row spread">
                    <span className="h-title" style={{ fontSize: '0.9rem' }}>
                      {test.count ?? 0} annonce(s) trouvée(s)
                    </span>
                    {test.errors && test.errors.length > 0 && (
                      <span className="badge badge-warn">
                        {test.errors.length} non valide(s)
                      </span>
                    )}
                  </div>
                  {(test.sample ?? []).map((smp, i) => (
                    <div
                      key={i}
                      className="muted"
                      style={{ fontSize: '0.8rem', marginTop: '0.2rem' }}
                    >
                      {smp.title ?? smp.externalId}
                      {smp.price != null ? ` — ${smp.price} €` : ''}
                      {smp.city ? ` · ${smp.city}` : ''}
                    </div>
                  ))}
                  {(test.sample ?? []).length === 0 && (
                    <span className="muted" style={{ fontSize: '0.8rem' }}>
                      Aucun échantillon normalisé (vérifiez le mappage).
                    </span>
                  )}
                </>
              )}
            </div>
          )}
        </form>
      )}

      {list == null ? (
        <div className="empty">Chargement…</div>
      ) : list.length === 0 && !form ? (
        <div className="empty">
          Aucun connecteur. Ajoutez une API autorisée pour collecter
          automatiquement.
        </div>
      ) : (
        list.map(c => (
          <div className="card" key={c.id}>
            <div className="row spread">
              <div style={{ minWidth: 0 }}>
                <div className="h-title">{c.label}</div>
                <div
                  className="muted"
                  style={{
                    fontSize: '0.78rem',
                    overflowWrap: 'anywhere',
                  }}
                >
                  {c.sourceId} · {c.config.url}
                </div>
              </div>
              <span
                className={`badge ${c.enabled ? 'badge-ok' : 'badge-muted'}`}
              >
                {c.enabled ? 'actif' : 'inactif'}
              </span>
            </div>
            <div className="row" style={{ marginTop: '0.6rem' }}>
              <button className="btn" onClick={() => void toggle(c)}>
                <Power size={15} aria-hidden />{' '}
                {c.enabled ? 'Désactiver' : 'Activer'}
              </button>
              <button className="btn" onClick={() => setForm(toForm(c))}>
                Modifier
              </button>
              <button className="btn" onClick={() => void remove(c)}>
                <Trash2 size={15} aria-hidden /> Supprimer
              </button>
            </div>
          </div>
        ))
      )}
    </>
  );
}
