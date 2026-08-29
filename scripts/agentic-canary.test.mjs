/**
 * El canary tiene que CAZAR, no solo correr.
 * Correr: node --test scripts/agentic-canary.test.mjs
 *
 * Un canary que nunca ha fallado no está verificado: está sin estrenar. Aquí
 * se le dirige contra un sitio sintético correcto (debe salir en verde) y
 * contra el mismo sitio con un defecto concreto inyectado (debe cazarlo y
 * nombrarlo). Los defectos elegidos no son inventados: son los que ya
 * ocurrieron en el portal hermano o los que la campaña puede perder en
 * silencio — el canonical con barra final que se coló en producción, el Vary
 * ausente, el 404 que vuelve a ser estático, el .md indexable y la cabecera
 * de seguridad que la inyección de rutas podría tumbar.
 *
 * Esto NO sustituye a correrlo contra el despliegue: el enrutado del edge
 * solo se comprueba allí. Verifica la lógica del verificador.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import { runCanary, ANCLAS, CABECERAS_SEGURIDAD } from './agentic-canary.mjs';
import { MD_VARIANTS } from './patch-vercel-output.mjs';
import { MD_404, RUTAS_404, SITE } from '../src/lib/agent-md.mjs';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
/* A propósito, el host al que se pregunta NO es el dominio canónico: así el
   banco reproduce el caso del preview de Vercel, donde el sitio responde desde
   otro host pero sus canonicals y sus enlaces siguen siendo del dominio real.
   Comparar los cuerpos contra el host preguntado daba falsos fallos. */
const BASE = 'https://preview-tdv-canary.vercel.app';
const llmsReal = readFileSync(path.join(raiz, 'public', 'llms.txt'), 'utf8');

const seguridad = () => Object.fromEntries(CABECERAS_SEGURIDAD.map((h) => [h, 'x']));

/** HTML mínimo pero fiel: canonical, og:url, robots y prosa suficiente. */
const paginaHtml = ({ canonical, robots = 'index,follow', chars = 700 }) =>
  `<!doctype html><html><head><link rel="canonical" href="${canonical}"/>` +
  `<meta property="og:url" content="${canonical}"/><meta name="robots" content="${robots}"/>` +
  `</head><body><main>${'palabra '.repeat(Math.ceil(chars / 8))}</main></body></html>`;

/**
 * Sitio sintético que se comporta como el despliegue esperado.
 * `roto` inyecta un defecto concreto y solo uno.
 */
function sitioFalso(roto = {}) {
  const rutas = new Set(MD_VARIANTS.map((v) => v.route));
  const mds = new Set(MD_VARIANTS.map((v) => v.md));
  const canonicalDe = (ruta) => {
    const ancla = ANCLAS.find((a) => a.en === ruta);
    const destino = ancla ? ancla.es : ruta;
    return `${SITE}${destino === '/' ? '/' : destino}${ancla && roto.canonicalConBarra ? '/' : ''}`;
  };

  return async (url, opts = {}) => {
    const { pathname } = new URL(url);
    const accept = String(opts.headers?.accept ?? '');
    const quiereMd = accept.toLowerCase().includes('text/markdown');
    const head = opts.method === 'HEAD';
    const H = { ...seguridad() };
    if (roto.cabeceraFaltante) delete H['content-security-policy'];

    const responder = (body, status, headers) =>
      new Response(head ? null : body, { status, headers: { ...H, ...headers } });

    if (pathname === '/llms.txt') return responder(llmsReal, 200, { 'content-type': 'text/plain' });
    if (pathname === '/sitemap.xml') {
      const locs = [`${SITE}/`, `${SITE}/contacto`].map((u) => `<loc>${u}</loc>`).join('');
      return responder(`<urlset>${locs}</urlset>`, 200, { 'content-type': 'application/xml' });
    }
    if (mds.has(pathname)) {
      return responder(`# ${pathname}\n\ncuerpo`, 200, {
        'content-type': 'text/markdown; charset=utf-8',
        ...(roto.mdSinNoindex ? {} : { 'x-robots-tag': 'noindex' }),
      });
    }
    if (rutas.has(pathname)) {
      const vary = roto.sinVary ? {} : { vary: 'Accept' };
      if (quiereMd) {
        return responder('# md', 200, { 'content-type': 'text/markdown; charset=utf-8', ...vary, 'x-vercel-cache': 'HIT' });
      }
      const ancla = ANCLAS.find((a) => a.en === pathname);
      return responder(
        paginaHtml({
          canonical: canonicalDe(pathname),
          robots: ancla ? 'noindex,follow' : 'index,follow',
          chars: roto.anclaCorta && ancla ? 100 : 700,
        }),
        200,
        { 'content-type': 'text/html; charset=utf-8', ...vary, 'x-vercel-cache': 'HIT' },
      );
    }
    // Desconocida → 404 negociado (o estático, si se rompe a propósito).
    if (roto.n404Estatico) {
      return responder('<html>404</html>', 404, { 'content-type': 'text/html; charset=utf-8' });
    }
    return quiereMd
      ? responder(MD_404, 404, { 'content-type': 'text/markdown; charset=utf-8', vary: 'Accept' })
      : responder('<html>404</html>', 404, { 'content-type': 'text/html; charset=utf-8', vary: 'Accept' });
  };
}

