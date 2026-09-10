/**
 * Rend l'icône maskable en PNG depuis `public/icon-maskable-512.svg`.
 *
 * POURQUOI UN SVG À PART, ET PAS `pwa-icons --maskable`. Le générateur du socle
 * fabrique un maskable en RÉDUISANT la source dans la zone de sécurité, sur un
 * fond uni. Quand la source est une tuile arrondie — c'est le cas ici — le
 * résultat est cette tuile posée sur un aplat : le raccord se voit, et Android
 * en fait un liseré tout autour de l'icône. C'est exactement ce que montrait le
 * PNG livré jusqu'ici, tuile verte sur fond vert pâle.
 *
 * Un maskable se DESSINE à fond perdu. `icon-maskable-512.svg` reprend le même
 * dégradé et le même dessin que `favicon.svg`, sans les coins arrondis et avec
 * le sujet ramené dans le disque de sécurité. Le commentaire du SVG dit
 * exactement ce qui en diffère.
 *
 * Exécuter : npm run icons:maskable
 */
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const racine = join(dirname(fileURLToPath(import.meta.url)), '..');
const source = join(racine, 'public', 'icon-maskable-512.svg');
const sortie = join(racine, 'public', 'icon-maskable-512.png');

// `density` : sans elle, sharp pixellise le SVG à 72 ppp AVANT de
// redimensionner, et le dégradé en ressort bandé.
await sharp(source, { density: 384 }).resize(512, 512).png().toFile(sortie);

console.log('public/icon-maskable-512.png écrit (512×512, à fond perdu).');
