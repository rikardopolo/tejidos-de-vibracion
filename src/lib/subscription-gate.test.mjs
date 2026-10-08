/**
 * subscription-gate.test.mjs · Correr: node --test src/lib/subscription-gate.test.mjs
 *
 * Un caso por estado de `subscriptions.status`, más los controles negativos que
 * separan «concede» de «niega» en los dos estados con reloj (cancelled/ends_at y
 * past_due/gracia): un test que solo viera el lado que concede no probaría que la
 * fecha se mira.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveSubscriptionGate, GRACIA_MS } from './subscription-gate.mjs';
import { SLUG_NIVEL } from './product-slugs.mjs';

const DIA = 24 * 60 * 60 * 1000;
const NOW = new Date('2026-10-01T12:00:00Z');
// Fecha relativa a NOW, en ISO como la devuelve Supabase (timestamptz → string).
const iso = (offsetMs) => new Date(NOW.getTime() + offsetMs).toISOString();
const DENEGADO = { nivel: 1, slugs: [] };

function concede(r) {
  assert.equal(r.nivel, 2);
  assert.ok(r.slugs.includes('suscripcion-libro'), 'lleva el slug de la suscripción');
  assert.ok(r.slugs.includes('acto-2'), 'abre el Cap. 4 (productoSlug: acto-2)');
}

test('GRACIA_MS son 7 días', () => {
  assert.equal(GRACIA_MS, 7 * DIA);
});

// --- Un caso por estado ---

test('active → nivel 2', () => {
  concede(resolveSubscriptionGate({ status: 'active' }, NOW));
});

test('on_trial → nivel 2', () => {
  concede(resolveSubscriptionGate({ status: 'on_trial' }, NOW));
});

test('cancelled con ends_at futuro → nivel 2 (pagó el periodo)', () => {
  concede(resolveSubscriptionGate({ status: 'cancelled', ends_at: iso(+3 * DIA) }, NOW));
});

test('past_due dentro de la gracia → nivel 2', () => {
  // Venció hace 6 días: con 7 de gracia todavía abre.
  concede(resolveSubscriptionGate({ status: 'past_due', current_period_end: iso(-6 * DIA) }, NOW));
});

test('paused con pause.mode free → nivel 2 (LS: pausa que no corta acceso)', () => {
  concede(resolveSubscriptionGate({ status: 'paused', pause: { mode: 'free' } }, NOW));
});

test('paused con pause.mode void → nivel 1', () => {
  assert.deepEqual(resolveSubscriptionGate({ status: 'paused', pause: { mode: 'void' } }, NOW), DENEGADO);
});

test('paused sin objeto pause → nivel 1', () => {
  assert.deepEqual(resolveSubscriptionGate({ status: 'paused' }, NOW), DENEGADO);
});

test('expired → nivel 1', () => {
  assert.deepEqual(resolveSubscriptionGate({ status: 'expired', ends_at: iso(+30 * DIA) }, NOW), DENEGADO);
});

test('unpaid → nivel 1 (LS con dunning apagado se queda aquí sin expirar jamás)', () => {
  assert.deepEqual(resolveSubscriptionGate({ status: 'unpaid', current_period_end: iso(-1 * DIA) }, NOW), DENEGADO);
});

test('status desconocido → nivel 1 (si no sabemos qué es, no abre)', () => {
  assert.deepEqual(resolveSubscriptionGate({ status: 'ACTIVE' }, NOW), DENEGADO);
  assert.deepEqual(resolveSubscriptionGate({ status: '' }, NOW), DENEGADO);
});

test('fila ausente → nivel 1 (se pudo mirar y no hay suscripción)', () => {
  assert.deepEqual(resolveSubscriptionGate(null, NOW), DENEGADO);
  assert.deepEqual(resolveSubscriptionGate(undefined, NOW), DENEGADO);
});

// --- Controles negativos: el reloj se mira de verdad ---

test('CONTROL · cancelled con ends_at pasado → nivel 1', () => {
  assert.deepEqual(resolveSubscriptionGate({ status: 'cancelled', ends_at: iso(-1) }, NOW), DENEGADO);
});

test('CONTROL · cancelled sin ends_at → nivel 1 (fecha que falta nunca concede)', () => {
  assert.deepEqual(resolveSubscriptionGate({ status: 'cancelled' }, NOW), DENEGADO);
  assert.deepEqual(resolveSubscriptionGate({ status: 'cancelled', ends_at: null }, NOW), DENEGADO);
});

test('CONTROL · past_due fuera de la gracia → nivel 1', () => {
  // Venció hace 8 días: 7 de gracia ya pasaron.
  assert.deepEqual(resolveSubscriptionGate({ status: 'past_due', current_period_end: iso(-8 * DIA) }, NOW), DENEGADO);
});

test('CONTROL · past_due justo al agotarse la gracia → nivel 1 (frontera cerrada)', () => {
  assert.deepEqual(resolveSubscriptionGate({ status: 'past_due', current_period_end: iso(-GRACIA_MS) }, NOW), DENEGADO);
});

test('CONTROL · past_due sin current_period_end → nivel 1', () => {
  assert.deepEqual(resolveSubscriptionGate({ status: 'past_due' }, NOW), DENEGADO);
});

test('la gracia es parametrizable: con 0 ms past_due cierra en current_period_end', () => {
  const sub = { status: 'past_due', current_period_end: iso(-1) };
  assert.deepEqual(resolveSubscriptionGate(sub, NOW, 0), DENEGADO);
  concede(resolveSubscriptionGate(sub, NOW, DIA));
});

// --- Forma del resultado ---

test('nunca devuelve nivel 0: el suscriptor sigue registrado', () => {
  for (const status of ['expired', 'unpaid', 'paused', 'cancelled', 'past_due', 'lo-que-sea']) {
    assert.equal(resolveSubscriptionGate({ status }, NOW).nivel, 1, status);
  }
});

test('el scope concedido es exactamente el nivel 2 del catálogo (ni nivel 3 ni inventados)', () => {
  const r = resolveSubscriptionGate({ status: 'active' }, NOW);
  const nivel2 = Object.keys(SLUG_NIVEL).filter((s) => SLUG_NIVEL[s].nivel === 2);
  assert.deepEqual([...r.slugs].sort(), [...nivel2].sort());
  assert.ok(!r.slugs.includes('libro-completo'), 'el PDF completo no entra por suscripción');
});

test('el resultado no se comparte entre llamadas', () => {
  const a = resolveSubscriptionGate({ status: 'active' }, NOW);
  a.slugs.push('contaminado');
  const b = resolveSubscriptionGate({ status: 'active' }, NOW);
  assert.ok(!b.slugs.includes('contaminado'));
  const c = resolveSubscriptionGate({ status: 'expired' }, NOW);
  c.slugs.push('contaminado');
  assert.deepEqual(resolveSubscriptionGate({ status: 'expired' }, NOW), DENEGADO);
});

test('acepta now como epoch ms y fechas como Date', () => {
  concede(resolveSubscriptionGate({ status: 'cancelled', ends_at: new Date(NOW.getTime() + DIA) }, NOW.getTime()));
});