const correr = (roto) =>
  runCanary({ base: BASE, fetchImpl: sitioFalso(roto), verbose: false });

test('sobre un sitio correcto, el canary pasa entero', async () => {
  const r = await correr();
  assert.equal(r.fallos.length, 0, `fallos inesperados: ${r.fallos.map((f) => f.nombre).join(' | ')}`);
  assert.ok(r.total > 60, `esperaba una batería amplia, hay ${r.total} comprobaciones`);
});

test('el canary cubre las 15 rutas en GET y HEAD, las dos variantes', async () => {
  const r = await correr();
  for (const { route } of MD_VARIANTS) {
    for (const m of ['GET', 'HEAD']) {
      assert.ok(
        r.resultados.some((x) => x.nombre === `${m} ${route} · Accept: text/markdown → markdown`),
        `falta la comprobación ${m} ${route} markdown`,
      );
    }
  }
  assert.ok(r.resultados.some((x) => x.nombre.includes('las 8 presentes')));
  assert.ok(r.resultados.some((x) => x.nombre.includes('mapa de recuperación')));
});

// ── Controles: cada defecto tiene que ser CAZADO y NOMBRADO ──────────
test('CAZA · el canonical con barra final (la regresión que llegó a producción)', async () => {
  const r = await correr({ canonicalConBarra: true });
  assert.equal(r.fallos.length, ANCLAS.length, 'debe caer una por ancla inglesa');
  for (const { en } of ANCLAS) {
    assert.ok(r.fallos.some((f) => f.nombre.startsWith(`${en} · canonical`)), `no cazó ${en}`);
  }
});

test('CAZA · el Vary ausente (una CDN serviría la variante equivocada)', async () => {
  const r = await correr({ sinVary: true });
  assert.ok(r.fallos.length >= MD_VARIANTS.length, `solo cazó ${r.fallos.length}`);
  assert.ok(r.fallos.every((f) => /Accept|navegador/.test(f.nombre)));
});

test('CAZA · el 404 que vuelve a ser estático (la negociación muerta en silencio)', async () => {
  const r = await correr({ n404Estatico: true });
  assert.ok(r.fallos.some((f) => f.nombre.includes('Accept: text/markdown devuelve markdown')));
  assert.ok(r.fallos.some((f) => f.nombre.includes('mapa de recuperación')));
});

test('CAZA · un .md indexable y una cabecera de seguridad tumbada', async () => {
  const sinNoindex = await correr({ mdSinNoindex: true });
  assert.equal(sinNoindex.fallos.length, new Set(MD_VARIANTS.map((v) => v.md)).size);
  assert.ok(sinNoindex.fallos.every((f) => f.nombre.includes('X-Robots-Tag')));

  const sinCsp = await correr({ cabeceraFaltante: true });
  assert.equal(sinCsp.fallos.length, 1);
  assert.match(sinCsp.fallos[0].nombre, /cabeceras de seguridad/);
  assert.match(sinCsp.fallos[0].detalle, /content-security-policy/);
});

test('CAZA · un trust anchor que se queda corto de contenido', async () => {
  const r = await correr({ anclaCorta: true });
  assert.equal(r.fallos.length, ANCLAS.length);
  assert.ok(r.fallos.every((f) => f.nombre.includes('≥500 caracteres')));
});

test('el canary usa la fuente única de rutas y del mapa del 404 (no una copia)', () => {
  const src = readFileSync(path.join(raiz, 'scripts', 'agentic-canary.mjs'), 'utf8');
  assert.ok(src.includes("from './patch-vercel-output.mjs'"), 'las rutas se importan del manifiesto');
  assert.ok(src.includes("from '../src/lib/agent-md.mjs'"), 'el mapa del 404 se importa de agent-md');
  assert.ok(RUTAS_404.length > 0 && MD_404.startsWith('# 404'), 'premisa de las importaciones');
});

// ── Resistencia a la red ─────────────────────────────────────────────
test('un fallo de red PASAJERO no tumba la corrida: reintenta y sigue', async () => {
  const sano = sitioFalso();
  let primera = true;
  const conTropiezo = async (url, opts) => {
    if (primera) {
      primera = false;
      throw new TypeError('fetch failed');
    }
    return sano(url, opts);
  };
  const r = await runCanary({ base: BASE, fetchImpl: conTropiezo, verbose: false });
  assert.equal(r.fallos.length, 0, 'un tropiezo aislado no debe dejar rastro');
});

test('un fallo de red PERSISTENTE se reporta como comprobación roja, sin reventar', async () => {
  const r = await runCanary({
    base: BASE,
    fetchImpl: async () => {
      throw new TypeError('fetch failed');
    },
    verbose: false,
    retryDelayMs: 0, // sin esperas: el banco mide la lógica, no la paciencia
  });
  // Lo que importa: la corrida LLEGA AL FINAL. Un canary que revienta no
  // dice qué estaba bien; uno que falla entero sí.
  assert.ok(r.total > 60, `la corrida debe completarse, hizo ${r.total} comprobaciones`);
  assert.ok(r.fallos.length > 0, 'y debe reportar los fallos');
  assert.ok(r.fallos.some((f) => f.detalle.includes('599')), 'el detalle debe delatar el error de red');
});
