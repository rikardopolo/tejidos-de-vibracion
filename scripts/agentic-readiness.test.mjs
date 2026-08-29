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
import {
  ACCEPT_MD,
  MD_VARIANTS,
  assertCatchAll404,
  injectMarkdownRoutes,
  srcFor,
  varySrc,
} from './patch-vercel-output.mjs';

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

/* ═══════════════════════════════════════════════════════════════════
   F2 · Negociación markdown de las páginas principales.

   Miniatura FIEL del `.vercel/output/config.json` que emite
   @astrojs/vercel@11 en este repo (verificado sobre el build del
   28-ago-2026): `handle: filesystem` es el PRIMER route —no va después
   de otros, como en otros layouts—, no hay clave `overrides`, y el
   último route es el catch-all a `_render`. Si el adapter cambiara esa
   forma, el build revienta por sí solo (injectMarkdownRoutes exige el
   handle y assertCatchAll404 el catch-all), así que la miniatura no
   puede quedarse mintiendo en silencio.
   ═══════════════════════════════════════════════════════════════════ */
function fixture() {
  return {
    version: 3,
    routes: [
      { handle: 'filesystem' },
      { src: '^/_astro/(.*)$', headers: { 'cache-control': 'public, max-age=31536000, immutable' }, continue: true },
      { src: '^/404/?$', dest: '_render' },
      { src: '^/api/health/?$', dest: '_render' },
      { src: '^/obertura/?$', dest: '_render' },
      { src: '^/recibir/?$', dest: '_render' },
      { src: '^/.*$', dest: '_render', status: 404 },
    ],
  };
}

const rutaMd = (config, ruta) =>
  config.routes.find((r) => r.src === srcFor(ruta) && Array.isArray(r.has));

test('las rutas se inyectan ANTES del handle filesystem (si no, el .html gana siempre)', () => {
  const c = fixture();
  const { changed, injected } = injectMarkdownRoutes(c);
  assert.equal(changed, true);
  assert.equal(injected, 1 + MD_VARIANTS.length);

  const fsIdx = c.routes.findIndex((r) => r.handle === 'filesystem');
  const idxMd = c.routes.findIndex((r) => Array.isArray(r.has));
  assert.ok(idxMd > -1 && idxMd < fsIdx, 'toda ruta negociada va antes del filesystem');
  for (const v of MD_VARIANTS) {
    assert.ok(c.routes.indexOf(rutaMd(c, v.route)) < fsIdx, `${v.route} quedó después del filesystem`);
  }
});

test('el catch-all del 404 sobrevive intacto y sigue el último', () => {
  const c = fixture();
  injectMarkdownRoutes(c);
  const last = c.routes[c.routes.length - 1];
  assert.deepEqual(last, { src: '^/.*$', dest: '_render', status: 404 });
  assert.doesNotThrow(() => assertCatchAll404(c));
});

test('cada página negociada lleva has/accept, su .md, content-type markdown y Vary', () => {
  const c = fixture();
  injectMarkdownRoutes(c);
  for (const v of MD_VARIANTS) {
    const r = rutaMd(c, v.route);
    assert.ok(r, `falta la ruta de ${v.route}`);
    assert.deepEqual(r.has, [{ type: 'header', key: 'accept', value: ACCEPT_MD }]);
    assert.equal(r.dest, v.md);
    assert.equal(r.headers['content-type'], 'text/markdown; charset=utf-8');
    assert.equal(r.headers.vary, 'Accept');
  }
});

test('la ruta Vary cubre todos los paths negociados y es continue (no corta la cadena)', () => {
  const c = fixture();
  injectMarkdownRoutes(c);
  const vary = c.routes.find((r) => r.continue && r.headers?.vary === 'Accept');
  assert.ok(vary, 'falta la ruta que marca Vary: Accept');
  const re = new RegExp(vary.src);
  for (const v of MD_VARIANTS) {
    assert.ok(re.test(v.route), `la ruta Vary no cubre ${v.route}`);
    assert.ok(re.test(`${v.route === '/' ? '' : v.route}/`), `la ruta Vary no cubre ${v.route} con barra`);
  }
  // Control negativo: no puede marcar Vary en todo el sitio.
  assert.equal(re.test('/capitulo/cap-1-universo-sinfonia'), false);
  assert.equal(re.test('/ruta-inventada'), false);
});

