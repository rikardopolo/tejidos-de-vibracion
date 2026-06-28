/**
 * Catálogo de slugs de producto · FUENTE ÚNICA · stdlib node:test, sin deps.
 * Correr: node --test src/lib/product-slugs.test.mjs
 *
 * Blinda el lado CODE del desalineo que dejaba al comprador pagando y al gate
 * negando: si productoSlug del frontmatter MDX no está en token.slugs
 * (=[custom.product_slug] del checkout), el comprador NO entra. Aquí garantizamos
 * que TODO slug code-side (catálogo + el que declare cualquier contenido) sea
 * coherente. El lado LS (que el checkout envíe product_slug == uno del catálogo)
 * es config del dashboard de LS, NO código → ver inputsNeeded.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { PRODUCT_SLUGS, SLUG_NIVEL } from './product-slugs.mjs';
import { mapProductToNivel } from './lemonsqueezy-webhook.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const contentDir = path.resolve(here, '../content');

test('(a) cada slug del catálogo mapea a un nivel conocido en SLUG_NIVEL', () => {
  assert.ok(PRODUCT_SLUGS.length > 0, 'el catálogo no puede estar vacío');
  for (const slug of PRODUCT_SLUGS) {
    const info = mapProductToNivel(slug);
    assert.ok(info, `${slug} debe resolver en SLUG_NIVEL`);
    assert.ok(info.nivel === 2 || info.nivel === 3, `${slug} nivel debe ser 2 o 3, fue ${info?.nivel}`);
  }
  // PRODUCT_SLUGS == claves de SLUG_NIVEL (no hay deriva entre ambos).
  assert.deepEqual([...PRODUCT_SLUGS].sort(), Object.keys(SLUG_NIVEL).sort());
});

// Recolecta los valores de `productoSlug:` de los frontmatter MDX del contenido.
function collectDeclaredSlugs(dir) {
  const found = [];
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return found; // sin carpeta de contenido → nada que validar
  }
  for (const name of entries) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) {
      found.push(...collectDeclaredSlugs(full));
      continue;
    }
    if (!name.endsWith('.mdx') && !name.endsWith('.md')) continue;
    const text = readFileSync(full, 'utf8');
    // Solo el frontmatter (entre los primeros dos '---').
    const fm = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
    if (!fm) continue;
    for (const line of fm[1].split(/\r?\n/)) {
      const m = line.match(/^\s*productoSlug:\s*['"]?([\w-]+)['"]?\s*$/);
      if (m) found.push({ file: path.relative(contentDir, full), slug: m[1] });
    }
  }
  return found;
}

test('(b) todo productoSlug declarado en contenido pertenece al catálogo', () => {
  const declared = collectDeclaredSlugs(contentDir);
  // No es obligatorio que haya alguno (Acto I no usa productoSlug); si los hay,
  // cada uno debe estar en el catálogo o el comprador legítimo sería bloqueado.
  for (const { file, slug } of declared) {
    assert.ok(
      PRODUCT_SLUGS.includes(slug),
      `${file}: productoSlug "${slug}" NO está en el catálogo (${PRODUCT_SLUGS.join(', ')})`,
    );
  }
});
