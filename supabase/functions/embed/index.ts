// ╔══════════════════════════════════════════════════════════════════════╗
// ║ Edge Function `embed` — calcule les embeddings des annonces (0016).     ║
// ║ Gated par INGEST_TOKEN (déployée `--no-verify-jwt`, comme ingest-run).  ║
// ║                                                                        ║
// ║ Appelée en fin de passage par `ingest-run` : les annonces neuves sont   ║
// ║ embeddées l'heure même où elles entrent. Traite PAR LOTS le « reste à   ║
// ║ calculer » (`lh_embedding_backlog`) : annonces sans embedding, ou dont  ║
// ║ le texte ou le modèle ont changé — rien d'autre. Chaque lot est écrit   ║
// ║ dès qu'il est prêt : un passage interrompu (délai, mémoire) garde ce    ║
// ║ qu'il a fait, et le suivant reprend là. Rejouable à volonté.            ║
// ║                                                                        ║
// ║ LE MODÈLE : `gte-small`, intégré au runtime Edge de Supabase — aucune   ║
// ║ clé, aucun secret, aucun appel sortant. Entraîné surtout sur l'anglais :║
// ║ bon pour les doublons et republications (textes quasi identiques), pas  ║
// ║ pour la similarité de sens fine en français. Il lit 512 jetons au plus. ║
// ╚══════════════════════════════════════════════════════════════════════╝
import { cors, json } from '../_shared/cors.ts';
import { adminClient, checkCronToken } from '../_shared/admin.ts';
import {
  EMBEDDING_MODEL,
  isValidEmbedding,
} from '../_shared/core/domain/embedding.ts';

// Le module d'IA du runtime Edge de Supabase — seules les deux méthodes
// servies ici sont typées (évite une dépendance de types à la publication).
interface AiSession {
  run(
    input: string,
    options: { mean_pool: boolean; normalize: boolean }
  ): Promise<unknown>;
}
declare const Supabase: {
  ai: { Session: new (model: string) => AiSession };
};

interface BacklogRow {
  listing_id: string;
  source_text: string;
  source_hash: string;
}

// Petits lots : l'inférence tourne dans l'instance, et un lot perdu (limite
// de ressources atteinte) ne coûte que lui.
const BATCH = 8;
// Budget de temps d'un appel. `ingest-run` attend la réponse un peu plus
// longtemps (30 s) : son journal dit alors vrai. L'arriéré du premier passage
// se résorbe sur plusieurs heures — ou plus vite, en rappelant la fonction à
// la main (supabase/README.md, §5).
const BUDGET_MS = 25_000;

// Une session par instance : le modèle se charge une fois, pas par requête.
// Créée au premier appel autorisé, pas au chargement du module : un runtime
// sans module d'IA répond alors une erreur lisible, au lieu d'échouer au
// démarrage sans rien dire.
let session: AiSession | null = null;

/** Le vecteur rendu par le modèle, en tableau de nombres (ou tel quel). */
function toNumbers(raw: unknown): unknown {
  if (Array.isArray(raw)) return raw;
  if (ArrayBuffer.isView(raw) && !(raw instanceof DataView))
    return Array.from(raw as unknown as ArrayLike<number>);
  return raw;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (!checkCronToken(req)) return json({ error: 'Non autorisé.' }, 401);

  try {
    session ??= new Supabase.ai.Session(EMBEDDING_MODEL);
  } catch (e) {
    return json(
      {
        error: `Modèle ${EMBEDDING_MODEL} indisponible : ${e instanceof Error ? e.message : String(e)}`,
      },
      500
    );
  }
  const model = session;

  const supabase = adminClient();
  const started = Date.now();
  // Une annonce que le modèle refuse ne doit pas revenir en tête à chaque
  // tour et bloquer la file : on l'écarte pour la durée de l'appel.
  const failed = new Set<string>();
  let embedded = 0;
  let done = false;

  while (Date.now() - started < BUDGET_MS) {
    const { data, error } = await supabase.rpc('lh_embedding_backlog', {
      p_model: EMBEDDING_MODEL,
      p_limit: BATCH + failed.size,
    });
    if (error)
      return json({ error: error.message, embedded, failed: failed.size }, 500);

    const rows = ((data ?? []) as BacklogRow[])
      .filter(r => !failed.has(r.listing_id))
      .slice(0, BATCH);
    if (rows.length === 0) {
      // Plus rien à tenter dans cet appel : fini — sauf s'il reste des
      // annonces que le modèle a refusées, qui reviendront au suivant.
      done = failed.size === 0;
      break;
    }

    const upserts: Record<string, unknown>[] = [];
    for (const row of rows) {
      try {
        const vector = toNumbers(
          await model.run(row.source_text, {
            mean_pool: true,
            normalize: true,
          })
        );
        if (!isValidEmbedding(vector)) {
          failed.add(row.listing_id);
          continue;
        }
        upserts.push({
          listing_id: row.listing_id,
          embedding: vector,
          model: EMBEDDING_MODEL,
          // L'empreinte du texte EMBEDDÉ, rendue par la base avec lui : si
          // l'annonce change entre-temps, elle ne correspondra plus, et
          // l'annonce reviendra au prochain passage.
          source_hash: row.source_hash,
          computed_at: new Date().toISOString(),
        });
      } catch (_e) {
        failed.add(row.listing_id);
      }
    }

    if (upserts.length > 0) {
      const { error: upErr } = await supabase
        .from('listing_embeddings')
        .upsert(upserts, { onConflict: 'listing_id' });
      if (upErr)
        return json(
          {
            error: `Écriture : ${upErr.message}`,
            embedded,
            failed: failed.size,
          },
          500
        );
      embedded += upserts.length;
    }
  }

  return json({
    model: EMBEDDING_MODEL,
    embedded,
    failed: failed.size,
    // `false` : le budget de temps est épuisé, il en reste pour le passage suivant.
    done,
  });
});
