/**
 * Rend les DEUX images à fond perdu depuis `public/icon-maskable-512.svg` :
 * le maskable Android (512) et l'icône d'accueil iOS (180).
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
 * ET POURQUOI L'ICÔNE APPLE EST ICI, ET PLUS DANS `npm run icons`. iOS applique
 * SON propre masque en superellipse, et il n'accepte pas la transparence : il
 * APLATIT les coins transparents sur une couleur. `pwa-icons` le fait bien, mais
 * sur son `--bg` par défaut — `12,18,34`, le bleu-noir d'une autre app de la
 * famille. Mesuré sur le fichier livré jusqu'au 14/09/2026 : coin à
 * `12,18,34,255`, soit un cadre sombre autour de la tuile teal sur l'écran
 * d'accueil d'un iPhone.
 *
 * Un `--bg` teal n'aurait réglé qu'à moitié : le dégradé va de #14b8a6 en haut à
 * gauche à #0f766e en bas à droite, et un aplat unique ne peut pas coïncider
 * avec les deux coins. La source à fond perdu, elle, n'a aucun coin à aplatir —
 * le dégradé va d'un bord à l'autre, tel qu'il est dessiné. D'où `--no-apple`
 * dans le script `icons`.
 *
 * Exécuter : npm run icons:maskable
 */
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const racine = join(dirname(fileURLToPath(import.meta.url)), '..');
const source = join(racine, 'public', 'icon-maskable-512.svg');

// `density` : sans elle, sharp pixellise le SVG à 72 ppp AVANT de
// redimensionner, et le dégradé en ressort bandé.
const rend = (taille, nom) =>
  sharp(source, { density: 384 })
    .resize(taille, taille)
    .png()
    .toFile(join(racine, 'public', nom));

await rend(512, 'icon-maskable-512.png');
await rend(180, 'apple-touch-icon.png');

console.log(
  'public/icon-maskable-512.png (512×512) et public/apple-touch-icon.png (180×180) écrits, à fond perdu.'
);
