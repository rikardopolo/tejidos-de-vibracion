/**
 * El puente `/r/` de ESTE repo no puede sellar la cuenta del portal.
 * Correr: node --test src/lib/piezas-source.test.mjs
 *
 * `piezas.ts` está duplicado a propósito en los dos repos (portal y libro) y la
 * copia arrastró el default del portal, `tdr-ig`. Resultado: durante semanas
 * `tejidosdevibracion.com/r/obertura` y `/r/cap-1` —los dos enlaces de la bio de
 * @tejidosdevibracion— llegaron a PostHog como tráfico de TDR. Nada falló: el
 * 302 salía correcto y el dato aparecía, en la fila de la otra marca.
 *
 * Por eso el test mira el FUENTE y no la salida de la función: lo que hay que
 * impedir es que la próxima sincronización entre repos reintroduzca el valor.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const fuente = readFileSync(
  path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'piezas.ts'),
  'utf8',
);

test('el default de utm_source es la cuenta del libro', () => {
  // Control positivo PRIMERO: si un refactor renombra la constante, el regex deja
  // de casar y este test debe FALLAR, no pasar en verde por no encontrar nada.
  const m = /utm_source',\s*pieza\.source\s*\?\?\s*([A-Z_]+|'[a-z-]+')/.exec(fuente);
  assert.ok(m, 'no se localizó el default de utm_source en piezas.ts — revisar este test antes que el código');

  const literal = m[1].startsWith("'")
    ? m[1].slice(1, -1)
    : new RegExp(`${m[1]}\\s*=\\s*'([a-z-]+)'`).exec(fuente)?.[1];

  assert.equal(literal, 'tdv-ig', 'este repo se sirve desde tejidosdevibracion.com: su default no puede ser la cuenta de TDR');
});

test('ninguna pieza declara tdr-ig explícitamente', () => {
  // Un `source: 'tdr-ig'` puntual tendría el mismo efecto que el default malo.
  // Si alguna vez hace falta uno, este test es el sitio donde justificarlo.
  assert.doesNotMatch(fuente, /source:\s*'tdr-ig'/);
});
