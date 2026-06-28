/**
 * Checks del webhook de Lemon Squeezy. Stdlib node:test, sin deps.
 * Correr: node --test src/lib/lemonsqueezy-webhook.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { verifyLemonSignature, mapProductToNivel, parseOrderEvent } from './lemonsqueezy-webhook.mjs';

const SECRET = 'test-signing-secret';
const sign = (body) => crypto.createHmac('sha256', SECRET).update(body, 'utf8').digest('hex');

test('firma válida pasa', () => {
  const body = '{"a":1}';
  assert.equal(verifyLemonSignature(body, sign(body), SECRET), true);
});

test('firma de otro cuerpo falla', () => {
  assert.equal(verifyLemonSignature('{"a":1}', sign('{"a":2}'), SECRET), false);
});

test('firma de distinta longitud falla sin lanzar', () => {
  assert.equal(verifyLemonSignature('{}', 'deadbeef', SECRET), false);
});

test('sin firma o sin secret falla', () => {
  assert.equal(verifyLemonSignature('{}', null, SECRET), false);
  assert.equal(verifyLemonSignature('{}', sign('{}'), ''), false);
});

test('mapeo producto→nivel', () => {
  assert.deepEqual(mapProductToNivel('bundle-preventa'), { nivel: 2, expira: null });
  assert.deepEqual(mapProductToNivel('libro-completo'), { nivel: 3, expira: null });
  assert.equal(mapProductToNivel('inexistente'), null);
  assert.equal(mapProductToNivel(undefined), null);
});

test('parseOrderEvent: order_created normaliza campos', () => {
  const body = {
    meta: { event_name: 'order_created', custom_data: { lead_id: '42', product_slug: 'bundle-preventa' } },
    data: { id: 9999, attributes: { identifier: 'abc-uuid', order_number: 7, user_name: 'Juliana', user_email: 'Foo@Bar.com', total: 2600, currency: 'USD', status: 'paid', test_mode: true } },
  };
  const p = parseOrderEvent(body, 'order_created');
  assert.equal(p.lsOrderId, '9999');
  assert.equal(p.lsOrderIdentifier, 'abc-uuid');
  assert.equal(p.email, 'foo@bar.com');
  assert.equal(p.userName, 'Juliana');
  assert.equal(p.leadId, '42');
  assert.equal(p.productSlug, 'bundle-preventa');
  assert.equal(p.amountCents, 2600);
  assert.equal(p.status, 'paid');
  assert.equal(p.testMode, true);
});

test('parseOrderEvent: refund sin custom', () => {
  const p = parseOrderEvent(
    { data: { id: 1, attributes: { user_email: 'x@y.com', total: 2600, currency: 'USD', test_mode: false } }, meta: { custom_data: {} } },
    'order_refunded',
  );
  assert.equal(p.status, 'refunded');
  assert.equal(p.leadId, null);
  assert.equal(p.testMode, false);
});

test('parseOrderEvent: usa meta.event_name si falta el header', () => {
  const p = parseOrderEvent({ meta: { event_name: 'order_created' }, data: { id: 5, attributes: {} } }, undefined);
  assert.equal(p.status, 'paid');
  assert.equal(p.currency, 'USD'); // default
});

test('parseOrderEvent: evento no soportado → null', () => {
  assert.equal(parseOrderEvent({ data: { id: 1 } }, 'subscription_created'), null);
  assert.equal(parseOrderEvent({ data: { id: 1 }, meta: { event_name: 'order_created' } }, undefined) === null, false);
});

// ─── Hardening: camino del dinero · sin fallback silencioso ────────────────
// El handler NO debe otorgar nivel de pago si el producto no se reconoce.
// Aquí blindamos el contrato puro del que depende esa decisión.
test('hardening: producto desconocido NO mapea a nivel (sin fallback a nivel 2)', () => {
  // Antes el handler hacía `?? bundle-preventa` → nivel 2 a cualquier compra.
  assert.equal(mapProductToNivel('producto-que-no-existe'), null);
  assert.equal(mapProductToNivel(''), null);
  assert.equal(mapProductToNivel(null), null);
  assert.equal(mapProductToNivel(undefined), null);
});

test('hardening: slug nivel-3 (libro) ≠ slug nivel-2 (preventa) → ruta de tag correcta', () => {
  // El tag de Brevo se elige por nivel; estos niveles deben ser estables.
  for (const s of ['libro-completo', 'libro-epub', 'upgrade-libro']) {
    assert.equal(mapProductToNivel(s)?.nivel, 3, `${s} debe ser nivel 3`);
  }
  for (const s of ['bundle-preventa', 'bundle-normal', 'acto-2', 'acto-3']) {
    assert.equal(mapProductToNivel(s)?.nivel, 2, `${s} debe ser nivel 2`);
  }
});

test('hardening: parseOrderEvent sin product_slug NO inventa uno (handler decide no otorgar)', () => {
  const p = parseOrderEvent(
    { meta: { event_name: 'order_created', custom_data: {} }, data: { id: 77, attributes: { user_email: 'a@b.com' } } },
    'order_created',
  );
  // productSlug nulo → el handler loguea order_unknown_product y NO otorga acceso.
  assert.equal(p.productSlug, null);
  assert.equal(mapProductToNivel(p.productSlug), null);
});
