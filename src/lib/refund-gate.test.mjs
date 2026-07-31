/**
 * refund-gate.test.mjs · Correr: node --test src/lib/refund-gate.test.mjs
 *
 * Cubre la política MIXTA: abierto ante fallo de infraestructura, cerrado ante
 * fallo de dato. Los dos ejes se testean por separado porque son decisiones
 * distintas que se toman en la misma función.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveRefundGate } from './refund-gate.mjs';

const granted = { nivel: 2, slugs: ['bundle-preventa'] };
const REVOCADO = { nivel: 0, slugs: [] };
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

// --- Eje "abierto en caída": la infraestructura falla, no el dato ---

test('error de consulta → mantiene el token (fail-open de infraestructura)', () => {
  assert.deepEqual(resolveRefundGate(granted, ok({ queryError: true })), granted);
});

test('Supabase no disponible → mantiene el token (fail-open de infraestructura)', () => {
  assert.deepEqual(resolveRefundGate(granted, ok({ hasClient: false })), granted);
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
