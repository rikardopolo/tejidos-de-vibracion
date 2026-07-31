/**
 * Entrega del acceso · stdlib node:test, sin deps.
 * Correr: node --test src/lib/lemonsqueezy-entrega.test.mjs
 *
 * El defecto que cubre: la entrega colgaba de `isFirstEffect`, así que si el email
 * fallaba se devolvía 500 para que LS reintentara — pero en el reintento el upsert
 * ya no insertaba, isFirstEffect era false, y el email NO se reenviaba jamás.
 * Compra pagada, fila correcta, comprador sin enlace.
 *
 * El candado ahora es la transición única sobre `acceso_enviado_at`, con
 * liberación si el envío falla.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { claimAccesoEnvio, releaseAccesoEnvio } from './lemonsqueezy-webhook.mjs';

/**
 * Mock de supabase-js con `.is(col, null)`, que es el filtro que hace atómica la
 * reclamación. Replica la semántica RETURNING: devuelve solo las filas afectadas.
 */
function makeMockSupabase(initialRows = []) {
  const rows = initialRows.map((r) => ({ ...r }));
  let failNext = null;

  function query(table) {
    const state = { payload: null, filters: [] };
    const builder = {
      update(payload) {
        state.payload = payload;
        return builder;
      },
      eq(col, val) {
        state.filters.push(['eq', col, val]);
        return builder;
      },
      is(col, val) {
        state.filters.push(['is', col, val]);
        return builder;
      },
      select() {
        if (failNext) {
          const err = failNext;
          failNext = null;
          return Promise.resolve({ data: null, error: err });
        }
        if (table !== 'orders') return Promise.resolve({ data: [], error: null });
        const matches = (row) =>
          state.filters.every(([kind, col, val]) =>
            kind === 'eq' ? row[col] === val : (row[col] ?? null) === val,
          );
        const affected = rows.filter(matches);
        for (const r of affected) Object.assign(r, state.payload);
        return Promise.resolve({ data: affected.map((r) => ({ id: r.id })), error: null });
      },
    };
    return builder;
  }

  return { from: query, _rows: rows, _failNext: (e) => { failNext = e; } };
}

const orden = (o = {}) => ({ id: 'id-1', ls_order_id: '9999', status: 'paid', acceso_enviado_at: null, ...o });

test('primera entrega: reclama el envío', async () => {
  const sb = makeMockSupabase([orden()]);
  const r = await claimAccesoEnvio(sb, '9999');
  assert.equal(r.claimed, true);
  assert.equal(r.error, null);
  assert.notEqual(sb._rows[0].acceso_enviado_at, null, 'la marca queda puesta');
});

test('segunda entrega del mismo order: NO reclama (ya enviado)', async () => {
  const sb = makeMockSupabase([orden()]);
  await claimAccesoEnvio(sb, '9999');
  const segunda = await claimAccesoEnvio(sb, '9999');
  assert.equal(segunda.claimed, false, 'no se reenvía a quien ya recibió el enlace');
});

test('concurrencia: dos webhooks a la vez → exactamente UNA reclamación', async () => {
  const sb = makeMockSupabase([orden()]);
  const [a, b] = await Promise.all([claimAccesoEnvio(sb, '9999'), claimAccesoEnvio(sb, '9999')]);
  assert.equal([a, b].filter((r) => r.claimed).length, 1);
});

// --- El caso que fallaba con el código anterior ---

test('email falla → se libera → el REINTENTO sí vuelve a enviar', async () => {
  const sb = makeMockSupabase([orden()]);

  const primera = await claimAccesoEnvio(sb, '9999');
  assert.equal(primera.claimed, true);

  // Brevo falla: liberamos la marca (lo que hace el webhook antes del 500).
  await releaseAccesoEnvio(sb, '9999');
  assert.equal(sb._rows[0].acceso_enviado_at, null, 'la marca vuelve a estar libre');

  // Reintento de Lemon Squeezy sobre el MISMO order.
  const reintento = await claimAccesoEnvio(sb, '9999');
  assert.equal(reintento.claimed, true, 'el reintento recupera la entrega perdida');
});

test('tras un envío correcto, un reintento posterior NO duplica el email', async () => {
  const sb = makeMockSupabase([orden()]);
  await claimAccesoEnvio(sb, '9999'); // envío OK, sin liberar
  const tercera = await claimAccesoEnvio(sb, '9999');
  assert.equal(tercera.claimed, false, 'la idempotencia sigue intacta');
});

test('order inexistente → no reclama (no inventa entrega)', async () => {
  const sb = makeMockSupabase([]);
  const r = await claimAccesoEnvio(sb, 'no-existe');
  assert.equal(r.claimed, false);
});

// --- La orden reembolsada no entrega acceso ---
// Antes lo impedía `isFirstEffect` por accidente (la fila ya existía). Al quitarlo,
// un order_created reprocesado tras el reembolso emitiría un token NUEVO de 365 días.

test('orden refunded → NO reclama, aunque nunca se haya entregado', async () => {
  const sb = makeMockSupabase([orden({ status: 'refunded' })]);
  const r = await claimAccesoEnvio(sb, '9999');
  assert.equal(r.claimed, false, 'no se entrega acceso sobre una compra devuelta');
  assert.equal(sb._rows[0].acceso_enviado_at, null, 'ni se marca como entregada');
});

test('refund huérfano (nace refunded, sin paid previo) → NO reclama', async () => {
  const sb = makeMockSupabase([orden({ status: 'refunded', acceso_enviado_at: null })]);
  assert.equal((await claimAccesoEnvio(sb, '9999')).claimed, false);
});

test('la orden paid del flujo normal sigue reclamando (no-regresión del filtro)', async () => {
  const sb = makeMockSupabase([orden({ status: 'paid' })]);
  assert.equal((await claimAccesoEnvio(sb, '9999')).claimed, true);
});

test('liberación fallida → error propagado y la marca sigue tomada (exige mano)', async () => {
  const sb = makeMockSupabase([orden()]);
  await claimAccesoEnvio(sb, '9999');
  sb._failNext({ message: 'boom' });
  const { error } = await releaseAccesoEnvio(sb, '9999');
  assert.notEqual(error, null, 'el caller debe poder loguear que la entrega se perdió');
  assert.equal((await claimAccesoEnvio(sb, '9999')).claimed, false, 'el reintento NO se auto-cura');
});

test('error de base al reclamar → claimed=false y error propagado', async () => {
  const sb = makeMockSupabase([orden()]);
  sb._failNext({ message: 'boom' });
  const r = await claimAccesoEnvio(sb, '9999');
  assert.equal(r.claimed, false);
  assert.notEqual(r.error, null, 'el caller debe poder devolver 500 y no dar por enviado');
});
