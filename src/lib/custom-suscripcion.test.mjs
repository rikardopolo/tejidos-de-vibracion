/**
 * custom-suscripcion.test.mjs · `custom` firmado del checkout (S-13).
 * Correr: node --test src/lib/custom-suscripcion.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {
  CUSTOM_MAX_EDAD_S,
  firmaCustom,
  firmarCustom,
  nuevoNonce,
  secretoCustomValido,
  verificarCustom,
} from './custom-suscripcion.mjs';

const SECRET = 'k'.repeat(40);
const AID = '11111111-2222-4333-8444-555555555555';
const NOW_S = 1_790_000_000;

const firmado = (extra = {}) => firmarCustom({ accountId: AID, nonce: nuevoNonce(), iat: NOW_S, ...extra }, SECRET);

test('round-trip: lo que se firma se verifica, con valores string', () => {
  const c = firmado();
  for (const v of Object.values(c)) assert.equal(typeof v, 'string');
  const r = verificarCustom(c, SECRET, { nowS: NOW_S });
  assert.deepEqual(r, { ok: true, accountId: AID, nonce: c.nonce, iat: NOW_S });
});

test('sig = HMAC-SHA256(secret, account_id|nonce|iat) en hex', () => {
  const c = firmado();
  const esperada = crypto.createHmac('sha256', SECRET).update(`${AID}|${c.nonce}|${NOW_S}`).digest('hex');
  assert.equal(c.sig, esperada);
  assert.equal(firmaCustom(AID, c.nonce, String(NOW_S), SECRET), esperada);
});

test('iat como número (LS lo devuelve en string, pero por si acaso) también vale', () => {
  const c = firmado();
  assert.equal(verificarCustom({ ...c, iat: NOW_S }, SECRET, { nowS: NOW_S }).ok, true);
});

test('cualquier campo cambiado rompe la firma', () => {
  const c = firmado();
  assert.equal(verificarCustom({ ...c, account_id: '99999999-2222-4333-8444-555555555555' }, SECRET, { nowS: NOW_S }).motivo, 'firma');
  assert.equal(verificarCustom({ ...c, nonce: nuevoNonce() }, SECRET, { nowS: NOW_S }).motivo, 'firma');
  assert.equal(verificarCustom({ ...c, iat: String(NOW_S - 1) }, SECRET, { nowS: NOW_S }).motivo, 'firma');
  assert.equal(verificarCustom(c, 'z'.repeat(40), { nowS: NOW_S }).motivo, 'firma');
});

test('edad: hasta 7 días vale; más, caducado; en el futuro (más de 5 min), rechazado', () => {
  const c = firmado();
  assert.equal(verificarCustom(c, SECRET, { nowS: NOW_S + CUSTOM_MAX_EDAD_S }).ok, true);
  assert.equal(verificarCustom(c, SECRET, { nowS: NOW_S + CUSTOM_MAX_EDAD_S + 1 }).motivo, 'caducado');
  assert.equal(verificarCustom(c, SECRET, { nowS: NOW_S - 10 * 60 }).motivo, 'futuro');
  assert.equal(verificarCustom(c, SECRET, { nowS: NOW_S - 60 }).ok, true);
});

test('sin custom, campos rotos o sin secreto', () => {
  assert.equal(verificarCustom(null, SECRET, { nowS: NOW_S }).motivo, 'sin_custom');
  assert.equal(verificarCustom({}, SECRET, { nowS: NOW_S }).motivo, 'sin_custom');
  assert.equal(verificarCustom({ product_slug: 'suscripcion-libro' }, SECRET, { nowS: NOW_S }).motivo, 'sin_custom');
  assert.equal(verificarCustom([], SECRET, { nowS: NOW_S }).motivo, 'sin_custom');
  const c = firmado();
  assert.equal(verificarCustom({ ...c, sig: 'xyz' }, SECRET, { nowS: NOW_S }).motivo, 'campos');
  assert.equal(verificarCustom({ ...c, account_id: 'no-uuid' }, SECRET, { nowS: NOW_S }).motivo, 'campos');
  assert.equal(verificarCustom({ ...c, iat: 'ayer' }, SECRET, { nowS: NOW_S }).motivo, 'campos');
  assert.equal(verificarCustom(c, undefined, { nowS: NOW_S }).motivo, 'sin_secreto');
  assert.equal(verificarCustom(c, 'corto', { nowS: NOW_S }).motivo, 'sin_secreto');
});

test('firmarCustom falla cerrado', () => {
  assert.equal(firmarCustom({ accountId: AID, nonce: nuevoNonce(), iat: NOW_S }, 'corto'), null);
  assert.equal(firmarCustom({ accountId: 'x', nonce: nuevoNonce(), iat: NOW_S }, SECRET), null);
  assert.equal(firmarCustom({ accountId: AID, nonce: 'corto', iat: NOW_S }, SECRET), null);
  assert.equal(firmarCustom({ accountId: AID, nonce: nuevoNonce(), iat: 1.5 }, SECRET), null);
});

test('la firma se compara en tiempo constante', () => {
  const original = crypto.timingSafeEqual;
  let llamadas = 0;
  crypto.timingSafeEqual = (a, b) => {
    llamadas++;
    return original(a, b);
  };
  try {
    verificarCustom(firmado(), SECRET, { nowS: NOW_S });
  } finally {
    crypto.timingSafeEqual = original;
  }
  assert.equal(llamadas, 1);
});

test('nuevoNonce: 43 caracteres base64url, distinto cada vez; secretoCustomValido recorta', () => {
  const a = nuevoNonce();
  assert.match(a, /^[A-Za-z0-9_-]{43}$/);
  assert.notEqual(a, nuevoNonce());
  assert.equal(secretoCustomValido(`  ${SECRET}  `), SECRET);
  assert.equal(secretoCustomValido('x'.repeat(31)), null);
});
