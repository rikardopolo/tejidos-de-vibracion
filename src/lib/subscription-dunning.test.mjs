/**
 * Candado del aviso de impago · stdlib node:test, sin deps.
 * Correr: node --test src/lib/subscription-dunning.test.mjs
 *
 * Mock de supabase-js adaptado de lemonsqueezy-idempotency.test.mjs:22-90 (tabla en
 * memoria + semántica RETURNING) con el `.is(col, null)` de
 * lemonsqueezy-entrega.test.mjs:18-59, que es el filtro que hace atómica la
 * reclamación. Aquí la tabla es `subscriptions` y la columna `dunning_enviado_at`.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { claimDunningEnvio, releaseDunningEnvio } from './subscription-dunning.mjs';

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
        if (table !== 'subscriptions') return Promise.resolve({ data: [], error: null });
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

const impagada = (overrides = {}) => ({
  id: 'sub-1',
  status: 'past_due',
  dunning_enviado_at: null,
  ...overrides,
});

test('primera reclamación → claimed=true y marca dunning_enviado_at', async () => {
  const sb = makeMockSupabase([impagada()]);
  const r = await claimDunningEnvio(sb, 'sub-1');
  assert.equal(r.error, null);
  assert.equal(r.claimed, true);
  assert.ok(sb._rows[0].dunning_enviado_at, 'queda la marca de tiempo');
});

test('segunda reclamación (reintento del proveedor) → claimed=false', async () => {
  const sb = makeMockSupabase([impagada()]);
  await claimDunningEnvio(sb, 'sub-1');
  const segunda = await claimDunningEnvio(sb, 'sub-1');
  assert.equal(segunda.claimed, false, 'el aviso NO se manda dos veces');
});

test('dos reclamaciones concurrentes → exactamente UNA gana', async () => {
  const sb = makeMockSupabase([impagada()]);
  const [a, b] = await Promise.all([claimDunningEnvio(sb, 'sub-1'), claimDunningEnvio(sb, 'sub-1')]);
  assert.equal([a, b].filter((r) => r.claimed).length, 1);
});

test('release tras fallo del correo → el reintento vuelve a reclamar', async () => {
  const sb = makeMockSupabase([impagada()]);
  const primera = await claimDunningEnvio(sb, 'sub-1');
  assert.equal(primera.claimed, true);
  // El correo falla: liberamos.
  const { error } = await releaseDunningEnvio(sb, 'sub-1');
  assert.equal(error, null);
  assert.equal(sb._rows[0].dunning_enviado_at, null);
  const reintento = await claimDunningEnvio(sb, 'sub-1');
  assert.equal(reintento.claimed, true, 'el reintento SÍ reenvía');
});

test('sin release (correo OK) → el reintento NO reclama', async () => {
  const sb = makeMockSupabase([impagada()]);
  await claimDunningEnvio(sb, 'sub-1');
  assert.equal((await claimDunningEnvio(sb, 'sub-1')).claimed, false);
});

// --- Controles negativos ---

test('CONTROL · suscripción que ya no está en impago (active) → NO reclama', async () => {
  // Impago reprocesado después de que el pago se recuperó: aviso falso evitado.
  const sb = makeMockSupabase([impagada({ status: 'active' })]);
  const r = await claimDunningEnvio(sb, 'sub-1');
  assert.equal(r.claimed, false);
  assert.equal(sb._rows[0].dunning_enviado_at, null, 'no deja marca');
});

test('CONTROL · suscripción inexistente → claimed=false sin error', async () => {
  const sb = makeMockSupabase([impagada()]);
  const r = await claimDunningEnvio(sb, 'no-existe');
  assert.equal(r.claimed, false);
  assert.equal(r.error, null);
});

test('CONTROL · error de consulta → claimed=false y el error se devuelve', async () => {
  const sb = makeMockSupabase([impagada()]);
  sb._failNext({ message: 'column dunning_enviado_at does not exist' });
  const r = await claimDunningEnvio(sb, 'sub-1');
  assert.equal(r.claimed, false);
  assert.ok(r.error);
  assert.equal(sb._rows[0].dunning_enviado_at, null);
});

test('CONTROL · release con error lo devuelve y la marca queda tomada (no se auto-cura)', async () => {
  const sb = makeMockSupabase([impagada()]);
  await claimDunningEnvio(sb, 'sub-1');
  sb._failNext({ message: 'boom' });
  const { error } = await releaseDunningEnvio(sb, 'sub-1');
  assert.ok(error);
  assert.equal((await claimDunningEnvio(sb, 'sub-1')).claimed, false);
});

test('el candado es por suscripción: otra fila en impago reclama aparte', async () => {
  const sb = makeMockSupabase([impagada(), impagada({ id: 'sub-2' })]);
  assert.equal((await claimDunningEnvio(sb, 'sub-1')).claimed, true);
  assert.equal((await claimDunningEnvio(sb, 'sub-2')).claimed, true);
  assert.equal((await claimDunningEnvio(sb, 'sub-2')).claimed, false);
});
