/**
 * Checks de la decisión del gate (control de acceso de pago).
 * Stdlib node:test, sin deps. Correr: node --test src/lib/gate-decision.test.mjs
 *
 * Cubre las dos direcciones del dinero:
 *   - NO dejar pasar contenido de pago a quien no pagó.
 *   - NO bloquear el contenido gratis/registrado que hoy funciona (no-regresión).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { puedeAcceder } from './gate-decision.mjs';

const visitante = { nivel: 0, slugs: [] };
const registrado = { nivel: 1, slugs: [] };
const comprador = { nivel: 2, slugs: ['bundle-acto-2'] };
const compradorOtro = { nivel: 2, slugs: ['otro-producto'] };

// ── Dirección 1: el dinero NO se filtra ──────────────────────────────
test('nivel 1 (registrado) NO entra a contenido nivelRequerido 2', () => {
  assert.equal(puedeAcceder(registrado, 2), false);
});

test('nivel 2 SIN el slug del producto NO entra a contenido de pago con slug', () => {
  assert.equal(puedeAcceder(comprador, 2, 'producto-no-comprado'), false);
  assert.equal(puedeAcceder(compradorOtro, 2, 'bundle-acto-2'), false);
});

test('visitante NO entra a nada con nivelRequerido >= 1', () => {
  assert.equal(puedeAcceder(visitante, 1), false);
  assert.equal(puedeAcceder(visitante, 2, 'bundle-acto-2'), false);
});

test('nivel 2 NO alcanza contenido nivelRequerido 3', () => {
  assert.equal(puedeAcceder(comprador, 3), false);
});

// ── Dirección 2: el contenido de pago legítimo SÍ pasa ───────────────
test('nivel 2 CON el slug correcto SÍ entra a su contenido de pago', () => {
  assert.equal(puedeAcceder(comprador, 2, 'bundle-acto-2'), true);
});

test('nivel 3 (libro completo) entra a contenido nivelRequerido 2 sin slug', () => {
  assert.equal(puedeAcceder({ nivel: 3, slugs: [] }, 2), true);
});

// ── No-regresión: gratis (0) y registrado (1) siguen igual que hoy ────
test('NO-REGRESION · contenido nivelRequerido 1 accesible para registrado', () => {
  assert.equal(puedeAcceder(registrado, 1), true);
});

test('NO-REGRESION · contenido público nivelRequerido 0 accesible para todos', () => {
  assert.equal(puedeAcceder(visitante, 0), true);
  assert.equal(puedeAcceder(registrado, 0), true);
});

test('NO-REGRESION · nivel >= requerido sin slug de producto siempre pasa', () => {
  // El contenido de Acto I no declara productoSlug → la regla de scope no aplica.
  assert.equal(puedeAcceder(registrado, 1, undefined), true);
  assert.equal(puedeAcceder(registrado, 1, null), true);
});
