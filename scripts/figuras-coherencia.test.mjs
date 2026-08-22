/**
 * Coherencia cifra <-> cuerpo en los metadatos de figura.
 *
 * QUÉ COMPRUEBA
 *   Toda cifra con unidad (`s`, `Hz`, `kHz`, `dB`, `m`, `pm`, `%`…) que aparezca en un
 *   atributo `alt=` o `descripcion=` de una figura aparece TAMBIÉN en el cuerpo de esa
 *   misma sección, con el mismo valor — en dígitos o escrita con letra.
 *
 * QUÉ NO COMPRUEBA — y no puede
 *   Que la cifra sea CIERTA. Este test compara dos sitios del repo entre sí; si el cuerpo
 *   y el `alt` mienten los dos igual, pasa en verde. Prometer más sería peor que no existir.
 *
 * POR QUÉ EXISTE
 *   La Figura 1.7 de la §1.5 ha mentido tres veces. El caso que da nombre a este test es el
 *   «Chartres · 5s» del PR #148: una reverberación que vivía SOLO en el `alt`, que el cuerpo
 *   no sostenía y que nadie había medido. Se retiró del atributo… y siguió publicada dentro
 *   del PNG hasta el 22-ago-2026, porque ningún gate mira dentro de una imagen. Este test
 *   tampoco lo hace: cubre el texto, que es lo que sí se puede automatizar.
 *
 * ALCANCE — declarado, no supuesto
 *   · Entran los atributos `alt` y `descripcion` de cualquier componente, en todas las
 *     secciones del libro. Hoy: 102 atributos con 35 cifras.
 *   · El cuerpo se define como el fichero MENOS esos atributos, para que una cifra no pueda
 *     validarse a sí misma ni validarse con otro metadato.
 *   · Un rango `6-8 s` son DOS cifras y las dos se comprueban. La primera versión de este
 *     patrón se comía la primera del rango, así que un número inventado en el extremo bajo
 *     habría pasado limpio.
 *   · Fuera: el texto quemado dentro de las imágenes, que es donde sobrevivió el 5s.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = process.env.TDV_CONTENT_DIR
  ?? join(fileURLToPath(new URL('../src/content/chapter-sections', import.meta.url)));

const RE_ATTR = /(alt|descripcion)="([^"]*)"/g;
/** Número (o rango) seguido de unidad. Las unidades van ancladas para que `m` no case
 *  dentro de una palabra ni `s` dentro de «los». */
const RE_CIFRA = /((?:\d+(?:[.,]\d+)?)(?:\s*[-–—]\s*\d+(?:[.,]\d+)?)?)\s*(kHz|Hz|hercios?|dB|pm|nm|km|cm|mm|m|metros?|segundos?|s|%)(?![a-záéíóúñ])/gi;

/** Un número escrito con letra, 1-999. El cuerpo del libro alterna dígitos y letra sin
 *  criterio fijo: «doscientos sesenta metros» en el texto y «260 m» en el `alt` son la
 *  MISMA cifra, y tratarlas como distintas produce un falso positivo que acaba
 *  desactivando el test. */
