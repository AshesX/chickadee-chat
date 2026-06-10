// Generates the Windows app icon (resources/icon.ico) and a 512px PNG from the
// Chickadee logo SVG. Run rarely — the outputs are committed so the normal
// build never depends on this script.
//
//   npm run icons   (from apps/desktop)   or   node scripts/generate-icons.mjs
//
// Requires the `sharp` and `png-to-ico` devDependencies (in @chickadee/desktop).
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import sharp from 'sharp';
import pngToIco from 'png-to-ico';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = dirname(here);
const desktop = join(repoRoot, 'apps', 'desktop');
const svgPath = join(desktop, 'src', 'renderer', 'src', 'assets', 'chickadee-logo.svg');
const outDir = join(desktop, 'resources');

const transparent = { r: 0, g: 0, b: 0, alpha: 0 };
const render = (src, size) =>
  sharp(src).resize(size, size, { fit: 'contain', background: transparent }).png().toBuffer();

await mkdir(outDir, { recursive: true });

// Rasterize the SVG once at high resolution, then downscale for each icon size.
const svg = readFileSync(svgPath);
const master = await sharp(svg, { density: 512 })
  .resize(1024, 1024, { fit: 'contain', background: transparent })
  .png()
  .toBuffer();

const icoSizes = [16, 24, 32, 48, 64, 128, 256];
const pngBuffers = await Promise.all(icoSizes.map((s) => render(master, s)));
const ico = await pngToIco(pngBuffers);

await writeFile(join(outDir, 'icon.ico'), ico);
await writeFile(join(outDir, 'icon.png'), await render(master, 512));

console.log(`Wrote ${join(outDir, 'icon.ico')} (${icoSizes.join('/')}) and icon.png (512).`);
