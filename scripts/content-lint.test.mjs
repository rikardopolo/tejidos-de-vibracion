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

// --- F9: ref-encadenada en el FORMATO CANÓNICO que la Fase 3 impuso ---
// El cerrojo antiguo cortaba el bloque en la primera línea en blanco. Como el
// formato que la propia F3 dejó es «rótulo → línea en blanco → una ficha por
// párrafo», el bloque se quedaba siempre en la línea del rótulo: 34 de 34 bloques
// del corpus real inspeccionaban UNA línea, con 133 fichas fuera de su vista.
// Este fixture reproduce ese formato, con dos fichas juntas en el último párrafo.
mkdirSync(path.join(base, 'cap7'), { recursive: true });
writeFileSync(
  path.join(base, 'cap7', 'refs.mdx'),
  `---
title: "C7"
---
Prosa que introduce el aparato bibliográfico, para que la caja no abra en seco.

**Referencias:**

Casimir, H. B. G. (1948). *On the attraction between two perfectly conducting
plates*. Proceedings of the Royal Netherlands Academy, 51, 793–795.

Planck Collaboration (2020). *Planck 2018 results VI*. Astronomy & Astrophysics,
641, A6. · Weinberg, S. (1989). *The cosmological constant problem*. Reviews of
Modern Physics, 61(1), 1–23.

Una muletilla partida por el hard-wrap, que el contador en crudo no veía: esto es
divulgación
apresurada, y debe contarse igual.
`,
);

// Control negativo: el MISMO formato, sin ninguna ficha encadenada. Si esto
// dispara, el cerrojo nuevo sobre-reporta y es tan inútil como el que ciega.
mkdirSync(path.join(base, 'cap8'), { recursive: true });
writeFileSync(
  path.join(base, 'cap8', 'refs-ok.mdx'),
  `---
title: "C8"
---
Prosa que introduce el aparato bibliográfico.

**Referencias:**

Casimir, H. B. G. (1948). *On the attraction between two perfectly conducting
plates*. Proceedings of the Royal Netherlands Academy, 51, 793–795.

Jacques, V., Wu, E., Grosshans, F., et al. (2007). Experimental realization of
Wheeler's delayed-choice gedanken experiment. *Science, 315*(5814), 966–968.

Longair, M. (2015). «A commentary on Maxwell (1865) 'A dynamical theory of the
electromagnetic field'.» *Philosophical Transactions A*, 373(2039), 20140473.

**Para profundizar:**

Milonni, P. W. (1994). *The Quantum Vacuum*. San Diego: Academic Press.
`,
);

const capitulos = [
  { tag: 'Obertura', root: 'obertura', moMin: 2, moMax: 10 }, // 3 en rango → OK
  { tag: 'Cap.3', root: 'cap3', moMin: 0, moMax: 0 }, // 0 en rango → OK; falla por andamiaje
  { tag: 'Cap.4', root: 'cap4', moMin: 0, moMax: 0 }, // 0 en rango → OK; falla por andamiaje partido
];

// Los fixtures de dup-titulo van en una llamada APARTE, y no es cosmético: sus
// aciertos son, por definición, aciertos de cerrojo, y `analizarCorpus` suma los
// cerrojos al contador de violaciones cuando LINT_ESTRICTO=1. Mezclarlos con los
// capítulos de arriba hacía que «violaciones === 2» pasara o fallara según una
// variable de entorno heredada de la shell — una prueba que depende de cómo la
// invoques no prueba nada. Separadas, las dos quedan exactas en los dos modos.
const capitulosDup = [
  // El fixture nombra «Meta-Observador» a propósito (es el falso positivo que hay
  // que NO disparar), así que su rango lo admite: aquí no se prueba esa métrica.
  { tag: 'Cap.5', root: 'cap5', moMin: 0, moMax: 5 },
  { tag: 'Cap.6', root: 'cap6', moMin: 0, moMax: 0 }, // glosa == subtítulo
];

// --- F9: muletillas como cerrojo de DENSIDAD, no de total ---
// El total por capítulo no distinguía un vicio de un vocabulario: la lectura a mano
// de las 27 ocurrencias del Acto I encontró que 14 eran portantes. Lo que sí es
// señal es la concentración: la misma locución 3 veces en UNA pieza. Estas dos
// piezas suman 5 ocurrencias —el mismo total— pero solo una está concentrada.
mkdirSync(path.join(base, 'cap9'), { recursive: true });
writeFileSync(
  path.join(base, 'cap9', 'densa.mdx'),
  `---
title: "C9 densa"
---
El experimento se verificó con precisión absoluta en 1998. La predicción se
confirmó con precisión absoluta una década después, y el modelo sigue
reproduciendo el espectro con precisión
absoluta hasta hoy.
`,
);
writeFileSync(
  path.join(base, 'cap9', 'sobria.mdx'),
  `---
title: "C9 sobria"
---
La medida se confirmó con precisión absoluta en el laboratorio. Nada más se
sigue de ahí, salvo que el aparato reproduce el patrón con precisión absoluta.
`,
);

const capitulosRef = [
  { tag: 'Cap.7', root: 'cap7', moMin: 0, moMax: 0 },
  { tag: 'Cap.8', root: 'cap8', moMin: 0, moMax: 0 },
  { tag: 'Cap.9', root: 'cap9', moMin: 0, moMax: 0 },
];

