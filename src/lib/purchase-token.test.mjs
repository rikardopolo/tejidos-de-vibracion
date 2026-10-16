/**
 * Checks del token de compra. Stdlib node:test, sin deps.
 * Correr: node --test src/lib/purchase-token.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { generatePurchaseToken, verifyPurchaseToken, looksLikePurchaseToken } from './purchase-token.mjs';

const S = 'secreto-de-prueba';

test('round-trip nivel 2 + slugs + orderId', () => {
  const t = generatePurchaseToken({ email: '  Foo@Bar.com ', nivel: 2, slugs: ['bundle-preventa'], orderId: '9999' }, S);
  const r = verifyPurchaseToken(t, S);
  assert.equal(r.valid, true);
  assert.equal(r.email, 'foo@bar.com'); // normalizado
  assert.equal(r.nivel, 2);
  assert.deepEqual(r.slugs, ['bundle-preventa']);
  assert.equal(r.orderId, '9999');
});

test('round-trip nivel 3 sin slugs', () => {
  const r = verifyPurchaseToken(generatePurchaseToken({ email: 'a@b.com', nivel: 3, slugs: [] }, S), S);
  assert.equal(r.valid, true);
  assert.equal(r.nivel, 3);
  assert.deepEqual(r.slugs, []);
  assert.equal(r.orderId, null);
});

test('S-13: el claim u (suscripción) ya no se emite', () => {
  const t = generatePurchaseToken(
    { email: 'a@b.com', nivel: 2, slugs: ['bundle-preventa'], orderId: '1', subscriptionId: 'sub-uuid-1' },
    S,
  );
  const payload = JSON.parse(Buffer.from(t.split('.')[0], 'base64url').toString('utf8'));
  assert.equal('u' in payload, false);
  assert.equal('subscriptionId' in verifyPurchaseToken(t, S), false);
});

test('S-13: un token viejo que lleve u sigue valiendo como compra y u no se lee', () => {
  // Firmado a mano con el formato de la rama F2 (claim u): verifica, pero el
  // resultado no expone ninguna marca de suscripción que el gate pudiera usar.
  const body = Buffer.from(
    JSON.stringify({ e: 'a@b.com', n: 2, s: ['bundle-preventa'], o: '1', u: 'sub-uuid-1', t: Date.now() }),
    'utf8',
  ).toString('base64url');
  const sig = crypto.createHmac('sha256', S).update(body).digest('hex');
  const r = verifyPurchaseToken(`${body}.${sig}`, S);
  assert.equal(r.valid, true);
  assert.equal(r.orderId, '1');
  assert.equal('subscriptionId' in r, false);
});

test('un token de compra con orderId sigue valiendo', () => {
  const r = verifyPurchaseToken(generatePurchaseToken({ email: 'a@b.com', nivel: 2, slugs: [], orderId: '1' }, S), S);
  assert.equal(r.valid, true);
  assert.equal(r.orderId, '1');
});

test('firma con otro secret falla', () => {
  const t = generatePurchaseToken({ email: 'a@b.com', nivel: 2, slugs: [] }, S);
  assert.equal(verifyPurchaseToken(t, 'otro-secreto').valid, false);
});

test('token manipulado falla (bad_signature)', () => {
  const t = generatePurchaseToken({ email: 'a@b.com', nivel: 2, slugs: [] }, S);
  const tampered = t.slice(0, -2) + (t.endsWith('aa') ? 'bb' : 'aa');
  assert.equal(verifyPurchaseToken(tampered, S).valid, false);
});

test('looksLikePurchaseToken distingue del token de registro', () => {
  const purchase = generatePurchaseToken({ email: 'a@b.com', nivel: 2, slugs: [] }, S);
  assert.equal(looksLikePurchaseToken(purchase), true); // exactamente 1 punto
  assert.equal(looksLikePurchaseToken('unsoloblobbase64urlsinpuntos'), false); // 0 puntos (registro)
  assert.equal(looksLikePurchaseToken('a.b.c'), false); // 2 puntos
  assert.equal(looksLikePurchaseToken(''), false);
});

test('un token de registro (0 puntos) no valida como compra', () => {
  // Simula el formato del token de registro: base64url de "email.ts.sig", sin puntos crudos.
  const fakeRegistro = Buffer.from('a@b.com.123.deadbeef', 'utf8').toString('base64url');
  assert.equal(looksLikePurchaseToken(fakeRegistro), false);
  assert.equal(verifyPurchaseToken(fakeRegistro, S).valid, false);
});
