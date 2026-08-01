/**
 * Checks del scrub de tokens en el payload de PostHog.
 * Stdlib node:test, sin deps. Correr: node --test src/lib/posthog-scrub.test.mjs
 *
 * Dos cosas se prueban aquí, y la segunda es la que de verdad puede romper en
 * producción sin que nadie se entere:
 *   1. Que el token no sobreviva en las propiedades de URL.
 *   2. Que la función siga siendo AUTOCONTENIDA — se serializa con toString()
 *      dentro del snippet servido; si alguien le mete una constante de módulo,
 *      la copia del navegador revienta con ReferenceError y PostHog enmudece.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { limpiarEvento } from './posthog-scrub.mjs';

const TOKEN = 'TOKEN-DE-COMPRA-0123456789';
const evento = (props) => ({ event: '$pageview', properties: { ...props } });

// ── 1. El token no sale ──────────────────────────────────────────────
test('$current_url pierde el ?t= del token de compra', () => {
  const r = limpiarEvento(evento({ $current_url: `https://tejidosdevibracion.com/acceso/libro?t=${TOKEN}` }));
  assert.ok(!r.properties.$current_url.includes(TOKEN));
  // ...pero la ruta se conserva: sin ella no hay analitica de paginas.
  assert.ok(r.properties.$current_url.includes('/acceso/libro'));
});

test('tambien limpia $referrer y los $initial_* que se persisten', () => {
  const r = limpiarEvento(
    evento({
      $referrer: `https://tejidosdevibracion.com/acceso/libro?t=${TOKEN}`,
      $initial_current_url: `https://tejidosdevibracion.com/x?token=${TOKEN}`,
      $initial_referrer: `https://tejidosdevibracion.com/y?code=${TOKEN}`,
    }),
  );
  const volcado = JSON.stringify(r.properties);
  assert.ok(!volcado.includes(TOKEN), 'ningun token debe sobrevivir');
});

test('respeta el resto de la query (utm y compania siguen vivos)', () => {
  const r = limpiarEvento(evento({ $current_url: `https://x.com/a?utm_source=ig&t=${TOKEN}&page=2` }));
  assert.ok(r.properties.$current_url.includes('utm_source=ig'));
  assert.ok(r.properties.$current_url.includes('page=2'));
  assert.ok(!r.properties.$current_url.includes(TOKEN));
});

test('URL sin query, propiedad ausente y evento vacio no explotan', () => {
  assert.equal(limpiarEvento(evento({ $current_url: 'https://x.com/a' })).properties.$current_url, 'https://x.com/a');
  assert.deepEqual(limpiarEvento(evento({})).properties, {});
  assert.equal(limpiarEvento(null), null);
  assert.deepEqual(limpiarEvento({ event: 'x' }), { event: 'x' });
});

test('URL no parseable pierde la query entera (preferimos perder dato a filtrar)', () => {
  const r = limpiarEvento(evento({ $current_url: `/acceso/libro?t=${TOKEN}` }));
  assert.equal(r.properties.$current_url, '/acceso/libro');
});

test('devuelve el evento, no null (devolver falsy lo DESCARTARIA)', () => {
  const e = evento({ $current_url: 'https://x.com/a' });
  assert.equal(limpiarEvento(e), e);
});

// ── 2. Sigue siendo serializable: el check que evita el fallo mudo ────
test('es AUTOCONTENIDA: sobrevive a toString() + eval, como en el navegador', () => {
  // Exactamente lo que hace posthog-init.js.ts al construir el snippet.
  const copia = eval(`(${limpiarEvento.toString()})`);
  const r = copia(evento({ $current_url: `https://x.com/a?t=${TOKEN}` }));
  assert.ok(!r.properties.$current_url.includes(TOKEN));
});