const { report, promesas, violaciones } = analizarCorpus(capitulos, base);
const reporteDup = analizarCorpus(capitulosDup, base).report;
const reporteRef = analizarCorpus(capitulosRef, base).report;
const c7 = reporteRef.find((r) => r.cap.tag === 'Cap.7');
const c8 = reporteRef.find((r) => r.cap.tag === 'Cap.8');
const c9 = reporteRef.find((r) => r.cap.tag === 'Cap.9');
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
  // Obertura no tiene andamiaje; Cap.3 y Cap.4 sí, y ambos tienen el
  // Meta-Observador dentro de rango: la violación viene del andamiaje.
  //
  // Se comprueba la AFIRMACIÓN, no un total. El total exacto depende de
  // LINT_ESTRICTO, que suma además cerrojos y lemas: el fixture de Cap.4 dice
  // «honestidad» en unas treinta palabras, densidad que dispara de sobra el techo
  // de la familia honest*. Con `assert.equal(violaciones, 2)` esta prueba pasaba
  // o fallaba según una variable de entorno heredada de la shell — y una prueba
  // que depende de cómo la invoques no prueba nada. (Fragilidad anterior a la
  // Fase 0: la versión de main del 3-ago fallaba igual con LINT_ESTRICTO=1.)
  const conAndamiaje = report.filter((r) => r.andamiajeHits.length > 0);
  assert.deepEqual(conAndamiaje.map((r) => r.cap.tag), ['Cap.3', 'Cap.4']);
  assert.equal(ober.andamiajeHits.length, 0, 'la Obertura no debe aportar violación por andamiaje');
  assert.ok(violaciones >= conAndamiaje.length, 'cada unidad con andamiaje suma al menos una violación');
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
const c5 = reporteDup.find((r) => r.cap.tag === 'Cap.5');
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
  const dup6 = reporteDup.find((r) => r.cap.tag === 'Cap.6').cerrojoHits['dup-titulo'];
  assert.equal(dup6.length, 1, `esperaba 1 acierto, hubo ${dup6.length}: ${JSON.stringify(dup6)}`);
  assert.equal(dup6[0].line, 6, 'la glosa está en la línea 6 del fixture');
});

test('ref-encadenada · ve las fichas que están DEBAJO de la línea en blanco', () => {
  // Éste es el control positivo que faltaba. El cerrojo antiguo devolvía 0 aquí
  // sin haber mirado una sola ficha: si esta prueba vuelve a fallar, alguien ha
  // reintroducido un corte por línea en blanco y el 0 del corpus será mentira.
  const hits = c7.cerrojoHits['ref-encadenada'];
  assert.equal(hits.length, 1, `esperaba 1 acierto, hubo ${hits.length}: ${JSON.stringify(hits)}`);
  assert.match(hits[0].texto, /^2 fichas encadenadas/);
});

test('ref-encadenada · NO dispara con una ficha por párrafo', () => {
  // Control negativo, sobre el mismo formato y con DOS rótulos distintos, uno de
  // ellos «Para profundizar», que E4-c legitima como segundo aparato.
  //
  // Dos de estas fichas contienen una SEGUNDA fecha legítima: el número de
  // fascículo «*Science, 315*(5814)» y la obra comentada «Maxwell (1865)». Contar
  // años en vez del separador da 16 aciertos falsos sobre el corpus real; los tres
  // que sobreviven al acotado de rango son de este otro tipo. Una ficha puede
  // llevar varias fechas; lo que no puede es llevar un « · » entre medias.
  const hits = c8.cerrojoHits['ref-encadenada'];
  assert.equal(hits.length, 0, `no debía disparar, disparó: ${JSON.stringify(hits)}`);
});

test('muletillas · cuenta la que el hard-wrap parte en dos líneas', () => {
  // F2 pasó ANDAMIAJE y CERROJOS al cuerpo aplanado y dejó MULETILLAS en crudo,
  // así que toda muletilla de dos palabras partida por el salto de línea se
  // evadía sola. En el fixture, «divulgación\napresurada» va partida.
  assert.equal(c7.muletillaTotal['divulgación apresurada'], 1);
});

test('muletillas · señala la pieza CONCENTRADA, no el total del capítulo', () => {
  // Las dos piezas suman 5 ocurrencias; solo una las concentra. El cerrojo viejo
  // reportaba «Cap.9=5» y no distinguía cuál. Si esta prueba falla, alguien ha
  // devuelto el veredicto al total y el número volverá a señalar vocabulario.
  assert.equal(c9.muletillaTotal['precisión absoluta'], 5, 'el total sigue midiéndose');
  const densas = c9.muletillaDensa.filter((d) => d.muletilla === 'precisión absoluta');
  assert.equal(densas.length, 1, `esperaba 1 pieza densa, hubo ${densas.length}: ${JSON.stringify(densas)}`);
  assert.match(densas[0].file, /densa\.mdx$/);
  assert.equal(densas[0].n, 3);
});

test('muletillas · NO señala la pieza que la usa dos veces', () => {
  // Control negativo. Dos usos no son un estribillo, y la lectura a mano demostró
  // que la mayoría de las ocurrencias del corpus son portantes.
  assert.ok(
    !c9.muletillaDensa.some((d) => /sobria\.mdx$/.test(d.file)),
    `la pieza sobria no debía disparar: ${JSON.stringify(c9.muletillaDensa)}`,
  );
});

test('muletillas · la concentración se cuenta sobre el cuerpo APLANADO', () => {
  // La tercera ocurrencia del fixture va partida por el salto de línea
  // («con precisión\nabsoluta»). Contando en crudo saldrían 2 y la pieza no
  // dispararía: el cerrojo de densidad depende de que el aplanado funcione.
  const d = c9.muletillaDensa.find((x) => /densa\.mdx$/.test(x.file));
  assert.ok(d, 'la pieza densa debe disparar aun con una ocurrencia partida por el wrap');
  assert.equal(d.n, 3);
});

test.after(() => rmSync(base, { recursive: true, force: true }));