test('overrides fija el content-type del .md directo, sin pisar los del adapter', () => {
  const c = fixture();
  c.overrides = { 'algo-del-adapter.html': { contentType: 'text/html' } };
  injectMarkdownRoutes(c);
  assert.equal(c.overrides['algo-del-adapter.html'].contentType, 'text/html', 'no debe pisar overrides ajenos');
  for (const v of MD_VARIANTS) {
    assert.equal(c.overrides[v.md.slice(1)].contentType, 'text/markdown; charset=utf-8');
  }
});

test('IDEMPOTENCIA · una segunda pasada no cambia nada ni duplica rutas', () => {
  const c = fixture();
  injectMarkdownRoutes(c);
  const antes = JSON.stringify(c);
  const segunda = injectMarkdownRoutes(c);
  assert.equal(segunda.changed, false);
  assert.equal(segunda.injected, 0);
  assert.equal(JSON.stringify(c), antes, 'el config no puede mutar en la segunda pasada');
});

test('una ruta AJENA que condicione por accept no bloquea la inyección (denylist disfrazada)', () => {
  const c = fixture();
  // El adapter podría negociar avif/webp por accept: no son nuestras.
  c.routes.unshift({ src: '^/_image/?$', has: [{ type: 'header', key: 'accept', value: '.*avif.*' }], dest: '_render' });
  const { changed, injected } = injectMarkdownRoutes(c);
  assert.equal(changed, true, 'una ruta ajena con accept haría saltar la inyección si el filtro fuese por "alguna ruta con accept"');
  assert.equal(injected, 1 + MD_VARIANTS.length);
});

test('una inyección PARCIAL revienta en vez de dar verde silencioso', () => {
  const c = fixture();
  injectMarkdownRoutes(c);
  // Alguien edita el config a mano y borra una de nuestras rutas.
  const i = c.routes.findIndex((r) => r.dest === MD_VARIANTS[0].md);
  c.routes.splice(i, 1);
  assert.throws(() => injectMarkdownRoutes(c), /parcial/);
});

test('sin handle filesystem el script revienta (layout inesperado del adapter)', () => {
  const c = fixture();
  c.routes = c.routes.filter((r) => r.handle !== 'filesystem');
  assert.throws(() => injectMarkdownRoutes(c), /filesystem/);
});

test('CONTROL · assertCatchAll404 revienta si el 404 vuelve a ser estático', () => {
  const c = fixture();
  c.routes[c.routes.length - 1] = { src: '^/.*$', dest: '/404.html', status: 404 };
  assert.throws(() => assertCatchAll404(c), /404\.astro|catch-all/);
  // Y con el catch-all bueno no revienta (control positivo).
  assert.doesNotThrow(() => assertCatchAll404(fixture()));
});

test('los regex de ruta casan lo que deben y nada más', () => {
  assert.equal(srcFor('/'), '^/$');
  assert.equal(new RegExp(srcFor('/')).test('/'), true);
  assert.equal(new RegExp(srcFor('/')).test('/indice'), false);

  const re = new RegExp(srcFor('/acto-i'));
  assert.equal(re.test('/acto-i'), true);
  assert.equal(re.test('/acto-i/'), true);
  assert.equal(re.test('/acto-ii'), false, 'no puede tragarse el acto siguiente');
  assert.equal(re.test('/acto-i/algo'), false);

  assert.equal(new RegExp(ACCEPT_MD).test('text/markdown'), true);
  assert.equal(new RegExp(ACCEPT_MD).test('text/html, text/markdown;q=0.9'), true);
  assert.equal(new RegExp(ACCEPT_MD).test('text/html'), false);
  assert.ok(varySrc().startsWith('^/'), 'la unión debe anclar al inicio');
});

