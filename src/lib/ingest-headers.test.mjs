/**
 * Contrato del proxy `/api/ingest` hacia PostHog, en las dos direcciones.
 * Stdlib node:test, sin deps. Correr: node --test src/lib/ingest-headers.test.mjs
 *
 * Es un camino de CREDENCIALES: aquí vive `tejedor-access` (acceso a capítulos
 * de pago) y por aquí pasa el `?t=` de compra dentro del `referer`. El test se
 * pone rojo si alguien vuelve a dejar salir cualquiera de los dos.
 *
 * Incluye control positivo a propósito: si la allowlist se pasa de celosa, la
 * geolocalización de PostHog se degrada en silencio y nada más lo nota.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { filtrarPeticion, filtrarRespuesta } from './ingest-headers.mjs';

const ACCESO = 'tejedor-access-que-no-sale-de-casa-0123';
const COMPRA = 'TOKEN-DE-COMPRA-0123456789';

/** Lo que un navegador manda DE VERDAD, más lo que inyecta Vercel. */
const entrantes = () =>
  new Headers({
    'content-type': 'application/json',
    'user-agent': 'Mozilla/5.0 (prueba)',
    cookie: `tejedor-access=${ACCESO}; otra=1`,
    authorization: 'Bearer jamas',
    referer: `https://tejidosdevibracion.com/acceso/libro?t=${COMPRA}`,
    'x-forwarded-for': '203.0.113.7',
    'x-vercel-ip-latitude': '37.3891',
    'x-vercel-ip-longitude': '-5.9845',
    'x-vercel-ip-postal-code': '41001',
  });

// ── Dirección 1: nada nuestro sale hacia PostHog ─────────────────────
test('la cookie de acceso a capítulos de pago NO viaja', () => {
  const salida = filtrarPeticion(entrantes());
  assert.equal(salida.has('cookie'), false);
  assert.ok(!JSON.stringify([...salida]).includes(ACCESO));
});

test('el referer NO viaja: lleva el token de compra en la query', () => {
  const salida = filtrarPeticion(entrantes());
  assert.equal(salida.has('referer'), false);
  assert.ok(!JSON.stringify([...salida]).includes(COMPRA));
});

test('authorization NO viaja', () => {
  assert.equal(filtrarPeticion(entrantes()).has('authorization'), false);
});

test('la geolocalización precisa de Vercel NO viaja', () => {
  const salida = filtrarPeticion(entrantes());
  for (const h of ['x-vercel-ip-latitude', 'x-vercel-ip-longitude', 'x-vercel-ip-postal-code']) {
    assert.equal(salida.has(h), false, `${h} no debería salir`);
  }
});

test('una cabecera nueva e inesperada nace excluida (la gracia de la allowlist)', () => {
  const h = entrantes();
  h.set('x-inventada-el-ano-que-viene', 'lo-que-sea');
  assert.equal(filtrarPeticion(h).has('x-inventada-el-ano-que-viene'), false);
});

// ── Control positivo: lo que PostHog SÍ necesita sigue pasando ───────
test('x-forwarded-for SÍ viaja (PostHog geolocaliza por IP)', () => {
  assert.equal(filtrarPeticion(entrantes()).get('x-forwarded-for'), '203.0.113.7');
});

test('content-type y user-agent SÍ viajan', () => {
  const salida = filtrarPeticion(entrantes());
  assert.equal(salida.get('content-type'), 'application/json');
  assert.equal(salida.get('user-agent'), 'Mozilla/5.0 (prueba)');
});

// ── Dirección 2: el upstream no nos cuela cookies ────────────────────
test('el set-cookie de PostHog NO llega al navegador', () => {
  const upstream = new Headers({ 'content-type': 'application/json' });
  upstream.append('set-cookie', '__cf_bm=deadbeef; Path=/; HttpOnly');
  const salida = filtrarRespuesta(upstream);
  assert.equal(salida.has('set-cookie'), false);
  assert.ok(!JSON.stringify([...salida]).includes('__cf_bm'));
  // ...sin matar el resto de la respuesta.
  assert.equal(salida.get('content-type'), 'application/json');
});
