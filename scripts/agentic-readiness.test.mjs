/**
 * Agentic readiness · el sitio tiene que ser legible y recuperable por agentes.
 * Correr: node --test scripts/agentic-readiness.test.mjs
 *
 * F1 · 404 negociado. Lo que este fichero ata no es "que el código exista",
 * sino tres invariantes que fallan MUDAS si alguien las rompe:
 *
 *  1. `404.astro` debe seguir siendo SSR (`prerender = false`). Si se
 *     prerenderiza, el catch-all del adapter deja de apuntar a `_render` y pasa
 *     a `/404.html`: el middleware no corre, la negociación muere y NADA falla
 *     en el build. Es el modo de fallo más caro de esta campaña.
 *  2. El header `Accept` se lee SOLO después de `next()` y solo en la rama 404.
 *     Leer `request.headers` durante el prerender de una página estática emite
 *     un WARN por página; el guard mira el orden en el código fuente.
 *  3. El mapa de recuperación no puede apuntar al vacío ni a contenido cerrado.
 *     Un 404 que ofrece rutas muertas es peor que un 404 sin mapa.
 *
 * El control que discrimina vive en `resuelve()`: cap-2 EXISTE como .mdx pero
 * no está publicado, así que el resolutor debe rechazarlo. Si el test solo
 * comprobase existencia de fichero, ese control saldría verde y el mapa podría
 * ofrecer capítulos cerrados sin que nadie se enterase.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import { MD_404, RUTAS_404, apply404Negotiation, wantsMarkdown } from '../src/lib/agent-md.mjs';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pagesDir = path.join(raiz, 'src', 'pages');
const contentDir = path.join(raiz, 'src', 'content');
const SITE = 'https://tejidosdevibracion.com';

const src404 = readFileSync(path.join(pagesDir, '404.astro'), 'utf8');
const srcMiddleware = readFileSync(path.join(raiz, 'src', 'middleware.ts'), 'utf8');

/**
 * ¿Este pathname resuelve HOY a una página pública real del libro?
 * Rutas estáticas: fichero en src/pages. Capítulos: ruta dinámica + el .mdx del
 * capítulo con `status: published` (la visibilidad la decide el capítulo padre).
 */
