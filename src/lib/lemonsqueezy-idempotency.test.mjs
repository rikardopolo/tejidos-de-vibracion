/**
 * Idempotencia ATÓMICA del webhook de Lemon Squeezy · stdlib node:test, sin deps.
 * Correr: node --test src/lib/lemonsqueezy-idempotency.test.mjs
 *
 * Prueba que el SEGUNDO procesamiento del MISMO ls_order_id NO produce un segundo
 * efecto. Usa un mock de supabase-js que replica las semánticas atómicas de Postgres
 * relevantes: UNIQUE(ls_order_id) + upsert(ignoreDuplicates) (inserta solo si no
 * existe) y update(...).neq('status','refunded') (afecta filas solo si la transición
 * es real). persistOrderAtomic decide isFirstEffect a partir de ESOS resultados.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { persistOrderAtomic } from './lemonsqueezy-webhook.mjs';

/**
 * Mock mínimo de supabase-js con una "tabla" orders en memoria que honra:
 *  - UNIQUE(ls_order_id): upsert con ignoreDuplicates inserta SOLO si no existe.
 *  - .update().eq().neq().select(): aplica el update solo a filas que pasan los
 *    filtros y devuelve las afectadas (semántica RETURNING).
 * Devuelve {data, error} como supabase-js (thenable encadenable).
 */
function makeMockSupabase(initialRows = []) {
  const rows = initialRows.map((r) => ({ ...r }));

  function query(table) {
    // Estado del builder encadenable.
    const state = { op: null, payload: null, opts: null, filters: [] };

    const builder = {
      upsert(payload, opts) {
        state.op = 'upsert';
        state.payload = payload;
        state.opts = opts ?? {};
        return builder;
      },
      update(payload) {
        state.op = 'update';
        state.payload = payload;
        return builder;
      },
      eq(col, val) {
        state.filters.push(['eq', col, val]);
        return builder;
      },
      neq(col, val) {
        state.filters.push(['neq', col, val]);
        return builder;
      },
      select() {
        // Ejecuta la operación pendiente y devuelve {data, error}.
        return Promise.resolve(run());
      },
    };

    function matches(row) {
      return state.filters.every(([kind, col, val]) =>
        kind === 'eq' ? row[col] === val : row[col] !== val,
      );
    }

    function run() {
      if (table !== 'orders') return { data: [], error: null };
      if (state.op === 'upsert') {
        const key = state.payload.ls_order_id;
        const exists = rows.some((r) => r.ls_order_id === key);
        if (exists) {
          // ignoreDuplicates: choca con UNIQUE → no inserta, no devuelve fila.
          if (state.opts.ignoreDuplicates) return { data: [], error: null };
          // (sin ignoreDuplicates haríamos merge; no se usa en este flujo)
          const r = rows.find((x) => x.ls_order_id === key);
          Object.assign(r, state.payload);
          return { data: [{ id: r.id }], error: null };
        }
        const r = { id: `id-${rows.length + 1}`, ...state.payload };
        rows.push(r);
        return { data: [{ id: r.id }], error: null };
      }
      if (state.op === 'update') {
        const affected = rows.filter(matches);
        for (const r of affected) Object.assign(r, state.payload);
        return { data: affected.map((r) => ({ id: r.id })), error: null };
      }
      return { data: [], error: null };
    }

    return builder;
  }

  return { from: query, _rows: rows };
}

const baseRow = (overrides = {}) => ({
  ls_order_id: '9999',
  ls_order_identifier: 'abc',
  email: 'comprador@ejemplo.com',
  lead_id: null,
  product_slug: 'bundle-preventa',
  tipo: 'one-time',
  amount_cents: 2600,
  currency: 'USD',
  status: 'paid',
  nivel_otorgado: 2,
  acceso_expira_at: null,
  test_mode: true,
  raw: {},
  ...overrides,
});

test('paid: primera entrega → isFirstEffect=true; segunda (retry) → false', async () => {
  const supabase = makeMockSupabase();
  const parsed = { lsOrderId: '9999', status: 'paid' };

  const first = await persistOrderAtomic(supabase, parsed, baseRow());
  assert.equal(first.error, null);
  assert.equal(first.isFirstEffect, true, 'la primera entrega corre efectos');

  const second = await persistOrderAtomic(supabase, parsed, baseRow());
  assert.equal(second.error, null);
  assert.equal(second.isFirstEffect, false, 'el reintento NO repite efectos');

  // Solo una fila persistida (idempotencia real).
  assert.equal(supabase._rows.length, 1);
});

test('paid concurrente: dos entregas del mismo order → exactamente UN efecto', async () => {
  // Simula concurrencia compartiendo la MISMA tabla; el árbitro es UNIQUE, no un
  // SELECT previo (que daría isFirstEffect=true en ambas).
  const supabase = makeMockSupabase();
  const parsed = { lsOrderId: '7777', status: 'paid' };
  const a = await persistOrderAtomic(supabase, parsed, baseRow({ ls_order_id: '7777' }));
  const b = await persistOrderAtomic(supabase, parsed, baseRow({ ls_order_id: '7777' }));
  const efectos = [a, b].filter((r) => r.isFirstEffect).length;
  assert.equal(efectos, 1, 'exactamente una de las dos entregas corre efectos');
});

test('refund tras paid: transición → isFirstEffect=true; segundo refund → false', async () => {
  // Order ya existe (paid). El refund NO depende de "order nuevo" sino de la
  // transición a refunded.
  const supabase = makeMockSupabase([baseRow({ id: 'id-1', status: 'paid' })]);
  const parsed = { lsOrderId: '9999', status: 'refunded' };

  const first = await persistOrderAtomic(supabase, parsed, baseRow({ status: 'refunded' }));
  assert.equal(first.isFirstEffect, true, 'la primera transición a refunded corre efectos');
  assert.equal(supabase._rows[0].status, 'refunded');

  const second = await persistOrderAtomic(supabase, parsed, baseRow({ status: 'refunded' }));
  assert.equal(second.isFirstEffect, false, 'un segundo refunded NO repite efectos');
});

test('refund tras paid: corre UNA vez aunque el paid NO fuera "order nuevo"', async () => {
  // Regresión del bug original: el refund estaba gateado por isNewOrder (false,
  // porque el order ya existía) → el efecto de refund NUNCA corría. Ahora sí.
  const supabase = makeMockSupabase([baseRow({ id: 'id-1', status: 'paid' })]);
  const r = await persistOrderAtomic(supabase, { lsOrderId: '9999', status: 'refunded' }, baseRow({ status: 'refunded' }));
  assert.equal(r.isFirstEffect, true);
});

test('refund huérfano (sin paid previo): inserta y corre efecto una sola vez', async () => {
  const supabase = makeMockSupabase(); // tabla vacía
  const parsed = { lsOrderId: '5555', status: 'refunded' };

  const first = await persistOrderAtomic(supabase, parsed, baseRow({ ls_order_id: '5555', status: 'refunded' }));
  assert.equal(first.isFirstEffect, true, 'refund-huérfano nuevo corre efecto');
  assert.equal(supabase._rows.length, 1);

  const second = await persistOrderAtomic(supabase, parsed, baseRow({ ls_order_id: '5555', status: 'refunded' }));
  assert.equal(second.isFirstEffect, false, 'reintento del huérfano NO repite');
});
