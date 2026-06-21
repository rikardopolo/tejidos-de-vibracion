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
    data: { id: 9999, attributes: { identifier: 'abc-uuid', order_number: 7, user_email: 'Foo@Bar.com', total: 2600, currency: 'USD', status: 'paid', test_mode: true } },
  };
  const p = parseOrderEvent(body, 'order_created');
  assert.equal(p.lsOrderId, '9999');
  assert.equal(p.lsOrderIdentifier, 'abc-uuid');
  assert.equal(p.email, 'foo@bar.com');
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
