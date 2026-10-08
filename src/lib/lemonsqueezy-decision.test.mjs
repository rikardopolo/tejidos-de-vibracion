/**
 * Decisión del webhook de Lemon Squeezy con payloads FIRMADOS · stdlib node:test.
 * Correr: node --test src/lib/lemonsqueezy-decision.test.mjs
 *
 * Cubre S-05 (PR 1): el producto y el nivel salen de `first_order_item.variant_id`
 * (mapa `LS_VARIANT_*`), no de `custom_data.product_slug`; las órdenes de
 * suscripción no crean orden ni token; una variante desconocida va al camino
 * `order_unknown_product`; Test Mode se ignora salvo `LS_ACEPTAR_TEST_MODE`; un
 * reembolso parcial no revoca. El handler .ts solo ejecuta la decisión: solo la
 * acción `procesar` (con su `producto`) escribe `orders` y emite el token.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {
  decidirEntrega,
  buildVariantMap,
  aceptarTestMode,
  envVarDeVariante,
  PREFIJO_VARIANTE_SUSCRIPCION,
} from './lemonsqueezy-webhook.mjs';

const SECRET = 'test-signing-secret';
const sign = (body) => crypto.createHmac('sha256', SECRET).update(body, 'utf8').digest('hex');

const ENV = {
  LS_VARIANT_BUNDLE_PREVENTA: '111',
  LS_VARIANT_LIBRO_COMPLETO: '333',
  LS_VARIANT_SUSCRIPCION_MENSUAL: '900',
  LS_VARIANT_SUSCRIPCION_ANUAL: ' 901 ',
  OTRA_COSA: '111',
};
const VARIANTES = buildVariantMap(ENV);

/** Payload de orden como lo manda LS (variant_id numérico, custom en strings). */
function orden({
  evento = 'order_created',
  variantId = 111,
  productSlug = 'bundle-preventa',
  status = 'paid',
  testMode = false,
  extra = {},
} = {}) {
  return {
    meta: {
      event_name: evento,
      test_mode: testMode,
      custom_data: productSlug === undefined ? {} : { product_slug: productSlug, lead_id: '42' },
    },
    data: {
      type: 'orders',
      id: 4242,
      attributes: {
        identifier: 'uuid-4242',
        user_email: 'Ana@Correo.com',
        user_name: 'Ana',
        total: 2600,
        currency: 'USD',
        status,
        test_mode: testMode,
        ...(variantId === null ? {} : { first_order_item: { id: 1, product_id: 7, variant_id: variantId } }),
        ...extra,
      },
    },
  };
}

/** Firma el cuerpo exacto y decide, como hace el handler. */
function entregar(body, { aceptar = false, variantes = VARIANTES, firma, raw, cabecera } = {}) {
  const cuerpo = raw ?? JSON.stringify(body);
  return decidirEntrega({
    raw: cuerpo,
    signature: firma ?? sign(cuerpo),
    secret: SECRET,
    // `cabecera` simula una X-Event-Name distinta del nombre firmado en el cuerpo.
    eventName: cabecera !== undefined ? cabecera : body?.meta?.event_name,
    variantes,
    aceptarTestMode: aceptar,
  });
}

// ─── El variant_id manda ─────────────────────────────────────────────────────

test('orden de la preventa → procesar con el slug y el nivel de su variante', () => {
  const d = entregar(orden());
  assert.equal(d.accion, 'procesar');
  assert.deepEqual(d.producto, { slug: 'bundle-preventa', nivel: 2, expira: null });
  assert.equal(d.parsed.variantId, '111');
  assert.equal(d.parsed.email, 'ana@correo.com');
});

test('product_slug alterado hacia ARRIBA (libro-completo) → manda el variant_id (nivel 2)', () => {
  const d = entregar(orden({ variantId: 111, productSlug: 'libro-completo' }));
  assert.equal(d.accion, 'procesar');
  assert.deepEqual(d.producto, { slug: 'bundle-preventa', nivel: 2, expira: null });
  // El custom queda solo como dato informativo.
  assert.equal(d.parsed.productSlug, 'libro-completo');
});

test('product_slug alterado hacia ABAJO → manda el variant_id (nivel 3)', () => {
  const d = entregar(orden({ variantId: 333, productSlug: 'bundle-preventa' }));
  assert.equal(d.accion, 'procesar');
  assert.deepEqual(d.producto, { slug: 'libro-completo', nivel: 3, expira: null });
});

