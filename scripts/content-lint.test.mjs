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

// Cap.5 (F0) · los dos defectos del cerrojo dup-titulo, en un solo fixture.
// (1) el encabezado duplicado vive MUY por debajo de la línea 16 del cuerpo — con
//     la ventana vieja, esas 16 líneas se gastaban en blancos e imports;
// (2) el encabezado no es el subtítulo ENTERO sino el fragmento que queda a la
//     izquierda del «·», que es la forma real de la duplicación en el corpus.
// Y dos casos que NO deben disparar: el título como sujeto de una frase con
// predicado propio, y el valor viajando como prop de un componente.
mkdirSync(path.join(base, 'cap5'), { recursive: true });
writeFileSync(
  path.join(base, 'cap5', 'dup.mdx'),
  `---
title: "El Meta-Observador"
subtitle: "La cosmogonía vibracional · el AUM Primordial"
---

import Diamond from '@/components/book/Diamond.astro';
import FiguraTDV from '@/components/FiguraTDV.astro';
import VozTejido from '@/components/book/VozTejido.astro';
import Checkpoint from '@/components/book/Checkpoint.astro';
import Marginalia from '@/components/book/Marginalia.astro';

*Una glosa que entona en vez de informar*

— ◇ —

Prosa de relleno cuya única función es empujar el encabezado duplicado más allá
de la decimosexta línea del cuerpo, que es donde la ventana antigua dejaba de
mirar y por donde se escapaba el defecto.

<Marginalia titulo="La cosmogonía vibracional">
Aquí el valor viaja como PROP de un componente: NO debe disparar el cerrojo.
</Marginalia>

Más relleno todavía, porque el objetivo del fixture es justamente que el
encabezado quede lejos del principio y la prueba falle si alguien reintroduce
una ventana de longitud fija.

## **La Cosmogonía Vibracional**

Este encabezado ES el fragmento del subtítulo que queda a la izquierda del «·».
Debe dispararlo aunque no coincida con el subtítulo entero.

<h3 class="sub">Qué no es el Meta-Observador</h3>

Aquí el título es el SUJETO de una frase con predicado propio. Es escribir sobre
el tema de la pieza, no repetir su nombre: NO debe disparar.
`,
);

// Cap.6 (F0) · la glosa de apertura NO puede decir lo mismo que el subtítulo.
// Hoy en el corpus da cero, pero la fase de subtítulos va a reescribir 27 y nada
// impediría que uno acabe repitiendo la glosa que tiene tres líneas más abajo.
mkdirSync(path.join(base, 'cap6'), { recursive: true });
writeFileSync(
  path.join(base, 'cap6', 'glosa.mdx'),
  `---
title: "Una pieza cualquiera"
subtitle: "Cuando el silencio aprendió a cantar"
---

*Cuando el silencio aprendió a cantar*

— ◇ —

La glosa de arriba repite el subtítulo palabra por palabra: el lector lo lee dos
veces seguidas, en dos tipografías. E1 pide que la glosa ENTONE, no que informe.
`,
);

const capitulos = [
  { tag: 'Obertura', root: 'obertura', moMin: 2, moMax: 10 }, // 3 en rango → OK
  { tag: 'Cap.3', root: 'cap3', moMin: 0, moMax: 0 }, // 0 en rango → OK; falla por andamiaje
  { tag: 'Cap.4', root: 'cap4', moMin: 0, moMax: 0 }, // 0 en rango → OK; falla por andamiaje partido
  // El fixture nombra «Meta-Observador» a propósito (es el falso positivo que hay
  // que NO disparar), así que su rango lo admite: aquí no se prueba esa métrica.
  { tag: 'Cap.5', root: 'cap5', moMin: 0, moMax: 5 },
  { tag: 'Cap.6', root: 'cap6', moMin: 0, moMax: 0 }, // glosa == subtítulo
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

// --- F0 · el cerrojo dup-titulo reparado -----------------------------------
const c5 = report.find((r) => r.cap.tag === 'Cap.5');
const dup5 = c5.cerrojoHits['dup-titulo'];

test('dup-titulo · caza el fragmento del subtítulo partido por «·»', () => {
  assert.equal(dup5.length, 1, `esperaba 1 acierto, hubo ${dup5.length}: ${JSON.stringify(dup5)}`);
  assert.match(dup5[0].texto, /^subtitle/);
});

test('dup-titulo · ve MÁS ALLÁ de la línea 16 del cuerpo', () => {
  // El frontmatter ocupa 4 líneas, así que el cuerpo arranca en la 5. Con la
  // ventana antigua (16 líneas crudas, imports y blancos incluidos) el cerrojo
  // dejaba de mirar hacia la línea 20 del archivo. El encabezado está mucho
  // más abajo: si esta prueba falla, alguien ha reintroducido una ventana fija.
  assert.ok(dup5[0].line > 24, `el acierto está en la línea ${dup5[0].line}, demasiado arriba para probar nada`);
});

test('dup-titulo · NO dispara con el título como sujeto de una frase', () => {
  // «Qué no es el Meta-Observador» contiene el title entero, pero es escribir
  // sobre el tema de la pieza, no repetir su nombre. Por eso el título solo
  // dispara por igualdad. Los 5 falsos positivos que esto evitaba en el corpus
  // real eran todos de este patrón.
  assert.ok(!dup5.some((h) => h.texto.startsWith('title')), 'el título no debe disparar por contención');
});

test('dup-titulo · NO dispara con el valor como prop de un componente', () => {
  assert.ok(!dup5.some((h) => h.line === 22), 'la prop de <Marginalia> no es una duplicación de contenido');
});

test('dup-titulo · caza la glosa de apertura que repite el subtítulo', () => {
  const dup6 = report.find((r) => r.cap.tag === 'Cap.6').cerrojoHits['dup-titulo'];
  assert.equal(dup6.length, 1, `esperaba 1 acierto, hubo ${dup6.length}: ${JSON.stringify(dup6)}`);
  assert.equal(dup6[0].line, 6, 'la glosa está en la línea 6 del fixture');
});

test.after(() => rmSync(base, { recursive: true, force: true }));
