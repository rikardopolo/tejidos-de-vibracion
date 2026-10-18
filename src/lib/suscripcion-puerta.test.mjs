/** Render REAL de Astro con sesiones firmadas; checkout del navegador sin red. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import * as runtime from 'astro/runtime/server/index.js';
import * as compilerRuntime from 'astro/compiler-runtime';
import { experimental_AstroContainer as Container } from 'astro/container';
import { cargarModuloTs } from './endpoint.test-helper.mjs';
import * as sesion from './sesion-tdv.mjs';
import * as checkout from './checkout-suscripcion.mjs';
import { puedeAcceder } from './gate-decision.mjs';

const requireAstro = createRequire(import.meta.resolve('astro/package.json'));
const { transform } = requireAstro('@astrojs/compiler-rs');
const ROOT = new URL('../../', import.meta.url);
const CHAPTER = 'cap-4-biologia-campo-coherente';
const RUTA = `/capitulo/${CHAPTER}/01-umbral`;
const ORIGEN = 'https://libro-preview.test';
const SECRET = 'secreto-sesion-puerta-falso-'.repeat(2);
const ENV = { TDV_SESION_ENABLED: 'true', TDV_SESSION_SECRET: SECRET };
const moduloStub = (defaultExport) => ({ __esModule: true, default: defaultExport });
const Formulario = moduloStub(runtime.createComponent(() => runtime.render`<form data-formulario-anterior></form>`));
const Layout = moduloStub(runtime.createComponent((_result, _props, slots) => runtime.render`${slots.default?.()}`));
const Vacio = moduloStub(runtime.createComponent(() => runtime.render``));

async function cargarAstro(ruta, dependencias, env) {
  const url = new URL(ruta, ROOT);
  const { code, diagnostics } = transform(readFileSync(url, 'utf8'), {
    filename: ruta, internalURL: 'astro/compiler-runtime', resultScopedSlot: true,
    resolvePath: (specifier) => specifier,
  });
  assert.deepEqual(diagnostics.filter((d) => d.severity === 'error'), [], 'el compilador de Astro acepta el componente');
  const deps = { 'astro/compiler-runtime': compilerRuntime, ...dependencias };
  // El render del HTML no ejecuta CSS; el compilador conserva sus imports para
  // Vite. Solo esos imports de estilo son dobles, no la plantilla ni su lógica.
  for (const m of code.matchAll(/import "([^"]+\?astro&type=style[^"]*)";/g)) deps[m[1]] = {};
  return cargarModuloTs(new URL(`${ruta}.ts`, ROOT), deps, { env, fuente: code });
}

async function componentes(env) {
  const cuenta = cargarModuloTs(new URL('./cuenta-tdv.ts', import.meta.url), { './sesion-tdv.mjs': sesion }, { env });
  const CuentaTdv = await cargarAstro('src/components/book/CuentaTdv.astro', { '@/lib/cuenta-tdv': cuenta }, env);
  const PuertaSuscripcion = await cargarAstro('src/components/book/PuertaSuscripcion.astro', { '@/lib/cuenta-tdv': cuenta }, env);
  const Puerta = await cargarAstro('src/components/book/BloquePuerta.astro', {
    './FormularioTejedor.astro': Formulario, './CuentaTdv.astro': CuentaTdv,
    './PuertaSuscripcion.astro': PuertaSuscripcion, '@/lib/checkout-suscripcion.mjs': checkout,
  }, env);
  return Puerta;
}

function request(ruta, conSesion = false) {
  const headers = {};
  if (conSesion) {
    const token = sesion.firmarSesionTdv({ aid: '11111111-2222-4333-8444-555555555555', ep: 2,
      am: 'codigo', em: 'a***@correo.test' }, { secret: SECRET });
    headers.Cookie = `${sesion.SESION_COOKIE}=${token}`;
  }
  return new Request(`${ORIGEN}${ruta}`, { headers });
}

async function renderPuerta({ activo = 'true', conSesion = false, suscripcion = true, tipo = 'cap-espera', ruta = RUTA } = {}) {
  const env = { ...ENV };
  if (activo !== null) env.SUSCRIPCION_CHECKOUT_ENABLED = activo;
  const Puerta = await componentes(env);
  const container = await Container.create();
  return container.renderToString(Puerta.default, { props: { tipo, capitulo: 'Capítulo IV', suscripcion }, request: request(ruta, conSesion) });
}

test('render: apagado con y sin sesión', async () => {
  for (const activo of [null, 'false']) {
    for (const conSesion of [false, true]) {
      const opciones = { activo, conSesion, tipo: 'cap-bloqueado' };
      const html = await renderPuerta(opciones);
      const anterior = await renderPuerta({ ...opciones, suscripcion: false });
      assert.equal(html, anterior);
      assert.match(html, /Capítulo IV requiere cruzar la Obertura/);
      assert.match(html, /data-formulario-anterior/);
      assert.doesNotMatch(html, /data-suscripcion-checkout|suscripcion-checkout\.js/);
    }
  }
});

test('render: sesión y planes', async () => {
  const html = await renderPuerta({ conSesion: true });
  assert.match(html, /Vas a suscribir la cuenta/);
  assert.match(html, /a\*\*\*@correo\.test/);
  assert.match(html, /data-suscripcion-plan="mensual"[^>]*>Suscribirme al plan mensual/);
  assert.match(html, /data-suscripcion-plan="anual"[^>]*>Suscribirme al plan anual/);
  assert.equal((html.match(/<button\b/g) ?? []).length, 2);
  assert.match(html, /<script\b[^>]*src="\/suscripcion-checkout\.js"[^>]*>\s*<\/script>/);
  assert.match(html, /role="status"/);
  assert.doesNotMatch(html, /\bdisabled(?:\s|=|>)|data-formulario-anterior|\$\s*\d/);
});

test('render: sin sesión y next', async () => {
  for (const ruta of [RUTA, `/capitulo/${CHAPTER}`]) {
    const html = await renderPuerta({ ruta: `${ruta}?t=no-debe-viajar` });
    assert.match(html, /Entrar para suscribirme/);
    const href = html.match(/<a\b[^>]*href="([^"]+)"/)[1];
    const url = new URL(href.replaceAll('&amp;', '&'), ORIGEN);
    assert.equal(url.pathname, '/auth/entrar');
    assert.equal(url.searchParams.get('next'), ruta);
    assert.doesNotMatch(html, /<button\b|suscripcion-checkout\.js|no-debe-viajar/);
  }
});

async function renderRuta({ pieza = true, capitulo = 4, conSesion = false, premium = false, status = 'published' } = {}) {
  const chapter = capitulo === 4 ? CHAPTER : 'cap-3-prueba';
  const ruta = `/capitulo/${chapter}${pieza ? '/01-umbral' : ''}`;
  const env = { ...ENV, SUSCRIPCION_CHECKOUT_ENABLED: 'true' };
  const Puerta = await componentes(env);
  const data = { kind: 'capitulo', chapter: capitulo, act: 'II', title: 'Capítulo de prueba', status,
    nivelRequerido: capitulo === 4 ? 2 : 1, productoSlug: capitulo === 4 ? 'acto-2' : undefined };
  const acceso = { nivel: premium ? 2 : 0, slugs: premium ? ['acto-2'] : [] };
  const Page = await cargarAstro(`src/pages/capitulo/[chapter]/${pieza ? '[section]' : 'index'}.astro`, {
    'astro:content': {
      getEntry: async (coleccion) => coleccion === 'book' ? { id: chapter, data } : {
        id: `${chapter}/01-umbral`, data: { chapter, title: 'Umbral', kind: 'umbral', order: 1, nivelRequerido: 1 },
      },
      getCollection: async () => [], // fallback del índice sin piezas, donde ya aparece BloquePuerta
      render: async () => ({ Content: Vacio.default }),
    },
    '@/layouts/CapituloLayout.astro': Layout, '@/components/book/BloquePuerta.astro': Puerta,
    '@/components/book/PaginacionCards.astro': Vacio,
    '@/lib/gating': { getAccesoVerificado: async () => acceso, puedeAcceder, gatingActivo: () => true,
      esPreview: () => false, CACHE_PAGINA_GATEADA: 'private, no-store' },
    '@/lib/utils': { romanize: (n) => n === 4 ? 'IV' : 'III' },
    '@/lib/piece-num': { pieceOrnament: () => '', pieceMarker: () => '' },
    '@/lib/seo': { SITE: ORIGEN, breadcrumb: () => ({}), wrapGraph: () => ({}), chapterOgImage: () => '/capitulo.png' },
  }, env);
  const container = await Container.create();
  return { ruta, html: await container.renderToString(Page.default, { params: { chapter, section: '01-umbral' }, request: request(ruta, conSesion) }) };
}

test('render: rutas del Cap. 4', async () => {
  for (const pieza of [true, false]) {
    const { html, ruta } = await renderRuta({ pieza });
    assert.match(html, /data-suscripcion-checkout/);
    const href = html.match(/<a\b[^>]*href="([^"]+)"/)[1];
    assert.equal(new URL(href.replaceAll('&amp;', '&'), ORIGEN).searchParams.get('next'), ruta);
  }
});

test('render: otros capítulos y cuenta con acceso', async () => {
  for (const pieza of [true, false]) {
    const otro = await renderRuta({ pieza, capitulo: 3 });
    assert.doesNotMatch(otro.html, /data-suscripcion-checkout/);
    const conDerecho = await renderRuta({ pieza, conSesion: true, premium: true, status: 'draft' });
    assert.doesNotMatch(conDerecho.html, /data-suscripcion-checkout/);
    assert.match(conDerecho.html, /El capítulo sigue/);
  }
});

const script = readFileSync(new URL('../../public/suscripcion-checkout.js', import.meta.url), 'utf8');

function navegador(fetch) {
  const solicitudes = [];
  const destinos = [];
  const estado = { textContent: '' };
  const botones = ['mensual', 'anual'].map((plan) => ({
    dataset: { suscripcionPlan: plan },
    addEventListener: function (_tipo, fn) { this.pulsar = fn; },
    get disabled() { return false; },
    set disabled(_valor) { assert.fail('los botones nunca se deshabilitan'); },
  }));
  const entrar = `/auth/entrar?next=${encodeURIComponent(RUTA)}`;
  const raiz = {
    dataset: { entrar },
    querySelector: (s) => { assert.equal(s, '[data-suscripcion-estado]'); return estado; },
    querySelectorAll: (s) => { assert.equal(s, '[data-suscripcion-plan]'); return botones; },
  };
  runInNewContext(script, {
    document: { querySelectorAll: (s) => { assert.equal(s, '[data-suscripcion-checkout]'); return [raiz]; } },
    window: { location: { assign: (url) => destinos.push(url) } },
    fetch: (...args) => { solicitudes.push(args); return fetch(...args); },
    URL, AbortController, setTimeout, clearTimeout,
  });
  return { solicitudes, destinos, estado, botones, entrar };
}

test('JS: POST mensual y anual', async () => {
  const n = navegador(async () => Response.json({ checkout_url: 'https://tejidosdevibracion.store/checkout/buy/prueba' }));
  for (const boton of n.botones) await boton.pulsar();
  assert.deepEqual(n.solicitudes.map(([url, init]) => [url, init.method, JSON.parse(init.body)]), [
    ['/api/checkout/suscripcion', 'POST', { plan: 'mensual' }],
    ['/api/checkout/suscripcion', 'POST', { plan: 'anual' }],
  ]);
  assert.equal(n.destinos.length, 2);
  assert.ok(n.destinos.every((url) => url === 'https://tejidosdevibracion.store/checkout/buy/prueba'));
  assert.ok(n.botones.every((b) => !b.disabled));
});

test('JS: errores y reintento', async () => {
  const pasos = [
    () => Response.json({}, { status: 500 }),
    () => { throw new Error('sin conexión'); },
    () => Response.json({ checkout_url: 'javascript:alert(1)' }),
    () => Response.json({ error: 'correo_sin_verificar' }, { status: 403 }),
    () => Response.json({}, { status: 429 }),
  ];
  const n = navegador(async () => pasos.shift()());
  for (let i = 0; i < 5; i++) {
    await n.botones[0].pulsar();
    assert.ok(n.estado.textContent.length > 0);
    assert.notEqual(n.estado.textContent, 'Abriendo el pago…');
    assert.ok(n.botones.every((b) => !b.disabled));
  }
  assert.equal(n.solicitudes.length, 5);
  assert.deepEqual(n.destinos, []);
});

test('JS: sesión vencida', async () => {
  const n = navegador(async () => Response.json({}, { status: 401 }));
  await n.botones[1].pulsar();
  assert.deepEqual(n.destinos, [n.entrar]);
});

test('JS: doble clic', async () => {
  let completar;
  const n = navegador(() => new Promise((resolve) => { completar = resolve; }));
  const primero = n.botones[0].pulsar();
  await n.botones[1].pulsar();
  assert.equal(n.solicitudes.length, 1);
  assert.ok(n.botones.every((b) => !b.disabled));
  completar(Response.json({ checkout_url: 'https://tejidosdevibracion.store/checkout/buy/prueba' }));
  await primero;
  assert.equal(n.destinos.length, 1);
});