test('sin product_slug en custom, la variante conocida basta', () => {
  const d = entregar(orden({ productSlug: undefined }));
  assert.equal(d.accion, 'procesar');
  assert.equal(d.producto.slug, 'bundle-preventa');
});

test('product_slug inventado no cambia nada: decide la variante', () => {
  const d = entregar(orden({ productSlug: 'regalo-gratis' }));
  assert.equal(d.accion, 'procesar');
  assert.equal(d.producto.slug, 'bundle-preventa');
});

// ─── Suscripción: sin orden one-time ni token ───────────────────────────────

test('orden de una variante de suscripción → ignorada (sin producto: ni orden ni token)', () => {
  const d = entregar(orden({ variantId: 900, productSlug: undefined }));
  assert.equal(d.accion, 'suscripcion_ignorada');
  assert.equal('producto' in d, false);
  assert.equal(d.parsed.lsOrderId, '4242');
});

test('cualquier LS_VARIANT_SUSCRIPCION* cuenta (valor con espacios incluido)', () => {
  assert.equal(entregar(orden({ variantId: 901 })).accion, 'suscripcion_ignorada');
});

test('custom product_slug suscripcion-libro → ignorada aunque la variante sea de pago único', () => {
  // El custom solo puede QUITAR: es la fuga de libro.md §4.1 (order_created
  // acompaña a subscription_created con el mismo custom_data).
  const d = entregar(orden({ variantId: 111, productSlug: 'suscripcion-libro' }));
  assert.equal(d.accion, 'suscripcion_ignorada');
});

test('reembolso de una orden de suscripción → también ignorado por el camino de órdenes', () => {
  const d = entregar(orden({ evento: 'order_refunded', variantId: 900, status: 'refunded' }));
  assert.equal(d.accion, 'suscripcion_ignorada');
});

test('una variante a la vez de pago único y de suscripción se trata como suscripción', () => {
  const v = buildVariantMap({ LS_VARIANT_BUNDLE_PREVENTA: '111', LS_VARIANT_SUSCRIPCION_X: '111' });
  assert.equal(v.unica.has('111'), false);
  assert.equal(entregar(orden({ variantId: 111 }), { variantes: v }).accion, 'suscripcion_ignorada');
});

// ─── Variante desconocida → order_unknown_product ───────────────────────────

test('variante desconocida → producto_desconocido (aunque el custom diga un slug válido)', () => {
  const d = entregar(orden({ variantId: 555, productSlug: 'bundle-preventa' }));
  assert.equal(d.accion, 'producto_desconocido');
  assert.equal(d.parsed.variantId, '555');
});

test('sin first_order_item → producto_desconocido', () => {
  assert.equal(entregar(orden({ variantId: null })).accion, 'producto_desconocido');
});

test('sin ninguna LS_VARIANT_* configurada → producto_desconocido (nunca nivel por defecto)', () => {
  const d = entregar(orden(), { variantes: buildVariantMap({}) });
  assert.equal(d.accion, 'producto_desconocido');
});

test('dos slugs con el mismo id → ambigua: no da acceso y se reporta', () => {
  const v = buildVariantMap({ LS_VARIANT_BUNDLE_PREVENTA: '111', LS_VARIANT_BUNDLE_NORMAL: '111' });
  assert.deepEqual(v.ambiguas, ['111']);
  assert.equal(entregar(orden(), { variantes: v }).accion, 'producto_desconocido');
});

// ─── Test Mode (C13) ────────────────────────────────────────────────────────

test('meta.test_mode=true → test_mode_ignorado, nada más', () => {
  const d = entregar(orden({ testMode: true }));
  assert.equal(d.accion, 'test_mode_ignorado');
  assert.equal(d.eventName, 'order_created');
  assert.equal(d.lsOrderId, '4242');
  assert.equal('parsed' in d, false);
});

test('solo el atributo test_mode=true también cuenta como Test Mode', () => {
  const body = orden();
  body.data.attributes.test_mode = true;
  assert.equal(entregar(body).accion, 'test_mode_ignorado');
});

test('Test Mode en un evento de suscripción → test_mode_ignorado', () => {
  const body = { meta: { event_name: 'subscription_created', test_mode: true }, data: { type: 'subscriptions', id: 77, attributes: {} } };
  const d = entregar(body);
  assert.equal(d.accion, 'test_mode_ignorado');
  assert.equal(d.eventName, 'subscription_created');
});

