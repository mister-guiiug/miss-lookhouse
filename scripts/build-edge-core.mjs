// ╔══════════════════════════════════════════════════════════════════════╗
// ║ build-edge-core — partage du cœur PUR front ↔ Edge Functions (B1).     ║
// ║                                                                        ║
// ║ Deno (Edge Functions) EXIGE des imports relatifs avec extension `.ts`, ║
// ║ alors que le front est en imports SANS extension (résolution bundler)  ║
// ║ + `composite: true` (incompatible avec allowImportingTsExtensions).    ║
// ║ Plutôt que de toucher au front, on GÉNÈRE une copie Deno-compatible du  ║
// ║ cœur (src/domain + src/ingestion/{pipeline,schema,fieldMap}) dans       ║
// ║ supabase/functions/_shared/core, avec :                                ║
// ║   • extensions `.ts` ajoutées aux imports/exports relatifs ;            ║
// ║   • `zod` → `npm:zod@…` (Deno) ;                                        ║
// ║   • en-tête « généré » (NE PAS éditer la copie, éditer la SOURCE).      ║
// ║                                                                        ║
// ║ La SEULE source de vérité reste src/. Régénérer : npm run build:edge-core ║
// ╚══════════════════════════════════════════════════════════════════════╝
import {
  readFileSync,
  writeFileSync,
  readdirSync,
  mkdirSync,
  rmSync,
  existsSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'supabase/functions/_shared/core');

const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
const zodImport = `npm:zod@${pkg.dependencies?.zod ?? '^4.0.0'}`;

// Fichiers SOURCE partagés (relatifs à src/). domain/* = tout sauf les tests.
const domainFiles = readdirSync(join(ROOT, 'src/domain'))
  .filter(f => f.endsWith('.ts') && !f.endsWith('.test.ts'))
  .map(f => `domain/${f}`);
const ingestionFiles = [
  'ingestion/pipeline.ts',
  'ingestion/schema.ts',
  'ingestion/fieldMap.ts',
];
const FILES = [...domainFiles, ...ingestionFiles];

/** Transforme un module source en module Deno-compatible. */
function toDeno(code, relFromSrc) {
  const body = code
    // 1) Extensions .ts sur les imports/exports relatifs (exigé par Deno).
    .replace(/(\bfrom\s+['"])(\.\.?\/[^'"]+)(['"])/g, (m, p1, spec, p3) =>
      /\.(ts|js|json)$/.test(spec) ? m : `${p1}${spec}.ts${p3}`
    )
    // 2) zod → npm:zod (résolu par le runtime Edge).
    .replace(/(\bfrom\s+['"])zod(['"])/g, `$1${zodImport}$2`);
  const header =
    `// @generated par scripts/build-edge-core.mjs — NE PAS ÉDITER.\n` +
    `// Source : src/${relFromSrc} · Régénérer : npm run build:edge-core\n\n`;
  return header + body;
}

// Régénération intégrale (supprime les fichiers générés devenus obsolètes).
if (existsSync(OUT)) rmSync(OUT, { recursive: true, force: true });

for (const rel of FILES) {
  const src = readFileSync(join(ROOT, 'src', rel), 'utf8');
  const dest = join(OUT, rel);
  mkdirSync(dirname(dest), { recursive: true });
  writeFileSync(dest, toDeno(src, rel), 'utf8');
}

console.log(
  `Cœur Edge généré : ${FILES.length} fichiers → supabase/functions/_shared/core`
);