const UNIDADES = ['', 'un', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve'];
const DIEZ_A_QUINCE = ['diez', 'once', 'doce', 'trece', 'catorce', 'quince'];
const DECENAS = ['', '', 'veinte', 'treinta', 'cuarenta', 'cincuenta', 'sesenta', 'setenta', 'ochenta', 'noventa'];
const CENTENAS = ['', 'ciento', 'doscientos', 'trescientos', 'cuatrocientos', 'quinientos',
  'seiscientos', 'setecientos', 'ochocientos', 'novecientos'];

function enLetra(n) {
  if (!Number.isInteger(n) || n < 1 || n > 999) return null;
  if (n === 100) return 'cien';
  const c = Math.floor(n / 100), d = Math.floor((n % 100) / 10), u = n % 10;
  const partes = [];
  if (c) partes.push(CENTENAS[c]);
  const resto = n % 100;
  if (resto >= 10 && resto <= 15) partes.push(DIEZ_A_QUINCE[resto - 10]);
  else if (resto >= 16 && resto <= 19) partes.push(`dieci${UNIDADES[u]}`);
  else if (resto >= 21 && resto <= 29) partes.push(`veinti${UNIDADES[u]}`);
  else {
    if (d) partes.push(DECENAS[d]);
    if (u) partes.push(d >= 3 ? `y ${UNIDADES[u]}` : UNIDADES[u]);
  }
  return partes.join(' ').trim() || null;
}

/**
 * Cifras que HOY viven solo en un metadato y que el cuerpo no respalda. No son ruido:
 * son la deuda que este test destapó al escribirlo, verificada una por una. Se declaran
 * para que el gate nazca en verde — un test que nace en rojo se desactiva al día
 * siguiente — y para que queden a la vista en vez de disolverse.
 *
 * 🔴 Ninguna es «correcta»: todas están pendientes de que su campaña de capítulo decida
 * si la cifra entra al cuerpo con su fuente o sale del metadato. Cualquier cifra NUEVA sin
 * respaldo hace fallar el test.
 */
const CIFRAS_SIN_CUERPO = new Map([
  ['02-aum-primordial.mdx|1,6|kHz', 'descripcion de figura: el cuerpo no menciona esa frecuencia — pendiente §1.1'],
  ['05-frecuencias-sagradas.mdx|410|Hz', 'alt: rango de afinaciones históricas que el cuerpo no da — pendiente §1.4'],
  ['05-frecuencias-sagradas.mdx|450|Hz', 'alt: el otro extremo del mismo rango — pendiente §1.4'],
  ['06-helmholtz.mdx|20|kHz', 'alt y descripcion: el rango audible no aparece en el cuerpo — pendiente cap. 2'],
  ['06-helmholtz.mdx|20|Hz', 'alt y descripcion: el otro extremo del mismo rango — pendiente cap. 2'],
  ['08-atomo.mdx|52.9|pm', 'alt: el cuerpo no da el radio de Bohr en picómetros — pendiente cap. 3'],
]);

function secciones() {
  const out = [];
  for (const cap of readdirSync(RAIZ)) {
    const dir = join(RAIZ, cap);
    if (!statSync(dir).isDirectory()) continue;
    for (const f of readdirSync(dir).filter((x) => x.endsWith('.mdx')).sort()) {
      out.push({ cap, f, ruta: `${cap}/${f}`, texto: readFileSync(join(dir, f), 'utf8') });
    }
  }
  return out;
}

/**
 * Contextos en que «<n>s» o «<n>m» NO son una magnitud.
 * El caso real: los orbitales atómicos del cap. 3 se escriben `1s`, `2s`, `2p`, y sin
 * esto el test los lee como «2 segundos». Un guard con falsos positivos deja de vigilar
 * en cuanto alguien se cansa de verlo en rojo.
 */
const NO_ES_MAGNITUD = /orbital(es)?\s*$|orbital(es)?\s+\S{0,12}$/i;

function cifrasDe(texto) {
  const out = [];
  for (const [, attr, valor] of texto.matchAll(RE_ATTR))
    for (const m of valor.matchAll(RE_CIFRA)) {
      const [, grupo, unidad] = m;
      // Ventana anterior al número, para descartar notaciones que no son magnitudes.
      if (NO_ES_MAGNITUD.test(valor.slice(Math.max(0, m.index - 40), m.index))) continue;
      for (const num of grupo.split(/\s*[-–—]\s*/))
        out.push({ attr, num: num.trim(), unidad });
    }
  return out;
}

/** Formas en que el cuerpo puede escribir cada unidad. */
const FORMAS = {
  s: 's|segundos?', segundo: 's|segundos?', segundos: 's|segundos?',
  hz: 'Hz|hercios?', hercio: 'Hz|hercios?', hercios: 'Hz|hercios?',
  khz: 'kHz|kilohercios?', db: 'dB|decibelios?',
  m: 'm|metros?', metro: 'm|metros?', metros: 'm|metros?',
  km: 'km|kil[óo]metros?', cm: 'cm|cent[íi]metros?', mm: 'mm|mil[íi]metros?',
  pm: 'pm|pic[óo]metros?', nm: 'nm|nan[óo]metros?',
  '%': '%|por ciento',
};

/**
 * ¿Está esa MAGNITUD en el cuerpo? No basta con que aparezca el número: hay que
 * encontrarlo acompañado de su unidad.
 *
 * 🔴 La primera versión solo buscaba el número, y por eso el control negativo pasó en
 * verde contra el texto que contenía el «Chartres · 5s»: en el cuerpo había un «5»
 * cualquiera —dentro de otra frase— y lo daba por respaldado. Comparar dígitos sueltos
 * es comparar nada.
 *
 * La unidad no tiene que ir pegada al número: el cuerpo escribe «entre seis y ocho
 * segundos», donde «seis» y «segundos» están a veinte caracteres. Se admite esa
 * distancia, pero dentro de la misma frase.
 */
const VENTANA = 60;
function respaldada(num, unidad, cuerpo) {
  const n = Number(num.replace(',', '.'));
  const formas = FORMAS[unidad.toLowerCase()] ?? unidad.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const variantes = new Set([num, String(n)]);
  const letra = enLetra(n);
  if (letra) variantes.add(letra);

  for (const v of variantes) {
    const p = v.replace(/[.,]/g, '[.,]');
    // El número, y dentro de los siguientes VENTANA caracteres su unidad, sin que
    // medie un punto y seguido (que ya sería otra afirmación).
    const re = new RegExp(`(?<![\\d.,${'\\w'}])${p}(?![\\d.,])[^.\\n]{0,${VENTANA}}?\\b(?:${formas})\\b`, 'i');
    if (re.test(cuerpo)) return true;
  }
  return false;
}

const datos = secciones().map((s) => ({
  ...s,
  cifras: cifrasDe(s.texto),
  cuerpo: s.texto.replace(RE_ATTR, ' '),
}));

// ── control positivo ────────────────────────────────────────────────────────────
// Un libro sin figuras y un regex roto se ven IGUAL desde dentro del test. Solo uno
// de los dos es un problema del libro.

test('control positivo: los patrones siguen encontrando material', () => {
  const AVISO = 'revisar este test antes que el código';
  const nAttr = datos.reduce((n, s) => n + [...s.texto.matchAll(RE_ATTR)].length, 0);
  const nCifras = datos.reduce((n, s) => n + s.cifras.length, 0);

  // Umbrales bajos a propósito: distinguen «el patrón se rompió» (cae a 0 o casi) de
  // «hay menos figuras que antes», que es una edición normal. Hoy: 48 / 102 / 35.
  assert.ok(datos.length >= 20,
    `solo ${datos.length} secciones leídas: RAIZ o el filtro .mdx dejaron de funcionar — ${AVISO}`);
  assert.ok(nAttr >= 40,
    `solo ${nAttr} atributos alt/descripcion en todo el libro: RE_ATTR dejó de casar — ${AVISO}`);
  assert.ok(nCifras >= 15,
    `solo ${nCifras} cifras con unidad extraídas: RE_CIFRA dejó de casar — ${AVISO}`);
});

test('control positivo: el conversor de número a letra sigue vivo', () => {
  // Si `enLetra` se rompe, el test empieza a marcar como huérfanas las cifras que el
  // cuerpo escribe con palabras — y a los dos días alguien lo desactiva por ruidoso.
  assert.equal(enLetra(260), 'doscientos sesenta');
  assert.equal(enLetra(6), 'seis');
  assert.equal(enLetra(15), 'quince');
  assert.equal(enLetra(21), 'veintiun');
  assert.equal(enLetra(100), 'cien');
  assert.equal(enLetra(1000), null);
});

test('control positivo: la comparación exige la UNIDAD, no solo el número', () => {
  // 🔴 El caso que hizo pasar en falso la primera versión de este test: el «5s» del
  // `alt` de Chartres se daba por respaldado porque en el cuerpo había un «5» suelto
  // en otra frase. Comparar dígitos sin su unidad es no comparar nada.
  assert.equal(respaldada('5', 's', 'la voz se apagaba en 5 segundos'), true);
  assert.equal(respaldada('5', 's', 'Entre 1.5 y 2.5 segundos, la reverberación cambia'), false,
    'un 5 dentro de otro número o de otra magnitud NO respalda un «5 s»');
  assert.equal(respaldada('5', 's', 'había 5 catedrales y un laberinto'), false,
    'un 5 sin unidad de tiempo NO respalda un «5 s»');
  // Y la flexibilidad que el cuerpo real necesita: número y unidad separados.
  assert.equal(respaldada('6', 's', 'tardaba entre seis y ocho segundos en soltarlo'), true);
  assert.equal(respaldada('260', 'm', 'una ruta de unos doscientos sesenta metros'), true);
});

// ── invariante ──────────────────────────────────────────────────────────────────

test('toda cifra de un alt o una descripcion está en el cuerpo de su sección', () => {
  const huerfanas = [];
  for (const s of datos)
    for (const c of s.cifras) {
      if (CIFRAS_SIN_CUERPO.has(`${s.f}|${c.num}|${c.unidad}`)) continue;
      if (!respaldada(c.num, c.unidad, s.cuerpo)) huerfanas.push(`${s.ruta}  ${c.attr}="… ${c.num} ${c.unidad} …"`);
    }

  assert.deepEqual(huerfanas, [],
    `${huerfanas.length} cifra(s) que viven solo en los metadatos de una figura.\n` +
    'Un `alt` no es una fuente: si la cifra importa, va en el cuerpo con sus condiciones;\n' +
    'si no, sale del atributo. Es la familia del «Chartres · 5s» del PR #148.\n' +
    huerfanas.map((h) => `  · ${h}`).join('\n'));
});

test('las excepciones declaradas siguen existiendo', () => {
  // Una excepción que ya no corresponde a ninguna cifra es basura que tapa fallos futuros.
  const vivas = new Set(datos.flatMap((s) => s.cifras.map((c) => `${s.f}|${c.num}|${c.unidad}`)));
  const muertas = [...CIFRAS_SIN_CUERPO.keys()].filter((k) => !vivas.has(k));
  assert.deepEqual(muertas, [],
    'excepciones que ya no apuntan a ninguna cifra — retíralas de CIFRAS_SIN_CUERPO:\n' +
    muertas.map((m) => `  · ${m}`).join('\n'));
});