test('Test Mode ACEPTADO (LS_ACEPTAR_TEST_MODE) → se procesa y la fila sale test_mode', () => {
  const d = entregar(orden({ testMode: true }), { aceptar: aceptarTestMode({ LS_ACEPTAR_TEST_MODE: 'true' }) });
  assert.equal(d.accion, 'procesar');
  assert.equal(d.parsed.testMode, true);
  assert.equal(d.producto.slug, 'bundle-preventa');
});

test('aceptarTestMode: solo el literal true y nunca en producción', () => {
  assert.equal(aceptarTestMode({}), false);
  assert.equal(aceptarTestMode({ LS_ACEPTAR_TEST_MODE: '' }), false);
  assert.equal(aceptarTestMode({ LS_ACEPTAR_TEST_MODE: '1' }), false);
  assert.equal(aceptarTestMode({ LS_ACEPTAR_TEST_MODE: ' true ' }), true);
  assert.equal(aceptarTestMode({ LS_ACEPTAR_TEST_MODE: 'true', VERCEL_ENV: 'preview' }), true);
  assert.equal(aceptarTestMode({ LS_ACEPTAR_TEST_MODE: 'true', VERCEL_ENV: 'production' }), false);
});

test('aceptarTestMode sin argumento lee process.env en cada llamada', () => {
  const antes = process.env.LS_ACEPTAR_TEST_MODE;
  const antesEnv = process.env.VERCEL_ENV;
  try {
    delete process.env.VERCEL_ENV;
    delete process.env.LS_ACEPTAR_TEST_MODE;
    assert.equal(aceptarTestMode(), false);
    process.env.LS_ACEPTAR_TEST_MODE = 'true';
    assert.equal(aceptarTestMode(), true);
  } finally {
    if (antes === undefined) delete process.env.LS_ACEPTAR_TEST_MODE;
    else process.env.LS_ACEPTAR_TEST_MODE = antes;
    if (antesEnv === undefined) delete process.env.VERCEL_ENV;
    else process.env.VERCEL_ENV = antesEnv;
  }
});

// ─── Reembolsos ─────────────────────────────────────────────────────────────

test('order_refunded con status partial_refund → reembolso_parcial (NO revoca)', () => {
  const d = entregar(orden({ evento: 'order_refunded', status: 'partial_refund', extra: { refunded_amount: 1000 } }));
  assert.equal(d.accion, 'reembolso_parcial');
  assert.equal('producto' in d, false);
  assert.equal(d.parsed.orderStatus, 'partial_refund');
  assert.equal(d.parsed.refundedAmountCents, 1000);
});

test('order_refunded completo → procesar como refunded (revoca)', () => {
  const d = entregar(orden({ evento: 'order_refunded', status: 'refunded', extra: { refunded_amount: 2600 } }));
  assert.equal(d.accion, 'procesar');
  assert.equal(d.parsed.status, 'refunded');
  assert.equal(d.producto.slug, 'bundle-preventa');
});

test('reembolso completo de una variante desconocida → producto_desconocido (el handler busca la orden guardada)', () => {
  const d = entregar(orden({ evento: 'order_refunded', status: 'refunded', variantId: 555 }));
  assert.equal(d.accion, 'producto_desconocido');
  assert.equal(d.parsed.status, 'refunded');
});

// ─── Firma, JSON y eventos ajenos ───────────────────────────────────────────

test('firma inválida → firma_invalida, antes de mirar Test Mode o el producto', () => {
  const body = orden({ testMode: true });
  assert.equal(entregar(body, { firma: sign('{"otro":1}') }).accion, 'firma_invalida');
  assert.equal(entregar(body, { firma: '' }).accion, 'firma_invalida');
});

test('cuerpo firmado que no es JSON → json_invalido', () => {
  assert.equal(entregar(null, { raw: 'no-es-json' }).accion, 'json_invalido');
});

test('evento que no es de orden ni de suscripción (sin Test Mode) → evento_ignorado', () => {
  const body = { meta: { event_name: 'customer_updated', test_mode: false }, data: { type: 'customers', id: 77, attributes: {} } };
  const d = entregar(body);
  assert.equal(d.accion, 'evento_ignorado');
  assert.equal(d.eventName, 'customer_updated');
});

