/**
 * correo-vincular.test.mjs · Correo de suscripción pendiente (S-13, C11).
 * Correr: node --test src/lib/correo-vincular.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { REMITENTE_POR_DEFECTO, VINCULAR_URL, contenidoCorreoVincular, planCorreoVincular, urlVincularPortal } from './correo-vincular.mjs';

const leer = (env) => (k) => env[k];

test('PORTAL_AUTORIZAR_URL de Preview → enlace de vinculación en esa Preview', () => {
  const url = urlVincularPortal('https://portal-preview.vercel.app/cuenta/autorizar?aud=tdv#salto');
  assert.equal(url, 'https://portal-preview.vercel.app/cuenta/vincular');
  const c = contenidoCorreoVincular({ nombre: 'Ana', url });
  assert.ok(c.text.includes(url));
  assert.ok(c.html.includes(`href="${url}"`));
});

test('sin PORTAL_AUTORIZAR_URL → enlace de producción', () => {
  assert.equal(urlVincularPortal(), VINCULAR_URL);
  assert.equal(urlVincularPortal(''), VINCULAR_URL);
});

test('PORTAL_AUTORIZAR_URL configurada pero inválida no cae a producción', () => {
  for (const url of ['no-es-una-url', 'javascript:alert(1)', 'http://portal.example/cuenta/autorizar', 'https://user:pass@portal.example/cuenta/autorizar']) {
    assert.throws(() => urlVincularPortal(url));
  }
});

test('el enlace es el del portal (C11): el libro no emite códigos', () => {
  assert.equal(VINCULAR_URL, 'https://tejidosderealidad.com/cuenta/vincular');
  const c = contenidoCorreoVincular({ nombre: 'Ana' });
  assert.ok(c.text.includes(VINCULAR_URL));
  assert.ok(c.html.includes(`href="${VINCULAR_URL}"`));
});

test('plantilla si BREVO_TEMPLATE_SUB_VINCULAR es un id; si no, respaldo inline', () => {
  assert.deepEqual(planCorreoVincular(leer({ BREVO_API_KEY: 'k', BREVO_TEMPLATE_SUB_VINCULAR: '42' })), {
    modo: 'plantilla',
    apiKey: 'k',
    templateId: 42,
  });
  assert.deepEqual(planCorreoVincular(leer({ BREVO_API_KEY: 'k' })), {
    modo: 'inline',
    apiKey: 'k',
    sender: { ...REMITENTE_POR_DEFECTO },
  });
  assert.deepEqual(planCorreoVincular(leer({ BREVO_API_KEY: 'k', BREVO_TEMPLATE_SUB_VINCULAR: 'abc', BREVO_SENDER_EMAIL: 'a@b.co' })).sender, {
    email: 'a@b.co',
    name: REMITENTE_POR_DEFECTO.name,
  });
  assert.equal(planCorreoVincular(leer({})), null);
});

test('el nombre se escapa en el HTML y el saludo es neutro sin nombre', () => {
  const c = contenidoCorreoVincular({ nombre: '<script>x</script>' });
  assert.ok(!c.html.includes('<script>'));
  assert.ok(c.html.includes('&lt;script&gt;'));
  assert.ok(contenidoCorreoVincular({}).text.startsWith('Hola:'));
});

test('tuteo, sin voseo', () => {
  const { text } = contenidoCorreoVincular({ nombre: 'Ana' });
  assert.ok(/entra en tu cuenta/.test(text));
  assert.ok(!/\b(vos|podés|tenés|recibís)\b/.test(text));
});
