/**
 * refund-gate.test.mjs · Correr: node --test src/lib/refund-gate.test.mjs
 *
 * Cubre la política MIXTA: abierto ante un error de consulta, cerrado ante
 * configuración rota (sin cliente, C8) y ante fallo de dato. Los ejes se testean
 * por separado porque son decisiones distintas que se toman en la misma función.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveRefundGate } from './refund-gate.mjs';

const granted = { nivel: 2, slugs: ['bundle-preventa'] };
// Revocar = volver a nivel 1 (registro), NO a 0: un reembolsado sigue registrado y
// conserva Obertura + Acto I. Con el código viejo (nivel 0) todo test que use
// REVOCADO se pone en rojo: ese es el control negativo del arreglo.
const REVOCADO = { nivel: 1, slugs: [] };
const ok = (extra) => ({ orderId: 'o1', hasClient: true, queryError: false, order: null, ...extra });

test('orden paid → mantiene el nivel del token', () => {
  assert.deepEqual(resolveRefundGate(granted, ok({ order: { status: 'paid' } })), granted);
});

test('orden refunded → revoca', () => {
  assert.deepEqual(resolveRefundGate(granted, ok({ order: { status: 'refunded' } })), REVOCADO);
});

test('orden disputed → revoca (chargeback en curso)', () => {
  assert.deepEqual(resolveRefundGate(granted, ok({ order: { status: 'disputed' } })), REVOCADO);
});

test('orden pending → revoca (aún no confirmada)', () => {
  assert.deepEqual(resolveRefundGate(granted, ok({ order: { status: 'pending' } })), REVOCADO);
});

test('orden ausente con consulta OK → revoca (el token apunta a nada)', () => {
  assert.deepEqual(resolveRefundGate(granted, ok({ order: null })), REVOCADO);
});

// --- Eje "abierto en caída": la consulta falla, no el dato (hasta S-13 y su marca `ent`) ---

test('error de consulta → mantiene el token (fail-open de infraestructura, hasta S-13)', () => {
  assert.deepEqual(resolveRefundGate(granted, ok({ queryError: true })), granted);
});

// --- Configuración rota (C8): sin cliente de Supabase se CIERRA ---

test('sin cliente de Supabase (hasClient:false) → REVOCA (configuración rota, C8)', () => {
  assert.deepEqual(resolveRefundGate(granted, ok({ hasClient: false })), REVOCADO);
});

test('sin cliente y además con error de consulta → revoca (la config rota manda)', () => {
  assert.deepEqual(resolveRefundGate(granted, ok({ hasClient: false, queryError: true })), REVOCADO);
});

test('sin cliente revoca también el nivel 3', () => {
  assert.deepEqual(resolveRefundGate({ nivel: 3, slugs: [] }, ok({ hasClient: false, order: { status: 'paid' } })), REVOCADO);
});

// --- Eje "cerrado en dato": el caso que cambió respecto a la versión anterior ---

test('token sin orderId → REVOCA, aunque la infraestructura esté sana', () => {
  assert.deepEqual(resolveRefundGate(granted, ok({ orderId: null })), REVOCADO);
});

test('token sin orderId → revoca también con Supabase caído (dato manda sobre caída)', () => {
  assert.deepEqual(resolveRefundGate(granted, ok({ orderId: null, hasClient: false })), REVOCADO);
});

test('el resultado revocado no se comparte entre llamadas', () => {
  const a = resolveRefundGate(granted, ok({ order: { status: 'refunded' } }));
  a.slugs.push('contaminado');
  const b = resolveRefundGate(granted, ok({ order: { status: 'refunded' } }));
  assert.deepEqual(b, REVOCADO);
});

test('nivel 3 se conserva íntegro cuando la orden está paid', () => {
  const g3 = { nivel: 3, slugs: [] };
  assert.deepEqual(resolveRefundGate(g3, ok({ order: { status: 'paid' } })), g3);
});

// --- Bug corregido (F2, 18-sep-2026): revocar no puede bajar de nivel 1 ---

test('revocar deja nivel 1, nunca 0: el reembolsado conserva Obertura + Acto I', () => {
  // El token de compra solo lo tiene quien ya se registró (nivel 1). Perder la
  // compra no borra el registro: el gate debe devolver 1, no expulsar a visitante.
  const r = resolveRefundGate(granted, ok({ order: { status: 'refunded' } }));
  assert.equal(r.nivel, 1);
  assert.notEqual(r.nivel, 0);
});
