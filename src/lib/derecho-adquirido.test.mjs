/**
 * derecho-adquirido.test.mjs · Correr: node --test src/lib/derecho-adquirido.test.mjs
 *
 * Regla (b) de la Decisión §1: meses cubiertos pagados y no reembolsados antes del
 * cierre, acumulados por comprador. Cada control negativo quita UNA condición del
 * caso que concede: si con 4 meses, con una reembolsada o con pagos tras el cierre
 * siguiera dando true, la condición no se estaría mirando.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tieneDerechoPdf, LIBRO_COMPLETADO_AT, MESES_MINIMOS } from './derecho-adquirido.mjs';

const CIERRE = new Date('2027-12-31T23:59:59-05:00');
const AHORA = new Date('2027-06-01T00:00:00Z');
const DIA = 24 * 60 * 60 * 1000;
// n facturas mensuales consecutivas pagadas a partir de `desde`.
const mensuales = (n, desde = new Date('2026-10-01T00:00:00Z'), extra = {}) =>
  Array.from({ length: n }, (_, i) => ({
    paid_at: new Date(desde.getTime() + i * 30 * DIA).toISOString(),
    refunded_at: null,
    meses_cubiertos: 1,
    ...extra,
  }));
const opts = { ahora: AHORA, cierre: CIERRE };

test('constantes: cierre provisional 2027-06-30 (fecha válida) y umbral 5', () => {
  assert.ok(LIBRO_COMPLETADO_AT instanceof Date && !Number.isNaN(LIBRO_COMPLETADO_AT.getTime()));
  assert.equal(LIBRO_COMPLETADO_AT.toISOString(), '2027-07-01T04:59:59.000Z'); // 23:59:59 -05:00
  assert.equal(MESES_MINIMOS, 5);
});

test('5 mensuales pagadas antes del cierre → true', () => {
  assert.equal(tieneDerechoPdf(mensuales(5), opts), true);
});

test('CONTROL · 4 mensuales → false (una menos que el umbral)', () => {
  assert.equal(tieneDerechoPdf(mensuales(4), opts), false);
});

test('1 anual (12 meses cubiertos) → true desde el primer cobro', () => {
  assert.equal(tieneDerechoPdf([{ paid_at: '2026-10-01T00:00:00Z', refunded_at: null, meses_cubiertos: 12 }], opts), true);
});

test('CONTROL · 5 mensuales con una reembolsada → false', () => {
  const facturas = mensuales(5);
  facturas[2].refunded_at = '2026-12-05T00:00:00Z';
  assert.equal(tieneDerechoPdf(facturas, opts), false);
});

test('CONTROL · 5 mensuales pagadas DESPUÉS del cierre → false', () => {
  const trasCierre = mensuales(5, new Date('2028-02-01T00:00:00Z'));
  assert.equal(tieneDerechoPdf(trasCierre, { ahora: new Date('2028-12-01T00:00:00Z'), cierre: CIERRE }), false);
});

test('solo cuentan las pagadas antes del cierre: 3 antes + 2 después → false; 5 antes + 2 después → true', () => {
  const antes3 = mensuales(3, new Date('2027-09-01T00:00:00Z'));
  const despues2 = mensuales(2, new Date('2028-02-01T00:00:00Z'));
  const tarde = { ahora: new Date('2028-12-01T00:00:00Z'), cierre: CIERRE };
  assert.equal(tieneDerechoPdf([...antes3, ...despues2], tarde), false);
  assert.equal(tieneDerechoPdf([...mensuales(5), ...despues2], tarde), true);
});

test('se acumula por comprador: 3 meses, cancela, vuelve por 2 → true', () => {
  const primera = mensuales(3, new Date('2026-10-01T00:00:00Z'), { subscription_id: 'sub-a' });
  const segunda = mensuales(2, new Date('2027-03-01T00:00:00Z'), { subscription_id: 'sub-b' });
  assert.equal(tieneDerechoPdf([...primera, ...segunda], opts), true);
});

test('CONTROL · factura sin paid_at (emitida, no cobrada) no cuenta', () => {
  const facturas = [...mensuales(4), { paid_at: null, refunded_at: null, meses_cubiertos: 1 }];
  assert.equal(tieneDerechoPdf(facturas, opts), false);
});

test('CONTROL · factura sin meses_cubiertos no cuenta (no se adivina 1)', () => {
  const facturas = [...mensuales(4), { paid_at: '2027-05-01T00:00:00Z', refunded_at: null }];
  assert.equal(tieneDerechoPdf(facturas, opts), false);
});

test('CONTROL · factura con paid_at posterior a `ahora` no cuenta todavía', () => {
  const facturas = [...mensuales(4), { paid_at: '2027-07-01T00:00:00Z', refunded_at: null, meses_cubiertos: 1 }];
  assert.equal(tieneDerechoPdf(facturas, opts), false);
  // El mismo ledger, visto un mes después, ya concede.
  assert.equal(tieneDerechoPdf(facturas, { ahora: new Date('2027-08-01T00:00:00Z'), cierre: CIERRE }), true);
});

test('sin facturas, o lista nula → false', () => {
  assert.equal(tieneDerechoPdf([], opts), false);
  assert.equal(tieneDerechoPdf(null, opts), false);
});

test('por defecto usa LIBRO_COMPLETADO_AT como cierre y el reloj real como ahora', () => {
  // 5 mensuales de 2025-2026 → ya pagadas hoy y antes del cierre provisional.
  assert.equal(tieneDerechoPdf(mensuales(5, new Date('2025-10-01T00:00:00Z'))), true);
  // 5 mensuales de 2029 → después del cierre provisional (y además futuras hoy).
  assert.equal(tieneDerechoPdf(mensuales(5, new Date('2029-01-01T00:00:00Z'))), false);
});