// ── Paridad manifiesto ↔ ficheros ↔ páginas ──────────────────────────
test('cada .md del manifiesto existe, con H1, sustancia y URLs del dominio', () => {
  for (const md of new Set(MD_VARIANTS.map((v) => v.md))) {
    const p = path.join(raiz, 'public', md.slice(1));
    assert.ok(existsSync(p), `falta ${md} en public/`);
    const txt = readFileSync(p, 'utf8');
    assert.match(txt, /^# .+/, `${md} debe abrir con un H1`);
    assert.ok(txt.length > 200, `${md} es demasiado corto para servir de algo (${txt.length} chars)`);
    assert.ok(txt.includes('tejidosdevibracion.com'), `${md} debe enlazar con URLs absolutas`);
  }
});

test('cada ruta negociada corresponde a una página pública real del sitio', () => {
  for (const v of MD_VARIANTS) {
    assert.ok(resuelve(v.route), `${v.route} no resuelve a ninguna página: no puede negociar markdown`);
  }
});

test('el manifiesto NO negocia contenido gated (un .md estático puentearía el gate)', () => {
  for (const v of MD_VARIANTS) {
    assert.ok(!/^\/capitulo\//.test(v.route), `${v.route} es contenido de capítulo: fuera del manifiesto`);
    assert.ok(!/^\/obertura\/.+/.test(v.route), `${v.route} es una pieza de la Obertura: fuera del manifiesto`);
  }
});

test('el build encadena el parche después de astro build', () => {
  const pkg = JSON.parse(readFileSync(path.join(raiz, 'package.json'), 'utf8'));
  assert.match(pkg.scripts.build, /astro build\s*&&\s*node scripts\/patch-vercel-output\.mjs/);
});

/* ═══════════════════════════════════════════════════════════════════
   F3 · Trust anchors. /contacto (español, indexable) y las tres rutas
   inglesas que los agentes sondean antes de recomendar un sitio.

   🔴 El invariante del canonical va AL REVÉS que en el portal hermano:
   este sitio canonicaliza SIN barra final (canonicalFor la quita y
   vercel.json redirige /x/ → /x). Copiar allí el gate de allá —que
   EXIGE barra— habría encadenado las tres anclas a un duplicado
   rastreable. Por eso aquí se mide el comportamiento del helper, no la
   forma del literal.
   ═══════════════════════════════════════════════════════════════════ */
const ANCLAS_EN = [
  { page: 'about.astro', canonicalA: '/sobre-el-libro' },
  { page: 'contact.astro', canonicalA: '/contacto' },
  { page: 'privacy.astro', canonicalA: '/privacidad' },
];

const fuentePagina = (f) => readFileSync(path.join(pagesDir, f), 'utf8');

/** Texto que un extractor vería en una página .astro: sin frontmatter, sin
 * <style>, sin expresiones {…} (podadas hasta punto fijo) y sin etiquetas. */
function visibleText(src) {
  let s = src.replace(/^---[\s\S]*?\n---/, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ');
  let prev;
  do {
    prev = s;
    s = s.replace(/\{[^{}]*\}/g, ' ');
  } while (s !== prev);
  return s.replace(/<[^>]+>/g, ' ').replace(/&[a-zA-Z#0-9]+;/g, ' ').replace(/\s+/g, ' ').trim();
}

test('GATE INVERTIDO · canonicalFor normaliza SIN barra final (aquí, al revés que el portal)', async () => {
  const { canonicalFor } = await import('../src/lib/seo.ts');
  for (const { canonicalA } of ANCLAS_EN) {
    assert.equal(canonicalFor(canonicalA).endsWith('/'), false, `${canonicalA} no puede canonicalizar con barra`);
    // Control: aunque alguien escriba la barra, el helper la quita.
    assert.equal(canonicalFor(`${canonicalA}/`), canonicalFor(canonicalA));
  }
  // Control positivo del helper: la raíz SÍ conserva su barra.
  assert.ok(canonicalFor('/').endsWith('/'));
});

test('las 3 anclas inglesas canonicalizan a su página española VÍA canonicalFor (no a mano)', () => {
  for (const { page, canonicalA } of ANCLAS_EN) {
    const src = fuentePagina(page);
    assert.ok(
      src.includes(`canonical={canonicalFor('${canonicalA}')}`),
      `${page} debe declarar canonical={canonicalFor('${canonicalA}')} — un literal a mano se saltaría la normalización`,
    );
    assert.ok(!/canonical="https?:/.test(src), `${page} no puede llevar un canonical literal`);
    assert.ok(resuelve(canonicalA), `el canonical de ${page} apunta a ${canonicalA}, que no existe`);
  }
});

test('robots: las inglesas noindex,follow · /contacto indexable', () => {
  for (const { page } of ANCLAS_EN) {
    assert.match(fuentePagina(page), /robots="noindex,follow"/, `${page} debe ser noindex,follow`);
  }
  assert.match(fuentePagina('contacto.astro'), /robots="index,follow"/);
});

test('las 4 anclas tienen ≥500 caracteres visibles (lo que mide la auditoría)', () => {
  for (const f of ['contacto.astro', ...ANCLAS_EN.map((a) => a.page)]) {
    const n = visibleText(fuentePagina(f)).length;
    assert.ok(n >= 500, `${f} solo tiene ${n} caracteres visibles`);
  }
});

test('CONTROL · visibleText no cuenta atributos, expresiones ni estilos', () => {
  const falso = `---\nimport X from 'y';\n---\n<X title="palabra ${'largo '.repeat(200)}" canonical={canonicalFor('/x')}>\n<p>hola</p>\n</X>\n<style>.a{color:red}</style>`;
  assert.equal(visibleText(falso), 'hola', 'si contase atributos o estilos, los 500 chars se cumplirían en falso');
});

test('el sitemap anuncia /contacto y NINGUNA de las rutas inglesas', () => {
  const src = readFileSync(path.join(pagesDir, 'sitemap.xml.ts'), 'utf8');
  const bloque = src.match(/STATIC_PUBLIC_URLS\s*=\s*\[([\s\S]*?)\]/);
  assert.ok(bloque, 'no encuentro STATIC_PUBLIC_URLS');
  const rutas = [...bloque[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
  assert.ok(rutas.includes('/contacto'), '/contacto debe estar en el sitemap');
  for (const { canonicalA } of ANCLAS_EN) {
    const en = '/' + path.basename(ANCLAS_EN.find((a) => a.canonicalA === canonicalA).page, '.astro');
    assert.ok(!rutas.includes(en), `${en} es noindex: no puede estar en el sitemap`);
  }
});

test('las 4 anclas negocian markdown y reutilizan el .md de su canónica', () => {
  const porRuta = Object.fromEntries(MD_VARIANTS.map((v) => [v.route, v.md]));
  assert.equal(porRuta['/contacto'], '/contacto.md');
  for (const { canonicalA, page } of ANCLAS_EN) {
    const en = '/' + path.basename(page, '.astro');
    assert.ok(porRuta[en], `${en} no está en el manifiesto`);
    assert.equal(porRuta[en], porRuta[canonicalA], `${en} debe servir el mismo markdown que ${canonicalA}`);
  }
});

test('el footer enlaza /contacto (si no, la página existe pero nadie la encuentra)', () => {
  const footer = readFileSync(path.join(raiz, 'src', 'components', 'BookFooter.astro'), 'utf8');
  assert.ok(footer.includes('href="/contacto"'));
});

test('los correos publicados no divergen entre la página española y la inglesa', () => {
  const correos = (src) => [...new Set([...src.matchAll(/mailto:([^"]+)"/g)].map((m) => m[1]))].sort();
  assert.deepEqual(correos(fuentePagina('contacto.astro')), correos(fuentePagina('contact.astro')));
  assert.deepEqual(correos(fuentePagina('contacto.astro')), [
    'contacto@tejidosderealidad.com',
    'hola@tejidosderealidad.com',
  ]);
});

/* ═══════════════════════════════════════════════════════════════════
   F4 · llms.txt · guía «when to use».

   El ítem de la auditoría no fallaba por falta de fichero (existe y está
   bien formado desde antes): fallaba por falta de guía de uso. Y su
   criterio es explícito — «generic marketing copy does not read as
   guidance»—, así que lo que se ata aquí no es que haya una sección con
   el título correcto, sino que la lista de rutas que anuncia coincida
   con lo que el edge sirve de verdad. Una guía que promete rutas que no
   negocian es peor que no tenerla.
   ═══════════════════════════════════════════════════════════════════ */
const llms = readFileSync(path.join(raiz, 'public', 'llms.txt'), 'utf8');

test('llms.txt dice cuándo usar el sitio, para qué NO, y cómo llamarlo', () => {
  assert.match(llms, /^## When to use this site \(for AI agents\) · Cuándo usar este sitio$/m);
  assert.match(llms, /^Not a fit · no es para:/m, 'sin el «not a fit» la guía solo se vende');
  assert.ok(llms.includes('How to call this site'), 'falta el bloque de acceso');
  assert.ok(llms.includes('Accept: text/markdown'));
  assert.ok(llms.includes('Vary: Accept'));
  assert.ok(llms.includes('https://tejidosdevibracion.com/sitemap.xml'));
  assert.ok(llms.includes('https://tejidosdevibracion.com/contacto'), '/contacto debe ser alcanzable desde la guía');
});

test('el «not a fit» nombra lo que de verdad vive en otro sitio o no se sirve', () => {
  const noFit = llms.match(/^Not a fit · no es para:.*$/m)[0];
  assert.ok(noFit.includes('tejidosderealidad.com'), 'debe redirigir al portal lo que es del portal');
  assert.ok(/capítulos aún no abiertos|2 a 10/.test(noFit), 'debe avisar de los capítulos cerrados');
  assert.ok(/terapéutico|médico/.test(noFit), 'un libro sobre frecuencias debe declarar que no es guía de tratamiento');
});

test('DERIVA · las rutas que anuncia llms.txt son EXACTAMENTE las que negocian', () => {
  const linea = llms.match(/Negotiating routes: (.+)$/m);
  assert.ok(linea, 'la guía debe listar las rutas que negocian');
  const anunciadas = linea[1]
    .split('·')
    .map((s) => s.trim())
    .filter(Boolean)
    .sort();
  const reales = MD_VARIANTS.map((v) => v.route).sort();
  assert.deepEqual(anunciadas, reales, 'la guía y el manifiesto han derivado: un agente seguiría rutas que no negocian');
});

test('llms.txt sigue cumpliendo llmstxt.org: un solo H1, blockquote y secciones ##', () => {
  const h1 = llms.match(/^# .+$/gm) ?? [];
  assert.equal(h1.length, 1, 'llmstxt.org exige exactamente un H1');
  assert.match(llms, /^> .+/m, 'falta el blockquote de resumen');
  const secciones = (llms.match(/^## .+$/gm) ?? []).length;
  assert.ok(secciones >= 6, `esperaba las secciones previas más la nueva, hay ${secciones}`);
  // Las secciones que ya existían no se tocaron.
  for (const s of ['## Cómo citar este sitio', '## El libro', '## Cómo se publica', '## El autor', '## Optional', '## Política']) {
    assert.ok(llms.includes(s), `desapareció ${s}: esta fase EXTIENDE, no regenera`);
  }
});

test('llms.txt no promete nada que este sitio no tenga', () => {
  assert.ok(!llms.includes('llms-full.txt'), 'aquí no existe llms-full.txt (sí en el portal)');
  assert.ok(!llms.includes('rel="alternate"'), 'este sitio no declara la variante con <link rel=alternate>');
  assert.ok(!/\/pensadores|\/simuladores|\/tarot|\/astral/.test(llms.match(/Negotiating routes: .+$/m)[0]), 'esas rutas son del portal');
});

test('los .md crudos salen con X-Robots-Tag noindex, y el bloque de seguridad sigue intacto', () => {
  const vercel = JSON.parse(readFileSync(path.join(raiz, 'vercel.json'), 'utf8'));
  const md = vercel.headers.find((h) => h.source.includes('.md'));
  assert.ok(md, 'falta el bloque de cabeceras para /*.md');
  assert.deepEqual(md.headers, [{ key: 'X-Robots-Tag', value: 'noindex' }]);

  // El bloque global no se toca: sus 8 cabeceras siguen ahí, CSP incluida.
  const global = vercel.headers.find((h) => h.source === '/(.*)');
  assert.ok(global, 'el bloque de seguridad global desapareció');
  assert.equal(global.headers.length, 8);
  assert.ok(global.headers.some((h) => h.key === 'Content-Security-Policy'));
  assert.ok(!global.headers.some((h) => h.key === 'X-Robots-Tag'), 'el noindex NO puede vivir en el bloque global');
});
