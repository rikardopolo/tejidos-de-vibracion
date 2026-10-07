/**
 * Alta de lead del libro · stdlib node:test, sin deps.
 * Correr: node --test src/lib/lead-alta.test.mjs
 *
 * El defecto que cubre (S-05, PR 2): el alta hacía upsert por email con `name` y
 * `unsubscribed_at: null`, así que cualquiera, sin la doble confirmación, podía
 * renombrar a un suscriptor o deshacer su baja escribiendo su correo.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { camposDeAlta, CAMPOS_PROTEGIDOS } from './lead-alta.mjs';

const fila = () => ({
  email: 'Ana@Correo.com',
  source: 'libro',
  name: 'Nombre que manda el formulario',
  consent_text: 'texto',
  ip_hash: 'abc',
  user_agent: 'ua',
  country: 'CO',
  region: 'ANT',
  unsubscribed_at: null,
});

test('correo nuevo → se escribe la fila completa', () => {
  assert.deepEqual(camposDeAlta(fila(), { existe: false }), fila());
});

test('fila existente (con o sin confirmed_at) → no toca name ni unsubscribed_at', () => {
  // El que no está confirmado es el POST, no la fila: la regla vale para ambas.
  const campos = camposDeAlta(fila(), { existe: true });
  assert.equal('name' in campos, false, 'un tercero no renombra al lead');
  assert.equal('unsubscribed_at' in campos, false, 'una baja no se deshace sin DOI');
  assert.equal('email' in campos, false, 'la clave del cruce no se reescribe');
});

test('fila existente → el resto del alta sí se escribe', () => {
  const campos = camposDeAlta(fila(), { existe: true });
  assert.deepEqual(campos, {
    source: 'libro',
    consent_text: 'texto',
    ip_hash: 'abc',
    user_agent: 'ua',
    country: 'CO',
    region: 'ANT',
  });
});

test('no muta la fila de entrada', () => {
  const f = fila();
  camposDeAlta(f, { existe: true });
  assert.deepEqual(f, fila());
});

test('los campos protegidos son exactamente estos tres', () => {
  assert.deepEqual([...CAMPOS_PROTEGIDOS].sort(), ['email', 'name', 'unsubscribed_at']);
});
