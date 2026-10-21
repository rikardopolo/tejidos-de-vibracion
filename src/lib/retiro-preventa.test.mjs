/** Retiro comercial sin red, base real ni cambios en los derechos comprados. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as runtime from 'astro/runtime/server/index.js';
import { experimental_AstroContainer as Container } from 'astro/container';
import { cargarAstro, renderAstro } from './astro.test-helper.mjs';
import { cargarModuloTs } from './endpoint.test-helper.mjs';
import * as sesion from './sesion-tdv.mjs';
import * as checkout from './checkout-suscripcion.mjs';
import { clienteFalso } from './supabase-falso.test-helper.mjs';
import { resolverAccesoCuenta } from './acceso-cuenta.mjs';
import { puedeAcceder } from './gate-decision.mjs';

const modulo = (defaultExport) => ({ __esModule: true, default: defaultExport });
const Layout = modulo(runtime.createComponent((_r, _p, slots) => runtime.render`${slots.default?.()}`));
const Vacio = modulo(runtime.createComponent(() => runtime.render``));
const RETIRADO = /bundle|pre[- ]?venta|comprar-checkout\.js/i;
const ORIGEN = 'https://libro-preview.test';
const AID = '11111111-2222-4333-8444-555555555555';
const SECRET = 'secreto-falso-retiro-'.repeat(3);

function endpoint(env = {}) {
  // Cualquier import o fetch nuevos fallan: este endpoint no puede crear un checkout.
  return cargarModuloTs(new URL('../pages/api/checkout/bundle-preventa.ts', import.meta.url), {}, { env });
}

test('retiro: /comprar/preventa responde 301 hacia /suscribirse sin variables de Lemon Squeezy', async () => {
  const Pagina = await cargarAstro('src/pages/comprar/preventa.astro', {});
  const container = await Container.create();
  const response = await container.renderToResponse(Pagina.default, { request: new Request(`${ORIGEN}/comprar/preventa`) });
  assert.equal(response.status, 301);
  assert.equal(response.headers.get('location'), '/suscribirse');
  assert.doesNotMatch(await response.text(), RETIRADO);
  const config = JSON.parse(readFileSync(new URL('../../vercel.json', import.meta.url), 'utf8'));
  for (const alias of ['/comprar', '/comprar/acto-2']) {
    assert.equal(config.redirects.find((r) => r.source === alias).destination, '/suscribirse');
  }
  assert.equal(config.redirects.some((r) => r.source === '/comprar/preventa'), false, 'Vercel no sustituye el 301 por un 308');
});

test('retiro: checkout devuelve 410 y JSON claro sin leer el cuerpo ni crear pagos', async () => {
  for (const env of [{}, { LS_VARIANT_BUNDLE_PREVENTA: '111' }]) {
    const ruta = endpoint(env);
    const contexto = { get request() { assert.fail('no debe leer ni validar un pedido de la oferta retirada'); } };
    for (const metodo of [ruta.POST, ruta.ALL]) {
      const r = await metodo(contexto);
      assert.equal(r.status, 410);
      assert.match(r.headers.get('content-type'), /application\/json/);
      const body = await r.json();
      assert.equal(body.error, 'oferta_retirada');
      assert.equal(body.suscripcion_url, '/suscribirse');
      assert.match(body.mensaje, /Si ya compraste, conservas tu acceso/);
      assert.equal(Object.hasOwn(body, 'checkout_url'), false);
    }
  }
});

test('retiro: el destino de suscripción respeta el interruptor y la sesión, sin precios copiados', async () => {
  for (const activa of [false, true]) for (const conSesion of [false, true]) {
    const env = { SUSCRIPCION_CHECKOUT_ENABLED: String(activa), TDV_SESION_ENABLED: 'true', TDV_SESSION_SECRET: SECRET };
    const cuenta = cargarModuloTs(new URL('./cuenta-tdv.ts', import.meta.url), { './sesion-tdv.mjs': sesion }, { env });
    const Puerta = await cargarAstro('src/components/book/PuertaSuscripcion.astro', { '@/lib/cuenta-tdv': cuenta }, env);
    const Pagina = await cargarAstro('src/pages/suscribirse.astro', {
      '@/layouts/LecturaLarga.astro': Layout, '@/components/book/PuertaSuscripcion.astro': Puerta,
      '@/lib/checkout-suscripcion.mjs': checkout,
    }, env);
    const headers = {};
    if (conSesion) {
      const token = sesion.firmarSesionTdv({ aid: AID, ep: 1, am: 'codigo', em: 'a***@correo.test' }, { secret: SECRET });
      headers.Cookie = `${sesion.SESION_COOKIE}=${token}`;
    }
    const container = await Container.create();
    const r = await container.renderToResponse(Pagina.default, { request: new Request(`${ORIGEN}/suscribirse`, { headers }) });
    const html = await r.text();
    assert.equal(r.status, 200);
    assert.equal(r.headers.get('cache-control'), 'private, no-store');
    assert.match(html, /Acceso al Tejedor/);
    assert.doesNotMatch(html, RETIRADO);
    assert.equal(html.includes('data-suscripcion-checkout'), activa);
    assert.equal(html.includes('data-suscripcion-plan="mensual"'), activa && conSesion);
    assert.equal(html.includes('data-suscripcion-plan="anual"'), activa && conSesion);
    assert.doesNotMatch(html, /\bdisabled(?:\s|=|>)|\$\s*\d/);
    if (activa && !conSesion) assert.match(html, /\/auth\/entrar\?next=%2Fsuscribirse/);
  }
});

test('retiro: el HTML del índice y de todas las puertas no ofrece el bundle, con interruptores on/off', async () => {
  const Toc = await cargarAstro('src/components/book/TocEntry.astro', {});
  const Indice = await cargarAstro('src/pages/indice.astro', {
    'astro:content': { getCollection: async () => [] }, '@/layouts/LecturaLarga.astro': Layout,
    '@/components/book/TocEntry.astro': Toc, '@/components/book/LitLink.astro': Layout,
  });
  assert.doesNotMatch(await renderAstro(Indice, '/indice'), RETIRADO);
  for (const activa of [false, true]) {
    const env = { TDV_SESION_ENABLED: String(activa), SUSCRIPCION_CHECKOUT_ENABLED: String(activa) };
    const cuenta = cargarModuloTs(new URL('./cuenta-tdv.ts', import.meta.url), { './sesion-tdv.mjs': sesion }, { env });
    const deps = { '@/lib/cuenta-tdv': cuenta };
    const Cuenta = await cargarAstro('src/components/book/PuertaCuenta.astro', deps, env);
    const Oferta = await cargarAstro('src/components/book/PuertaSuscripcion.astro', deps, env);
    const Puerta = await cargarAstro('src/components/book/BloquePuerta.astro', {
      ...deps, './FormularioTejedor.astro': Vacio, './CuentaTdv.astro': Vacio,
      './PuertaCuenta.astro': Cuenta, './PuertaSuscripcion.astro': Oferta,
      '@/lib/checkout-suscripcion.mjs': checkout,
    }, env);
    for (const tipo of ['obertura', 'obertura-pieza', 'cap-bloqueado', 'cap-espera']) {
      for (const suscripcion of [false, true]) {
        assert.doesNotMatch(await renderAstro(Puerta, '/capitulo/cap-4/01-umbral', { tipo, suscripcion }), RETIRADO);
      }
    }
    const Bloque = await cargarAstro('src/components/book/BloqueSuscripcion.astro', { '@/lib/gating': { suscripcionActiva: () => activa } });
    assert.doesNotMatch(await renderAstro(Bloque, '/capitulo/cap-4'), RETIRADO);
  }
  for (const archivo of ['index.md', 'llms.txt']) {
    assert.doesNotMatch(readFileSync(new URL(`../../public/${archivo}`, import.meta.url), 'utf8'), RETIRADO);
  }
});

test('retiro: una orden de bundle existente conserva nivel y alcance sin la variable de venta', async () => {
  assert.equal((await endpoint().POST({})).status, 410);
  const tablas = {
    cuentas: [{ account_id: AID, session_epoch: 1 }], subscriptions: [],
    orders: [{ account_id: AID, product_slug: 'bundle-preventa', status: 'paid', test_mode: false }],
  };
  const decision = await resolverAccesoCuenta({ client: clienteFalso(tablas), sesion: { aid: AID, ep: 1 }, produccion: true });
  assert.deepEqual(decision.acceso, { nivel: 2, slugs: ['bundle-preventa'] });
  assert.equal(puedeAcceder(decision.acceso, 2, 'bundle-preventa'), true);
  assert.equal(puedeAcceder(decision.acceso, 3), false);
  assert.equal(decision.revocada, false);
});
