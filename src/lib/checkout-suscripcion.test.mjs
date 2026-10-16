/**
 * checkout-suscripcion.test.mjs · Checkout de la suscripción (S-13, punto 3) con un
 * cliente falso de Supabase y un `crearCheckout` espía.
 * Correr: node --test src/lib/checkout-suscripcion.test.mjs
 *
 * «Una cuenta sin verificar no puede pagar» (lista Verificar de S-13), el custom
 * firmado, el intento en `checkout_intentos`, el correo de la cuenta, `expires_at`,
 * sin `lead_id`, y la variante por plan.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  INTENTO_TTL_MS,
  PORTAL_CUENTA_URL,
  checkoutSuscripcionActivo,
  correoPrecargable,
  prepararCheckoutSuscripcion,
  urlCuentaPortal,
  variantesDePlan,
} from './checkout-suscripcion.mjs';
import { verificarCustom } from './custom-suscripcion.mjs';
import { buildCheckoutPayload } from './lemonsqueezy-payload.mjs';
import { clienteFalso } from './supabase-falso.test-helper.mjs';

const AID = '11111111-2222-4333-8444-555555555555';
const SECRET = 's'.repeat(40);
const NOW = Date.parse('2026-10-07T12:00:00Z');
const VARIANTES = { mensual: '900', anual: '901' };

function cuenta(extra = {}) {
  return { account_id: AID, email: 'Ana@Correo.com', email_verificado_at: '2026-10-01T00:00:00Z', session_epoch: 2, ...extra };
}

function espia(resultado = { ok: true, url: 'https://tejidosdevibracion.store/checkout/buy/abc' }) {
  const llamadas = [];
  const fn = async (o) => {
    llamadas.push(o);
    return resultado;
  };
  return { fn, llamadas };
}

function preparar({ tablas, sesion = { aid: AID, ep: 2 }, plan = 'mensual', crear = espia(), extra = {}, opts = {} } = {}) {
  const t = tablas ?? { cuentas: [cuenta()], checkout_intentos: [] };
  const client = clienteFalso(t, { unicos: { checkout_intentos: [['nonce']] }, ...opts });
  const p = prepararCheckoutSuscripcion({
    sesion,
    plan,
    client,
    secretCustom: SECRET,
    variantes: VARIANTES,
    crearCheckout: crear.fn,
    nowMs: NOW,
    ...extra,
  });
  return { p, t, client, crear };
}

// ─── El camino bueno ────────────────────────────────────────────────────────

test('cuenta verificada → intento en checkout_intentos y checkout con custom firmado, correo de la cuenta y expires_at', async () => {
  const { p, t, crear } = preparar();
  const r = await p;
  assert.equal(r.status, 200);
  assert.equal(r.body.checkout_url, 'https://tejidosdevibracion.store/checkout/buy/abc');
  assert.equal(r.desenlace, 'checkout_creado');

  assert.equal(t.checkout_intentos.length, 1);
  const intento = t.checkout_intentos[0];
  assert.equal(intento.account_id, AID);
  assert.equal(intento.variant_id, '900');
  assert.equal(intento.expires_at, new Date(NOW + INTENTO_TTL_MS).toISOString());
  assert.match(intento.nonce, /^[A-Za-z0-9_-]{43}$/);

  assert.equal(crear.llamadas.length, 1);
  const o = crear.llamadas[0];
  assert.equal(o.variantId, '900');
  assert.equal(o.email, 'ana@correo.com');
  assert.equal(o.productSlug, 'suscripcion-libro');
  assert.equal(o.expiresAt, intento.expires_at);
  assert.deepEqual(Object.keys(o.custom).sort(), ['account_id', 'iat', 'nonce', 'sig']);
  assert.equal(o.custom.nonce, intento.nonce);
  for (const v of Object.values(o.custom)) assert.equal(typeof v, 'string', 'valores string (LS los devuelve así)');
  const v = verificarCustom(o.custom, SECRET, { nowS: Math.floor(NOW / 1000) });
  assert.equal(v.ok, true);
  assert.equal(v.accountId, AID);
});

test('el payload de LS lleva el custom, expires_at y NINGÚN lead_id', async () => {
  const { p, crear } = preparar();
  await p;
  const o = crear.llamadas[0];
  const payload = buildCheckoutPayload({ storeId: 1, ...o });
  const attrs = payload.data.attributes;
  assert.equal(attrs.expires_at, o.expiresAt);
  assert.equal(attrs.checkout_data.email, 'ana@correo.com');
  assert.equal('lead_id' in attrs.checkout_data.custom, false);
  assert.equal(attrs.checkout_data.custom.account_id, AID);
  assert.equal(attrs.checkout_data.custom.product_slug, 'suscripcion-libro');
  assert.equal(payload.data.relationships.variant.data.id, '900');
});

test('plan anual → variante anual', async () => {
  const { p, t, crear } = preparar({ plan: 'anual' });
  assert.equal((await p).status, 200);
  assert.equal(crear.llamadas[0].variantId, '901');
  assert.equal(t.checkout_intentos[0].variant_id, '901');
});

// ─── Cuenta sin verificar / sin sesión ──────────────────────────────────────

test('cuenta SIN verificar no puede pagar: 403 que pide confirmar el correo en el portal, sin intento ni checkout', async () => {
  const crear = espia();
  const { p, t } = preparar({
    tablas: { cuentas: [cuenta({ email_verificado_at: null })], checkout_intentos: [] },
    crear,
    extra: { cuentaPortalUrl: 'https://tejidosderealidad.com/cuenta' },
  });
  const r = await p;
  assert.equal(r.status, 403);
  assert.equal(r.body.error, 'correo_sin_verificar');
  assert.equal(r.body.confirmar_url, 'https://tejidosderealidad.com/cuenta');
  assert.equal(r.desenlace, 'correo_sin_verificar');
  assert.equal(t.checkout_intentos.length, 0);
  assert.equal(crear.llamadas.length, 0);
});

test('sin sesión → 401 sin tocar la base', async () => {
  const { p, client, crear } = preparar({ sesion: null });
  const r = await p;
  assert.equal(r.status, 401);
  assert.equal(client.llamadas.length, 0);
  assert.equal(crear.llamadas.length, 0);
});

test('sesión cerrada «en todos» (epoch distinto) → 401, no paga', async () => {
  const { p, t, crear } = preparar({ sesion: { aid: AID, ep: 1 } });
  const r = await p;
  assert.equal(r.status, 401);
  assert.equal(r.extra.motivo, 'epoch');
  assert.equal(t.checkout_intentos.length, 0);
  assert.equal(crear.llamadas.length, 0);
});

test('cuenta borrada → 401', async () => {
  const { p } = preparar({ tablas: { cuentas: [], checkout_intentos: [] } });
  assert.equal((await p).status, 401);
});

// ─── Configuración y fallos ─────────────────────────────────────────────────

test('sin variante del plan → 500 mal_configurado con aviso', async () => {
  const { p } = preparar({ extra: { variantes: { mensual: null, anual: '901' } } });
  const r = await p;
  assert.equal(r.status, 500);
  assert.equal(r.aviso, 'config');
  assert.deepEqual(r.extra, { falta: 'LS_VARIANT_SUSCRIPCION_MENSUAL' });
});

test('sin LS_CUSTOM_SECRET (o corto) → 500 sin crear nada', async () => {
  for (const secretCustom of [undefined, 'corto']) {
    const crear = espia();
    const { p, t } = preparar({ crear, extra: { secretCustom } });
    const r = await p;
    assert.equal(r.status, 500);
    assert.equal(r.aviso, 'config');
    assert.equal(t.checkout_intentos.length, 0);
    assert.equal(crear.llamadas.length, 0);
  }
});

test('sin cliente de Supabase → 503 y aviso', async () => {
  const r = await prepararCheckoutSuscripcion({
    sesion: { aid: AID, ep: 2 },
    plan: 'mensual',
    client: null,
    secretCustom: SECRET,
    variantes: VARIANTES,
    crearCheckout: espia().fn,
  });
  assert.equal(r.status, 503);
  assert.equal(r.aviso, 'config');
});

test('la base no responde al leer la cuenta → 503', async () => {
  const { p } = preparar({ opts: { fallar: { cuentas: { status: 0 } } } });
  assert.equal((await p).status, 503);
});

test('no se pudo guardar el intento → 503 y no se crea checkout (sin nonce no hay vínculo)', async () => {
  const crear = espia();
  const { p } = preparar({ crear, opts: { fallar: { checkout_intentos: { status: 500, op: 'insert' } } } });
  const r = await p;
  assert.equal(r.status, 503);
  assert.equal(crear.llamadas.length, 0);
});

test('LS falla → 502 error_proveedor', async () => {
  const { p } = preparar({ crear: espia({ ok: false, reason: 'api_error', status: 422, causa: 'estado_http' }) });
  const r = await p;
  assert.equal(r.status, 502);
  assert.equal(r.desenlace, 'error_proveedor');
});

test('URL de checkout de un host ajeno → 502 (esUrlDePago)', async () => {
  const { p } = preparar({ crear: espia({ ok: true, url: 'https://evil.example/checkout' }) });
  const r = await p;
  assert.equal(r.status, 502);
  assert.equal(r.body.error, 'invalid_checkout_url');
});

test('límite de ritmo: solo tras sesión y correo verificado, y antes de escribir nada', async () => {
  const vistos = [];
  const limitado = (aid) => {
    vistos.push(aid);
    return true;
  };
  // Sin verificar: 403, el límite ni se consulta.
  const a = preparar({ tablas: { cuentas: [cuenta({ email_verificado_at: null })], checkout_intentos: [] }, extra: { limitado } });
  assert.equal((await a.p).status, 403);
  assert.deepEqual(vistos, []);
  // Verificada y limitada: 429 sin intento ni checkout.
  const crear = espia();
  const b = preparar({ crear, extra: { limitado } });
  const r = await b.p;
  assert.equal(r.status, 429);
  assert.equal(r.desenlace, 'limitado_por_ritmo');
  assert.deepEqual(vistos, [AID]);
  assert.equal(b.t.checkout_intentos.length, 0);
  assert.equal(crear.llamadas.length, 0);
});

// ─── Piezas ─────────────────────────────────────────────────────────────────

test('interruptor: solo el literal true', () => {
  assert.equal(checkoutSuscripcionActivo({ SUSCRIPCION_CHECKOUT_ENABLED: 'true' }), true);
  assert.equal(checkoutSuscripcionActivo({ SUSCRIPCION_CHECKOUT_ENABLED: ' true ' }), true);
  assert.equal(checkoutSuscripcionActivo({ SUSCRIPCION_CHECKOUT_ENABLED: 'false' }), false);
  assert.equal(checkoutSuscripcionActivo({ SUSCRIPCION_CHECKOUT_ENABLED: '1' }), false);
  assert.equal(checkoutSuscripcionActivo({}), false);
});

test('variantesDePlan recorta y deja null lo vacío', () => {
  const env = { LS_VARIANT_SUSCRIPCION_MENSUAL: ' 900 ', LS_VARIANT_SUSCRIPCION_ANUAL: '' };
  assert.deepEqual(variantesDePlan((k) => env[k]), { mensual: '900', anual: null });
});

test('urlCuentaPortal: el origen de PORTAL_AUTORIZAR_URL, o producción', () => {
  assert.equal(urlCuentaPortal('https://tejidosderealidad.com/cuenta/autorizar'), 'https://tejidosderealidad.com/cuenta');
  assert.equal(urlCuentaPortal('https://tdr-git-x.vercel.app/cuenta/autorizar'), 'https://tdr-git-x.vercel.app/cuenta');
  assert.equal(urlCuentaPortal('http://localhost:4321/cuenta/autorizar'), 'http://localhost:4321/cuenta');
  assert.equal(urlCuentaPortal('http://evil.example/'), PORTAL_CUENTA_URL);
  assert.equal(urlCuentaPortal(undefined), PORTAL_CUENTA_URL);
});

test('correoPrecargable: nunca una dirección privaterelay de Apple', () => {
  assert.equal(correoPrecargable(' Ana@Correo.com '), 'ana@correo.com');
  assert.equal(correoPrecargable('x@privaterelay.appleid.com'), undefined);
  assert.equal(correoPrecargable(''), undefined);
  assert.equal(correoPrecargable(null), undefined);
});