function resuelve(href) {
  if (href === '/') return existsSync(path.join(pagesDir, 'index.astro'));
  const rel = href.replace(/^\//, '');

  const cap = rel.match(/^capitulo\/([a-z0-9-]+)$/);
  if (cap) {
    const dinamica = existsSync(path.join(pagesDir, 'capitulo', '[chapter]', 'index.astro'));
    const mdx = path.join(contentDir, 'book', `${cap[1]}.mdx`);
    if (!dinamica || !existsSync(mdx)) return false;
    return /^status:\s*["']?published\b/m.test(readFileSync(mdx, 'utf8'));
  }

  return (
    existsSync(path.join(pagesDir, `${rel}.astro`)) || existsSync(path.join(pagesDir, rel, 'index.astro'))
  );
}

// ── wantsMarkdown ────────────────────────────────────────────────────
test('wantsMarkdown detecta text/markdown, con mayúsculas raras y entre otros tipos', () => {
  assert.equal(wantsMarkdown('text/markdown'), true);
  assert.equal(wantsMarkdown('Text/Markdown'), true);
  assert.equal(wantsMarkdown('text/html, text/markdown;q=0.9'), true);
});

test('wantsMarkdown NO se dispara con Accept genéricos (control negativo)', () => {
  assert.equal(wantsMarkdown(null), false);
  assert.equal(wantsMarkdown(''), false);
  assert.equal(wantsMarkdown('*/*'), false);
  assert.equal(wantsMarkdown('application/json'), false);
  // El Accept real de Chrome no incluye markdown: el humano debe seguir viendo HTML.
  assert.equal(
    wantsMarkdown('text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,*/*;q=0.8'),
    false,
  );
});

// ── 404 · variante markdown ──────────────────────────────────────────
test('404 + Accept: text/markdown devuelve el cuerpo markdown con su content-type y Vary', async () => {
  const res = apply404Negotiation('/ruta-inexistente', 'text/markdown', new Response('<html>404</html>', { status: 404 }));
  assert.equal(res.status, 404);
  assert.equal(res.headers.get('content-type'), 'text/markdown; charset=utf-8');
  assert.equal(res.headers.get('vary'), 'Accept');
  assert.equal(await res.text(), MD_404);
});

test('404 sin markdown conserva el cuerpo HTML y GANA Vary: Accept', async () => {
  const res = apply404Negotiation('/ruta-inexistente', 'text/html', new Response('<html>404</html>', { status: 404 }));
  assert.equal(res.status, 404);
  assert.equal(await res.text(), '<html>404</html>');
  assert.equal(res.headers.get('vary'), 'Accept');
});

test('Vary preexistente no se pisa: Cookie → "Cookie, Accept"', () => {
  const res = apply404Negotiation(
    '/x',
    null,
    new Response('', { status: 404, headers: { vary: 'Cookie' } }),
  );
  assert.equal(res.headers.get('vary'), 'Cookie, Accept');
});

test('Accept-Encoding NO cuenta como Accept (el bug del \\b) y Accept no se duplica', () => {
  const conEncoding = apply404Negotiation(
    '/x',
    null,
    new Response('', { status: 404, headers: { vary: 'Accept-Encoding' } }),
  );
  assert.equal(conEncoding.headers.get('vary'), 'Accept-Encoding, Accept');

  const yaTieneAccept = apply404Negotiation(
    '/x',
    null,
    new Response('', { status: 404, headers: { vary: 'Accept-Encoding, Accept' } }),
  );
  assert.equal(yaTieneAccept.headers.get('vary'), 'Accept-Encoding, Accept');
});

// ── Lo que NO debe tocar ─────────────────────────────────────────────
test('una respuesta 200 sale intacta, sea cual sea el Accept (misma instancia)', () => {
  const ok = new Response('hola', { status: 200 });
  assert.equal(apply404Negotiation('/', 'text/markdown', ok), ok);
  assert.equal(ok.headers.get('vary'), null);
});

test('los 404 de /api salen intactos: un agente que pide markdown no rompe la API', () => {
  const api = new Response('{"ok":false}', { status: 404 });
  assert.equal(apply404Negotiation('/api/leads/libro', 'text/markdown', api), api);
  assert.equal(apply404Negotiation('/api', 'text/markdown', api), api);
  // Control positivo: la MISMA petición fuera de /api sí se negocia.
  const pagina = new Response('', { status: 404 });
  assert.notEqual(apply404Negotiation('/apicultura', 'text/markdown', pagina), pagina);
});

// ── Cuerpo markdown ──────────────────────────────────────────────────
test('MD_404 lleva H1, llms.txt, sitemap.xml y URLs absolutas del dominio', () => {
  assert.match(MD_404, /^# 404/);
  assert.ok(MD_404.includes(`${SITE}/llms.txt`), 'debe apuntar a llms.txt');
  assert.ok(MD_404.includes(`${SITE}/sitemap.xml`), 'debe apuntar al sitemap');
  assert.ok(MD_404.includes('Accept: text/markdown'), 'debe decir cómo pedir markdown');
  assert.ok(!/\]\(\/(?!\/)/.test(MD_404), 'sin enlaces relativos: un agente puede leer esto fuera de contexto');
});

test('el mapa de recuperación de MD_404 y el de la página son EL MISMO', () => {
  for (const r of RUTAS_404) {
    assert.ok(MD_404.includes(`(${SITE}${r.href})`), `MD_404 debe listar ${r.href}`);
  }
  // La página no puede tener su propia lista hardcodeada: consume RUTAS_404.
  assert.ok(src404.includes("from '@/lib/agent-md.mjs'"), '404.astro debe importar el mapa compartido');
  assert.ok(src404.includes('RUTAS_404.map'), '404.astro debe renderizar RUTAS_404, no una copia');
});

// ── El mapa no apunta al vacío ───────────────────────────────────────
test('cada ruta del mapa de recuperación resuelve a una página pública real', () => {
  for (const r of RUTAS_404) {
    assert.ok(resuelve(r.href), `ruta muerta en el mapa del 404: ${r.href}`);
    assert.ok(r.label && r.desc, `${r.href} necesita label y desc`);
  }
});

test('CONTROL · el resolutor rechaza rutas inventadas y capítulos NO publicados', () => {
  assert.equal(resuelve('/ruta-que-no-existe-xyz'), false);
  // cap-2 existe como .mdx pero está cerrado: ofrecerlo sería mandar al agente a un muro.
  assert.ok(existsSync(path.join(contentDir, 'book', 'cap-2-ciencia-escuchar.mdx')), 'premisa del control');
  assert.equal(resuelve('/capitulo/cap-2-ciencia-escuchar'), false);
});

test('los destinos para máquinas existen en el repo', () => {
  assert.ok(existsSync(path.join(raiz, 'public', 'llms.txt')), 'public/llms.txt');
  assert.ok(existsSync(path.join(pagesDir, 'sitemap.xml.ts')), 'src/pages/sitemap.xml.ts');
});

// ── Guards sobre el código fuente (fallos mudos) ─────────────────────
test('404.astro es SSR: prerender = false, status 404 y robots noindex,follow', () => {
  assert.match(src404, /export const prerender = false/, 'prerenderizarla apaga la negociación sin avisar');
  assert.match(src404, /Astro\.response\.status = 404/);
  assert.match(src404, /robots="noindex,follow"/, 'follow: el mapa de recuperación es para seguirlo');
});

test('la página 404 le dice a las máquinas dónde mirar', () => {
  assert.ok(src404.includes('/sitemap.xml'));
  assert.ok(src404.includes('/llms.txt'));
  assert.ok(src404.includes('Accept: text/markdown'));
});

test('el middleware lee Accept DESPUÉS de next() y solo en la rama 404 (evita el WARN por página)', () => {
  const iNext = srcMiddleware.indexOf('await next()');
  const iHeaders = srcMiddleware.indexOf('request.headers');
  assert.ok(iNext > -1 && iHeaders > -1, 'premisa: el middleware llama a next() y lee headers');
  assert.ok(iHeaders > iNext, 'leer request.headers antes de next() emite un WARN por página prerenderizada');
  assert.match(srcMiddleware, /res\.status !== 404/, 'la lectura debe estar tras el filtro de 404');
  assert.ok(srcMiddleware.includes('apply404Negotiation'), 'el middleware debe delegar en agent-md');
});
