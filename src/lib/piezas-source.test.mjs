/**
 * El puente `/r/` de ESTE repo no puede sellar la cuenta de otra marca ni de
 * otra red. Correr: node --test src/lib/piezas-source.test.mjs
 *
 * `piezas.ts` está duplicado a propósito en los dos repos (portal y libro) y la
 * copia arrastró el default del portal, `tdr-ig`. Resultado: durante semanas
 * `tejidosdevibracion.com/r/obertura` y `/r/cap-1` —los dos enlaces de la bio de
 * @tejidosdevibracion— llegaron a PostHog como tráfico de TDR. Nada falló: el
 * 302 salía correcto y el dato aparecía, en la fila de la otra marca.
 *
 * Antes esto se comprobaba con un regex sobre el fuente, porque desde `.mjs` no
 * se podía importar un `.ts`. Node ≥22.18 sí puede (type stripping), así que
 * ahora se mide la SALIDA: cubre lo mismo sin depender de cómo esté escrita la
 * línea, y de paso alcanza el caso nuevo —la red— que un regex no vería.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PIEZAS, urlConAtribucion, cuentaDeRed } from './piezas.ts';

const fuente = (slug, red) =>
  new URL(urlConAtribucion(slug, PIEZAS[slug], red)).searchParams.get('utm_source');

// ── La marca ────────────────────────────────────────────────────────────────

test('sin red declarada, el default es la cuenta del libro', () => {
  assert.equal(fuente('obertura'), 'tdv-ig');
});

test('NINGUNA pieza de este repo se atribuye a la otra marca', () => {
  // Barre el registro entero, no una lista de sospechosas: si una sincronización
  // entre repos trae una pieza del portal, aparece aquí.
  for (const slug of Object.keys(PIEZAS)) {
    const src = fuente(slug);
    assert.ok(
      src.startsWith('tdv-'),
      `«${slug}» se atribuye a «${src}»; este repo se sirve desde tejidosdevibracion.com`,
    );
  }
});

// ── La red · el fallo que WF-01b no podía evitar ────────────────────────────

test('un enlace pegado en Facebook NO se cuenta como Instagram', () => {
  // El puente descarta las UTMs que le llegan y sella las de la pieza, así que
  // `?utm_source=facebook` —lo que WF-01b añadía— no hacía absolutamente nada.
  // `?c=fb` es el único dato que el puente escucha.
  assert.equal(fuente('obertura', 'fb'), 'tdv-fb');
  assert.equal(fuente('obertura', 'yt'), 'tdv-yt');
  assert.equal(fuente('obertura', 'tiktok'), 'tdv-tiktok');
  assert.equal(fuente('obertura', 'ig'), 'tdv-ig');
  // `li` entra el 23-ago-2026, al abrir la página de empresa en LinkedIn. Antes
  // de existir, un `?c=li` no rompía nada —degradaba al default— y ese es
  // justamente el problema: el tráfico de LinkedIn se habría contado como
  // Instagram sin que nada avisara.
  assert.equal(fuente('obertura', 'li'), 'tdv-li');
});

test('la red gana al `source` que declara la pieza', () => {
  // Los fragmentos de la Obertura declaran `source: 'tdv-ig'` porque nacieron
  // para Instagram. Si uno se publica en Facebook, dónde se pegó DE VERDAD es
  // el dato bueno; el de la pieza solo era el valor por defecto.
  assert.equal(PIEZAS['p3-umbral'].source, 'tdv-ig', 'la premisa del test');
  assert.equal(fuente('p3-umbral', 'fb'), 'tdv-fb');
});

// ── Lo que llega por la query de un enlace público ──────────────────────────

test('una red desconocida degrada al default, no rompe el enlace', () => {
  for (const basura of [undefined, null, '', '  ', 'facebook', 'FB!', 'no-existe']) {
    assert.equal(fuente('obertura', basura), 'tdv-ig', `con «${basura}»`);
  }
});

test('las claves heredadas del prototipo no se cuelan como cuenta', () => {
  // `CUENTAS_POR_RED['constructor']` devuelve una función —truthy— y acabaría
  // escrita dentro de la URL de destino. El valor viene de la query.
  for (const clave of ['constructor', '__proto__', 'toString', 'hasOwnProperty']) {
    assert.equal(cuentaDeRed(clave), null, `«${clave}» debe ser null`);
    assert.equal(fuente('obertura', clave), 'tdv-ig');
  }
});

test('la red se normaliza (mayúsculas y espacios) porque viene de una URL', () => {
  assert.equal(fuente('obertura', ' FB '), 'tdv-fb');
});
