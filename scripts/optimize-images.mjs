#!/usr/bin/env node
/**
 * optimize-images.mjs · Genera WebP y AVIF a partir de PNG.
 *
 * Estrategia:
 *   - WebP quality 85 · soporte ~96% navegadores · target compresión 60-70%
 *   - AVIF quality 60 · soporte ~94% · target compresión 80-90%
 *   - PNG original se preserva como fallback final en <picture>
 *
 * Uso:
 *   node scripts/optimize-images.mjs               # todas las carpetas con figuras
 *   node scripts/optimize-images.mjs --dir public/assets/obertura
 *   node scripts/optimize-images.mjs --dry-run     # solo reporta lo que haría
 *
 * Idempotente: si el WebP/AVIF ya existe y es más nuevo que el PNG, lo salta.
 */

import { readdir, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, extname, basename, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

const DEFAULT_DIRS = [
  'public/assets/obertura',
  'public/assets/cap-1',
];

const QUALITY = {
  webp: 85,
  avif: 60,
};

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const dirArgIdx = args.indexOf('--dir');
const targetDirs = dirArgIdx >= 0
  ? [args[dirArgIdx + 1]]
  : DEFAULT_DIRS;

const fmtKB = (bytes) => `${(bytes / 1024).toFixed(0).padStart(5)} KB`;
const fmtPct = (saved, original) =>
  `${((saved / original) * 100).toFixed(1).padStart(5)}%`;

async function isStale(srcPath, outPath) {
  if (!existsSync(outPath)) return true;
  const [srcStat, outStat] = await Promise.all([stat(srcPath), stat(outPath)]);
  return srcStat.mtimeMs > outStat.mtimeMs;
}

async function optimizePng(pngPath) {
  const dir = dirname(pngPath);
  const name = basename(pngPath, '.png');
  const webpPath = join(dir, `${name}.webp`);
  const avifPath = join(dir, `${name}.avif`);

  const srcSize = (await stat(pngPath)).size;
  const results = { src: srcSize };

  // WebP
  if (await isStale(pngPath, webpPath)) {
    if (!dryRun) {
      await sharp(pngPath).webp({ quality: QUALITY.webp, effort: 6 }).toFile(webpPath);
    }
    results.webp = dryRun ? null : (await stat(webpPath)).size;
  } else {
    results.webp = (await stat(webpPath)).size;
    results.webpCached = true;
  }

  // AVIF
  if (await isStale(pngPath, avifPath)) {
    if (!dryRun) {
      await sharp(pngPath).avif({ quality: QUALITY.avif, effort: 5 }).toFile(avifPath);
    }
    results.avif = dryRun ? null : (await stat(avifPath)).size;
  } else {
    results.avif = (await stat(avifPath)).size;
    results.avifCached = true;
  }

  return { name: basename(pngPath), ...results };
}

async function processDir(relDir) {
  const absDir = join(ROOT, relDir);
  if (!existsSync(absDir)) {
    console.log(`  [SKIP] ${relDir} (no existe)`);
    return [];
  }

  const entries = await readdir(absDir, { withFileTypes: true });
  const pngs = entries
    .filter((e) => e.isFile() && extname(e.name).toLowerCase() === '.png')
    .map((e) => join(absDir, e.name));

  if (pngs.length === 0) {
    console.log(`  [SKIP] ${relDir} (sin PNG)`);
    return [];
  }

  console.log(`\n${relDir} · ${pngs.length} PNG`);
  console.log('─'.repeat(78));
  console.log(
    `  ${'archivo'.padEnd(28)} ${'PNG'.padStart(8)} ${'WebP'.padStart(8)} ${'WebP%'.padStart(7)} ${'AVIF'.padStart(8)} ${'AVIF%'.padStart(7)}`,
  );

  const results = [];
  for (const png of pngs) {
    const r = await optimizePng(png);
    results.push(r);
    const webpPct = r.webp ? fmtPct(r.src - r.webp, r.src) : '   —   ';
    const avifPct = r.avif ? fmtPct(r.src - r.avif, r.src) : '   —   ';
    const cachedTag = (r.webpCached || r.avifCached) ? ' (cached)' : '';
    console.log(
      `  ${r.name.padEnd(28)} ${fmtKB(r.src)} ${fmtKB(r.webp || 0)}  ${webpPct}  ${fmtKB(r.avif || 0)}  ${avifPct}${cachedTag}`,
    );
  }

  return results;
}

async function main() {
  console.log('Optimización de imágenes · PNG → WebP + AVIF');
  console.log(`Quality: WebP ${QUALITY.webp} · AVIF ${QUALITY.avif}`);
  if (dryRun) console.log('Modo: DRY-RUN (no escribe archivos)');

  const allResults = [];
  for (const dir of targetDirs) {
    const r = await processDir(dir);
    allResults.push(...r);
  }

  if (allResults.length === 0) {
    console.log('\nSin archivos para procesar.');
    return;
  }

  const totalPng = allResults.reduce((s, r) => s + r.src, 0);
  const totalWebp = allResults.reduce((s, r) => s + (r.webp || 0), 0);
  const totalAvif = allResults.reduce((s, r) => s + (r.avif || 0), 0);

  console.log('\n' + '═'.repeat(78));
  console.log(`Total ${allResults.length} archivos:`);
  console.log(`  PNG  original :  ${fmtKB(totalPng)}  (${(totalPng / 1024 / 1024).toFixed(1)} MB)`);
  console.log(`  WebP optimiz. :  ${fmtKB(totalWebp)}  (${(totalWebp / 1024 / 1024).toFixed(1)} MB)  → ${fmtPct(totalPng - totalWebp, totalPng)} reducción`);
  console.log(`  AVIF optimiz. :  ${fmtKB(totalAvif)}  (${(totalAvif / 1024 / 1024).toFixed(1)} MB)  → ${fmtPct(totalPng - totalAvif, totalPng)} reducción`);
  console.log('═'.repeat(78));
}

main().catch((err) => {
  console.error('ERROR:', err);
  process.exit(1);
});