test('subscription_payment_* sigue ignorado (fuera de S-13: facturas e impagos son F3-L)', () => {
  for (const ev of ['subscription_payment_success', 'subscription_payment_failed', 'subscription_payment_recovered', 'subscription_payment_refunded']) {
    const body = { meta: { event_name: ev, test_mode: false }, data: { type: 'subscription-invoices', id: 5, attributes: { status: 'paid' } } };
    assert.equal(entregar(body).accion, 'evento_ignorado', ev);
  }
});

test('subscription_created bien formado → suscripcion (S-13), con el objeto normalizado', () => {
  const body = {
    meta: { event_name: 'subscription_created', test_mode: false, custom_data: { account_id: 'x' } },
    data: { type: 'subscriptions', id: 77, attributes: { status: 'active', variant_id: 900, user_email: 'Ana@Correo.com', renews_at: '2026-11-07T12:00:00.000000Z' } },
  };
  const d = entregar(body);
  assert.equal(d.accion, 'suscripcion');
  assert.equal(d.sub.providerSubscriptionId, '77');
  assert.equal(d.sub.variantId, '900');
  assert.equal(d.sub.email, 'ana@correo.com');
  assert.equal(d.sub.renewsAt, '2026-11-07T12:00:00.000Z');
  assert.deepEqual(d.sub.custom, { account_id: 'x' });
});

test('subscription_* con un status que la tabla no admite → suscripcion_invalida', () => {
  const body = { meta: { event_name: 'subscription_updated', test_mode: false }, data: { type: 'subscriptions', id: 77, attributes: { status: 'raro', variant_id: 900 } } };
  assert.equal(entregar(body).accion, 'suscripcion_invalida');
});

// ─── X-Event-Name no está firmada: manda meta.event_name ─────────────────────

test('cabecera X-Event-Name cambiada a order_refunded sobre un order_created firmado → NO revoca', () => {
  // Repetición de un cuerpo firmado con la cabecera alterada: el nombre firmado manda.
  const d = entregar(orden(), { cabecera: 'order_refunded' });
  assert.equal(d.accion, 'procesar');
  assert.equal(d.parsed.status, 'paid');
  assert.equal(d.parsed.eventName, 'order_created');
});

test('cabecera order_created sobre un subscription_created firmado → manda el nombre firmado (suscripción, nunca orden)', () => {
  const body = { meta: { event_name: 'subscription_created', test_mode: false }, data: { type: 'subscriptions', id: 77, attributes: { status: 'active', variant_id: 111 } } };
  const d = entregar(body, { cabecera: 'order_created' });
  assert.equal(d.accion, 'suscripcion');
  assert.equal(d.sub.eventName, 'subscription_created');
});

test('sin meta.event_name en el cuerpo, la cabecera sirve de respaldo', () => {
  const body = orden();
  delete body.meta.event_name;
  const d = entregar(body, { cabecera: 'order_created' });
  assert.equal(d.accion, 'procesar');
  assert.equal(d.parsed.eventName, 'order_created');
});

// ─── Mapa de variantes ──────────────────────────────────────────────────────

test('convención de nombres: slug → LS_VARIANT_<SLUG>', () => {
  assert.equal(envVarDeVariante('bundle-preventa'), 'LS_VARIANT_BUNDLE_PREVENTA');
  assert.equal(envVarDeVariante('libro-completo'), 'LS_VARIANT_LIBRO_COMPLETO');
  // El slug de la suscripción cae, por nombre, en el prefijo de suscripción.
  assert.ok(envVarDeVariante('suscripcion-libro').startsWith(PREFIJO_VARIANTE_SUSCRIPCION));
});

test('buildVariantMap: ignora vacíos y variables ajenas; recorta espacios', () => {
  const v = buildVariantMap({ ...ENV, LS_VARIANT_ACTO_2: '   ', LS_VARIANT_UPGRADE_LIBRO: undefined });
  assert.deepEqual([...v.unica.entries()].sort(), [
    ['111', 'bundle-preventa'],
    ['333', 'libro-completo'],
  ]);
  assert.deepEqual([...v.suscripcion].sort(), ['900', '901']);
  assert.deepEqual(v.ambiguas, []);
  assert.deepEqual(buildVariantMap(undefined).unica.size, 0);
});
