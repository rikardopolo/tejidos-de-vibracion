/**
 * Prueba de content-lint · stdlib node:test, sin deps.
 * Correr: node --test scripts/content-lint.test.mjs
 *
 * Verifica la lógica de parseo sobre un fixture sintético (no el corpus real),
 * para que la prueba sea estable cuando el contenido cambie de fase en fase.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { analizarCorpus, flattenBody } from './content-lint.mjs';

// --- Fixture: dos capítulos con contenido de conteo conocido ---
const base = mkdtempSync(path.join(tmpdir(), 'content-lint-'));
mkdirSync(path.join(base, 'obertura'), { recursive: true });
mkdirSync(path.join(base, 'cap3'), { recursive: true });

// Obertura: 3 "meta-observador" (case-insensitive); "Cap. 9" SOLO en frontmatter
// (debe ignorarse); "Cap. 2" y "§3.3" en el cuerpo (deben capturarse).
writeFileSync(
  path.join(base, 'obertura', 'x.mdx'),
  `---
title: "Prueba"
tags: ["Cap. 9"]
---
El Meta-Observador observa. El meta-observador de nuevo. Y Meta-Observador otra vez.
Como vimos en el Cap. 2 y en §3.3, todo encaja.
`,
);

// Cap.3: 0 "meta-observador"; fuga "Modo D"; "precisión absoluta" ×2;
// una línea de blockquote con asteriscos impares.
writeFileSync(
  path.join(base, 'cap3', 'y.mdx'),
  `---
title: "C3"
---
La respuesta, desde el Modo D, es no.
Confirmado con precisión absoluta, con precisión absoluta.
> *◆ *PRÁCTICA* texto**
`,
);

// Cap.4 (F2): el mismo tic de meta-elogio, pero PARTIDO por el hard-wrap a ~70
// caracteres, como están los MDX reales de Cap.2 y Cap.3. Antes del aplanado de
// párrafo esto era invisible al matcher línea-a-línea y se colaba: es el caso
// exacto de cap-2/12-schrodinger.mdx:394-395, que sobrevivió a la poda F3.
mkdirSync(path.join(base, 'cap4'), { recursive: true });
writeFileSync(
  path.join(base, 'cap4', 'z.mdx'),
  `---
title: "C4"
---
La pregunta será otra, más sutil y más bonita. Y la honestidad
epistémica del libro, modelada en cada Pausa Científica, será la brújula.

Este párrafo aparte NO debe fundirse con el anterior.
`,
);

const capitulos = [
  { tag: 'Obertura', root: 'obertura', moMin: 2, moMax: 10 }, // 3 en rango → OK
  { tag: 'Cap.3', root: 'cap3', moMin: 0, moMax: 0 }, // 0 en rango → OK; falla por andamiaje
  { tag: 'Cap.4', root: 'cap4', moMin: 0, moMax: 0 }, // 0 en rango → OK; falla por andamiaje partido
];

const { report, promesas, violaciones } = analizarCorpus(capitulos, base);
const ober = report.find((r) => r.cap.tag === 'Obertura');
const c3 = report.find((r) => r.cap.tag === 'Cap.3');
const c4 = report.find((r) => r.cap.tag === 'Cap.4');

test('cuenta Meta-Observador case-insensitive (3 en el fixture)', () => {
  assert.equal(ober.moTotal, 3);
  assert.equal(ober.moOk, true);
});

test('promesas: captura cuerpo, ignora frontmatter', () => {
  const refs = promesas.map((p) => p.ref);
  assert.ok(refs.includes('Cap. 2'), 'debe capturar "Cap. 2" del cuerpo');
  assert.ok(refs.includes('§3.3'), 'debe capturar "§3.3" del cuerpo');
  assert.ok(!refs.includes('Cap. 9'), 'NO debe capturar "Cap. 9" del frontmatter');
});

test('detecta la fuga "Modo D"', () => {
  const hit = c3.andamiajeHits.find((h) => h.nombre.includes('Modo D'));
  assert.ok(hit, 'debe registrar la fuga Modo D');
  assert.equal(hit.line, 4);
});

test('cuenta muletillas por ocurrencia (precisión absoluta ×2)', () => {
  assert.equal(c3.muletillaTotal['precisión absoluta'], 2);
});

test('énfasis sospechoso: blockquote con asteriscos impares', () => {
  assert.ok(c3.enfasisSospechoso >= 1);
});

test('regla FALLA: andamiaje suma violación aunque MO esté en rango', () => {
  // Obertura OK (0 viol); Cap.3 y Cap.4 con andamiaje → 2 violaciones.
  assert.equal(violaciones, 2);
});

// --- F2 · el arreglo del hard-wrap -----------------------------------------
test('atrapa el andamiaje PARTIDO por el salto de línea', () => {
  const hit = c4.andamiajeHits.find((h) => h.nombre.includes('meta-elogio'));
  assert.ok(hit, 'debe atrapar "honestidad\\nepistémica del libro" partida en dos líneas');
});

test('el reporte señala la línea REAL, no un offset del texto aplanado', () => {
  const hit = c4.andamiajeHits.find((h) => h.nombre.includes('meta-elogio'));
  // "honestidad" está en la línea 4 del archivo (tras el frontmatter de 3 líneas).
  assert.equal(hit.line, 4);
});

test('el aplanado NO cruza párrafos (una línea en blanco corta el match)', () => {
  const { flat } = flattenBody(['uno', 'dos', '', 'tres']);
  assert.equal(flat, 'uno dos\ntres');
});

test.after(() => rmSync(base, { recursive: true, force: true }));
