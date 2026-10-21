/**
 * S-16: encadenado de los endpoints REALES de checkout/webhook y el acceso por
 * cuenta. E/S simulada: clienteFalso existente, fetch de LS, Brevo y Sentry.
 * Sesiones, payload, firma del custom, HMAC del webhook y acceso son los reales.
 * No carga .env ni clientes de producción. Correr con la suite normal del libro:
 * node --test src/lib/suscripcion-circuito.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { z } from 'zod';
import { cargarModuloTs } from './endpoint.test-helper.mjs';
import { clienteFalso } from './supabase-falso.test-helper.mjs';
import * as sesionTdv from './sesion-tdv.mjs';
import * as saltoTdv from './salto-tdv.mjs';
import * as checkout from './checkout-suscripcion.mjs';
import * as intentos from './checkout-intento.mjs';
import * as payloadLs from './lemonsqueezy-payload.mjs';
import * as webhook from './lemonsqueezy-webhook.mjs';
import * as productos from './product-slugs.mjs';
import * as compra from './purchase-token.mjs';
import * as correo from './correo-vincular.mjs';
import { firmarCustom } from './custom-suscripcion.mjs';
import { resolverAccesoCuenta } from './acceso-cuenta.mjs';
import { puedeAcceder } from './gate-decision.mjs';

const A = '11111111-2222-4333-8444-555555555555';
const B = '99999999-2222-4333-8444-555555555555';
const AHORA = Date.parse('2026-10-16T12:00:00Z');
const HORA = 60 * 60 * 1000;
const LIBRO = 'https://libro-preview.vercel.app';
const PORTAL = 'https://portal-preview.vercel.app';
const iso = (ms) => new Date(ms).toISOString();

function suscripcion({ custom, id = '701', email = 'pago@correo.test', evento = 'subscription_created', status = 'active', endsAt = null, variantId = '900' } = {}) {
  return {
    meta: { event_name: evento, test_mode: true, ...(custom === undefined ? {} : { custom_data: custom }) },
    data: {
      type: 'subscriptions', id,
      attributes: {
        store_id: 1, customer_id: 55, variant_id: variantId,
        user_email: email, user_name: 'Ana', status,
        cancelled: status === 'cancelled', pause: null,
        renews_at: iso(AHORA + 30 * 24 * HORA), ends_at: endsAt,
        created_at: iso(AHORA), updated_at: iso(Date.now()), test_mode: true,
      },
    },
  };
}

function escenario(t, cambiosEnv = {}) {
  t.mock.timers.enable({ apis: ['Date'], now: AHORA });
  t.mock.method(console, 'info', () => {});
  const env = {
    VERCEL_ENV: 'preview', LS_ACEPTAR_TEST_MODE: 'true',
    TDV_SESION_ENABLED: 'true', SUSCRIPCION_CHECKOUT_ENABLED: 'true',
    TDV_SESSION_SECRET: 'sesion-falsa-'.repeat(4), LS_CUSTOM_SECRET: 'custom-falso-'.repeat(4),
    LS_WEBHOOK_SECRET: 'webhook-falso-'.repeat(4), ACCESS_TOKEN_SECRET: 'compra-falsa-'.repeat(4),
    LEMONSQUEEZY_API_KEY: 'api-ls-falsa', LS_STORE_ID: '1',
    LS_VARIANT_SUSCRIPCION_MENSUAL: '900', LS_VARIANT_SUSCRIPCION_ANUAL: '901',
    LS_VARIANT_BUNDLE_PREVENTA: '111', BREVO_API_KEY: 'api-brevo-falsa',
    BREVO_TEMPLATE_BUNDLE_PREVENTA: '99', PORTAL_AUTORIZAR_URL: `${PORTAL}/cuenta/autorizar`,
    ...cambiosEnv,
  };
  const tablas = {
    cuentas: [
      { account_id: A, email: 'ana@correo.test', session_epoch: 2, email_verificado_at: iso(AHORA - HORA) },
      { account_id: B, email: 'beto@correo.test', session_epoch: 2, email_verificado_at: iso(AHORA - HORA) },
    ],
    checkout_intentos: [], subscriptions: [], orders: [], events: [], leads: [],
  };
  const fallar = {};
  const client = clienteFalso(tablas, { fallar, unicos: {
    checkout_intentos: [['nonce']], subscriptions: [['provider', 'provider_subscription_id']], orders: [['ls_order_id']],
  } });
  const envios = [];
  const tokensCompra = [];
  const etiquetas = [];
  const checkouts = new Map();
  const cookies = new Map(tablas.cuentas.map((c) => [c.account_id, sesionTdv.firmarSesionTdv({
    aid: c.account_id, ep: c.session_epoch, am: 'codigo', em: `${c.email[0]}***@correo.test`,
  }, { secret: env.TDV_SESSION_SECRET })]));
  const navegador = (aid) => ({ get: (nombre) => nombre === sesionTdv.SESION_COOKIE ? { value: cookies.get(aid) } : undefined });
  const cargar = (ruta, deps, opciones = {}) => cargarModuloTs(new URL(ruta, import.meta.url), deps, { env, ...opciones });
  const cuenta = cargar('./cuenta-tdv.ts', { './sesion-tdv.mjs': sesionTdv });
  const sentry = { captureMessage() {}, flush: async () => true };
  const brevo = {
    isRateLimited: () => false,
    sendInlineEmail: async (d) => { envios.push({ modo: 'inline', ...d }); return { ok: true }; },
    sendTransactionalEmail: async (d) => { envios.push({ modo: 'plantilla', ...d }); return { ok: true }; },
    tagContactSafe: async (d) => { etiquetas.push(d); },
  };
  const ls = cargar('./lemonsqueezy.ts', { './lemonsqueezy-payload.mjs': payloadLs }, {
    fetch: async (url, init) => {
      assert.equal(url, 'https://api.lemonsqueezy.com/v1/checkouts', 'solo el proveedor simulado');
      const enlace = `https://tejidosdevibracion.store/checkout/buy/prueba-${checkouts.size + 1}`;
      checkouts.set(enlace, JSON.parse(init.body));
      return new Response(JSON.stringify({ data: { type: 'checkouts', attributes: { url: enlace } } }), { status: 201 });
    },
  });
  const endpointCheckout = cargar('../pages/api/checkout/suscripcion.ts', {
    '@sentry/astro': sentry, 'zod': { z }, '@/lib/payments': ls, '@/lib/brevo': brevo,
    '@/lib/supabase': { getServerClient: () => client }, '@/lib/cuenta-tdv': cuenta,
    '@/lib/salto-tdv.mjs': saltoTdv, '@/lib/checkout-intento.mjs': intentos,
    '@/lib/checkout-suscripcion.mjs': checkout,
  });
  const endpointWebhook = cargar('../pages/api/webhooks/lemonsqueezy.ts', {
    '@sentry/astro': sentry, '@/lib/supabase': { getServerClient: () => client },
    '@/lib/lemonsqueezy-webhook.mjs': webhook, '@/lib/product-slugs.mjs': productos,
    '@/lib/purchase-token.mjs': { ...compra, generatePurchaseToken: (...args) => {
      tokensCompra.push(args);
      return compra.generatePurchaseToken(...args);
    } },
    '@/lib/brevo': brevo, '@/lib/correo-vincular.mjs': correo,
  });

  async function entregar(body) {
    const raw = JSON.stringify(body);
    const signature = crypto.createHmac('sha256', env.LS_WEBHOOK_SECRET).update(raw).digest('hex');
    return endpointWebhook.POST({ request: new Request(`${LIBRO}/api/webhooks/lemonsqueezy`, {
      method: 'POST', body: raw,
      headers: { 'Content-Type': 'application/json', 'X-Signature': signature, 'X-Event-Name': body.meta.event_name },
    }) });
  }

  async function crearCheckout(aid, plan = 'mensual') {
    const url = new URL('/api/checkout/suscripcion', LIBRO);
    const r = await endpointCheckout.POST({ url, cookies: navegador(aid), request: new Request(url, {
      method: 'POST', headers: { Origin: LIBRO, 'Content-Type': 'application/json' }, body: JSON.stringify({ plan }),
    }) });
    assert.equal(r.status, 200, 'checkout por POST con la cookie real firmada');
    return (await r.json()).checkout_url;
  }

  async function pagar(enlace, { pagador = A, email, id = '701' } = {}) {
    // LS conserva el payload del checkout compartido: el navegador que abre la
    // URL solo aporta el correo del pago, nunca cambia el custom del servidor.
    const payload = checkouts.get(enlace);
    assert.ok(payload, 'checkout creado por el endpoint');
    const sesionPagador = cuenta.leerSesionTdv(navegador(pagador));
    assert.ok(sesionPagador, 'el navegador pagador también tiene su propia sesión');
    const correoPago = email ?? tablas.cuentas.find((c) => c.account_id === sesionPagador.aid).email;
    return entregar(suscripcion({ id, email: correoPago, custom: payload.data.attributes.checkout_data.custom,
      variantId: payload.data.relationships.variant.data.id }));
  }

  async function acceso(aid) {
    const sesion = cuenta.leerSesionTdv(navegador(aid));
    assert.ok(sesion, 'sesión válida del libro');
    return resolverAccesoCuenta({ client, sesion, produccion: false });
  }

  function guardarMarca(aid, decision) {
    if (decision.ent.accion === 'mantener') return;
    const sesion = cuenta.leerSesionTdv(navegador(aid));
    const ent = decision.ent.accion === 'escribir' ? decision.ent.ent : null;
    const token = sesionTdv.reemitirSesionTdv(sesion, ent, { secret: env.TDV_SESSION_SECRET });
    assert.ok(token, 'marca guardada dentro de una cookie firmada');
    cookies.set(aid, token);
  }

  return { env, tablas, client, fallar, envios, tokensCompra, etiquetas, checkouts,
    crearCheckout, pagar, entregar, acceso, guardarMarca };
}

test('retiro: webhook firmado del bundle conserva entrega, token y orden previa aunque su checkout esté cerrado', async (t) => {
  const e = escenario(t);
  const retirado = cargarModuloTs(new URL('../pages/api/checkout/bundle-preventa.ts', import.meta.url), {}, { env: e.env });
  assert.equal((await retirado.POST({})).status, 410);
  e.tablas.orders.push({ id: 'orden-antigua', ls_order_id: '4242', account_id: A,
    product_slug: 'bundle-preventa', status: 'paid', test_mode: true, acceso_enviado_at: null });
  const body = {
    meta: { event_name: 'order_created', test_mode: true },
    data: { type: 'orders', id: '4242', attributes: { user_email: 'ana@correo.test',
      user_name: 'Ana', total: 2600, currency: 'USD', status: 'paid', test_mode: true,
      first_order_item: { variant_id: 111 } } },
  };
  const response = await e.entregar(body);
  assert.equal(response.status, 200);
  assert.equal((await response.json()).unknown_product, undefined);
  assert.equal(e.tablas.orders.length, 1, 'el reintento no duplica la compra ni borra su cuenta');
  assert.equal(e.tablas.orders[0].account_id, A);
  assert.equal(e.envios.length, 1);
  const enlace = new URL(e.envios[0].params.ACCESO_URL);
  assert.equal(enlace.pathname, '/acceso/bundle-preventa');
  const token = compra.verifyPurchaseToken(enlace.searchParams.get('t'), e.env.ACCESS_TOKEN_SECRET);
  assert.equal(token.valid, true);
  assert.equal(token.nivel, 2);
  assert.deepEqual(token.slugs, ['bundle-preventa']);
  assert.equal((await e.acceso(A)).acceso.nivel, 2);
});

for (const [caso, email] of [['C01', 'ana@correo.test'], ['C02', 'Pago.Externo@Correo.test']]) {
  test(`${caso}: POST checkout → subscription_created → acceso A con el correo del pago`, async (t) => {
    const e = escenario(t);
    const enlace = await e.crearCheckout(A);
    const r = await e.pagar(enlace, { email });
    assert.equal(r.status, 200);
    assert.equal((await r.json()).resultado, 'vinculada');
    const [sub] = e.tablas.subscriptions;
    const [intento] = e.tablas.checkout_intentos;
    assert.equal(sub.account_id, A);
    assert.equal(sub.email, email.toLowerCase());
    assert.equal(intento.provider_subscription_id, sub.provider_subscription_id);
    assert.ok(intento.used_at, 'el webhook consumió el intento creado por el POST');
    const acceso = (await e.acceso(A)).acceso;
    assert.equal(acceso.nivel, 2);
    assert.ok(puedeAcceder(acceso, 2, 'acto-2'));
  });
}

test('C03: checkout de A pagado en navegador B → solo A gana acceso', async (t) => {
  const e = escenario(t);
  const enlace = await e.crearCheckout(A);
  assert.equal((await e.acceso(B)).acceso.nivel, 1);
  const r = await e.pagar(enlace, { pagador: B });
  assert.equal(r.status, 200);
  assert.equal(e.tablas.subscriptions[0].account_id, A);
  assert.equal(e.tablas.subscriptions[0].email, 'beto@correo.test');
  assert.equal((await e.acceso(A)).acceso.nivel, 2);
  assert.equal((await e.acceso(B)).acceso.nivel, 1, 'abrir y pagar la URL no transfiere el vínculo');
});

test('C03: custom de A con nonce del checkout de B → pendiente, sin acceso para A ni B', async (t) => {
  const e = escenario(t);
  const enlaceA = await e.crearCheckout(A);
  const enlaceB = await e.crearCheckout(B);
  const customA = e.checkouts.get(enlaceA).data.attributes.checkout_data.custom;
  const customB = e.checkouts.get(enlaceB).data.attributes.checkout_data.custom;
  const custom = firmarCustom({ accountId: A, nonce: customB.nonce, iat: Number(customA.iat) }, e.env.LS_CUSTOM_SECRET);
  const r = await e.entregar(suscripcion({ custom }));
  assert.equal(r.status, 200);
  assert.equal((await r.json()).resultado, 'pendiente');
  assert.equal(e.tablas.subscriptions[0].account_id, null);
  assert.equal((await e.acceso(A)).acceso.nivel, 1);
  assert.equal((await e.acceso(B)).acceso.nivel, 1);
});

test('C04: pago sin custom → pendiente y un correo al portal del entorno', async (t) => {
  for (const modo of ['inline', 'plantilla']) {
    for (const preview of [true, false]) {
      await t.test(`${modo}, ${preview ? 'Preview' : 'sin PORTAL_AUTORIZAR_URL'}`, async (s) => {
        const e = escenario(s, {
          PORTAL_AUTORIZAR_URL: preview ? `${PORTAL}/cuenta/autorizar` : undefined,
          BREVO_TEMPLATE_SUB_VINCULAR: modo === 'plantilla' ? '42' : undefined,
        });
        const body = suscripcion(); // pago por enlace directo, sin checkout de nuestra API
        assert.equal((await e.entregar(body)).status, 200);
        assert.equal((await e.entregar(body)).status, 200); // una reentrega no vuelve a enviar
        assert.equal(e.tablas.subscriptions[0].vinculo, 'pendiente');
        assert.equal(e.tablas.subscriptions[0].account_id, null);
        assert.equal((await e.acceso(A)).acceso.nivel, 1);
        assert.equal(e.envios.length, 1);
        const [envio] = e.envios;
        const url = `${preview ? PORTAL : 'https://tejidosderealidad.com'}/cuenta/vincular`;
        assert.equal(envio.to.email, 'pago@correo.test');
        if (modo === 'plantilla') assert.equal(envio.params.VINCULAR_URL, url);
        else {
          assert.ok(envio.textContent.includes(url));
          assert.ok(envio.htmlContent.includes(`href="${url}"`));
          if (preview) assert.ok(!envio.textContent.includes('https://tejidosderealidad.com'));
        }
      });
    }
  }
});

test('C07: order_created firmado de suscripción → ignored y evento, sin orden, token ni envío', async (t) => {
  const e = escenario(t);
  const r = await e.entregar({
    meta: { event_name: 'order_created', test_mode: true },
    data: { type: 'orders', id: '4242', attributes: {
      user_email: 'ana@correo.test', user_name: 'Ana', status: 'paid',
      currency: 'USD', total: 1200, test_mode: true,
      first_order_item: { id: 1, product_id: 7, variant_id: 900 },
    } },
  });
  assert.equal(r.status, 200);
  assert.equal((await r.json()).ignored, 'suscripcion_ignorada');
  assert.equal(e.tablas.orders.length, 0);
  assert.equal(e.tokensCompra.length, 0);
  assert.equal(e.envios.length, 0);
  assert.equal(e.etiquetas.length, 0);
  assert.equal(e.tablas.events.length, 1);
  assert.equal(e.tablas.events[0].type, 'order_suscripcion_ignorada');
  assert.equal(e.tablas.events[0].source, 'lemonsqueezy_webhook');
});

test('C05/C06: cancelación → marca firmada hasta ends_at; vencida o ausente no cubre caída', async (t) => {
  const e = escenario(t);
  const enlace = await e.crearCheckout(A);
  await e.pagar(enlace);
  e.guardarMarca(A, await e.acceso(A));
  t.mock.timers.setTime(AHORA + 60_000);
  const fin = AHORA + HORA;
  const r = await e.entregar(suscripcion({ evento: 'subscription_cancelled', status: 'cancelled', endsAt: iso(fin) }));
  assert.equal(r.status, 200);
  const cancelada = await e.acceso(A);
  assert.equal(cancelada.acceso.nivel, 2);
  assert.equal(cancelada.ent.ent.hasta, fin / 1000, 'la cancelación acorta la marca emitida al pagar');
  e.guardarMarca(A, cancelada);

  e.fallar.cuentas = { status: 503 };
  t.mock.timers.setTime(fin - 1000);
  assert.equal((await e.acceso(A)).acceso.nivel, 2, 'durante la caída vale el último segundo pagado');
  t.mock.timers.setTime(fin);
  assert.equal((await e.acceso(A)).acceso.nivel, 1, 'la caída no prolonga una marca vencida');

  delete e.fallar.cuentas;
  t.mock.timers.setTime(fin + 1000);
  const vencida = await e.acceso(A);
  assert.equal(vencida.acceso.nivel, 1, 'la misma cancelación, con la base sana, ya no concede');
  e.guardarMarca(A, vencida);
  e.fallar.cuentas = { status: 503 };
  assert.equal((await e.acceso(A)).acceso.nivel, 1, 'la sesión sin marca tampoco cubre una caída');
});
