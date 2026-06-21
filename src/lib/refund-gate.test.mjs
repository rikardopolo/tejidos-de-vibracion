/**
 * refund-gate.test.mjs · Correr: node --test src/lib/refund-gate.test.mjs
 *
 * Cubre la rama de seguridad: revocar SOLO con evidencia clara de reembolso;
 * fail-open ante cualquier fallo de infraestructura.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveRefundGate } from './refund-gate.mjs';

const granted = { nivel: 2, slugs: ['bundle-preventa'] };
const REVOKED = { nivel: 0, slugs: [] };

test('orden paid → otorga el nivel del token', () => {
  const r = resolveRefundGate(granted, { orderId: 'o1', hasClient: true, queryError: false, order: { status: 'paid' } });
  assert.deepEqual(r, granted);
});

test('orden refunded → revoca', () => {
  const r = resolveRefundGate(granted, { orderId: 'o1', hasClient: true, queryError: false, order: { status: 'refunded' } });
  assert.deepEqual(r, REVOKED);
});

test('orden ausente (consulta OK, 0 filas) → revoca', () => {
  const r = resolveRefundGate(granted, { orderId: 'o1', hasClient: true, queryError: false, order: null });
  assert.deepEqual(r, REVOKED);
});

test('error de consulta → fail-open al token firmado', () => {
  const r = resolveRefundGate(granted, { orderId: 'o1', hasClient: true, queryError: true, order: null });
  assert.deepEqual(r, granted);
});

test('Supabase no disponible → fail-open', () => {
  const r = resolveRefundGate(granted, { orderId: 'o1', hasClient: false, queryError: false, order: null });
  assert.deepEqual(r, granted);
});

test('token sin orderId → fail-open (nada que verificar)', () => {
  const r = resolveRefundGate(granted, { orderId: null, hasClient: true, queryError: false, order: null });
  assert.deepEqual(r, granted);
});
