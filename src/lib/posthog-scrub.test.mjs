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

test('una ruta relativa se limpia SIN inventarse un dominio', () => {
  const r = limpiarEvento(evento({ $current_url: `/acceso/libro?t=${TOKEN}` }));
  assert.equal(r.properties.$current_url, '/acceso/libro?t=REDACTED');
  assert.ok(!r.properties.$current_url.includes('invalid'));
});

// ── El caso que se escapo a la primera version ──────────────────────
test('$session_entry_url tambien se limpia: NO se enumeran nombres de propiedad', () => {
  const r = limpiarEvento(evento({ $session_entry_url: `https://tejidosdevibracion.com/acceso/libro?t=${TOKEN}` }));
  assert.ok(!r.properties.$session_entry_url.includes(TOKEN));
});

test('una propiedad de URL que PostHog invente manana queda cubierta', () => {
  const r = limpiarEvento(evento({ $propiedad_futura_url: `https://x.com/a?token=${TOKEN}` }));
  assert.ok(!r.properties.$propiedad_futura_url.includes(TOKEN));
});

test('el texto libre con interrogacion NO se toca (no todo string con ? es una URL)', () => {
  const texto = 'y ahora que? nada, seguimos';
  const r = limpiarEvento(evento({ $intencion: texto, nota: 'sin interrogante' }));
  assert.equal(r.properties.$intencion, texto);
  assert.equal(r.properties.nota, 'sin interrogante');
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
