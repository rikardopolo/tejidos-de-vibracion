/**
 * Correr: node --test src/lib/retencion-lectura.test.mjs
 *
 * `reading_events` no tenía TTL ni purga: rastro de comportamiento de lectores
 * NO registrados (qué sección, cuánto scroll, cuántos ms) conservado para
 * siempre y atado a un id de navegador. Estos tests fijan el corte y, sobre
 * todo, la frontera: la purga JAMÁS toca `reading_progress`.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { corteEventos, tocaPurgar, purgarEventosLectura, TTL_EVENTOS_DIAS } from './retencion-lectura.mjs';

const AHORA = Date.UTC(2026, 7, 1, 12, 0, 0);
const DIA = 24 * 3600_000;

test('el plazo es 90 días', () => {
  assert.equal(TTL_EVENTOS_DIAS, 90);
});

test('el corte es exactamente ahora − TTL', () => {
  assert.equal(corteEventos(AHORA), new Date(AHORA - 90 * DIA).toISOString());
});

test('una fila de hace 89 días sobrevive; una de 91 cae', () => {
  const corte = corteEventos(AHORA);
  assert.equal(new Date(AHORA - 89 * DIA).toISOString() < corte, false, '89d NO debe caer');
  assert.equal(new Date(AHORA - 91 * DIA).toISOString() < corte, true, '91d SÍ debe caer');
});

test('tocaPurgar dispara ~1 de cada 100', () => {
  assert.equal(tocaPurgar(0.005), true);
  assert.equal(tocaPurgar(0.02), false);
  assert.equal(tocaPurgar(0.01), false, 'el límite es estrictamente menor');
});

// --- La frontera: qué se purga y qué NO ---

function mockSupabase() {
  const tocadas = [];
  return {
    tocadas,
    from(tabla) {
      return {
        delete() {
          return {
            lt(col, valor) {
              tocadas.push({ tabla, col, valor });
              return Promise.resolve({ error: null });
            },
          };
        },
      };
    },
  };
}

test('purga SOLO reading_events, por created_at', async () => {
  const sb = mockSupabase();
  await purgarEventosLectura(sb, AHORA);
  assert.equal(sb.tocadas.length, 1);
  assert.equal(sb.tocadas[0].tabla, 'reading_events');
  assert.equal(sb.tocadas[0].col, 'created_at');
  assert.equal(sb.tocadas[0].valor, corteEventos(AHORA));
});

test('JAMÁS toca reading_progress (es el avance de una persona identificada)', async () => {
  const sb = mockSupabase();
  await purgarEventosLectura(sb, AHORA);
  assert.equal(sb.tocadas.some((t) => t.tabla === 'reading_progress'), false);
});

test('no crítica: si Supabase revienta NO lanza (la petición del lector no puede caer)', async () => {
  const roto = { from() { throw new Error('boom'); } };
  await assert.doesNotReject(() => purgarEventosLectura(roto, AHORA));
});
