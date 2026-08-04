/**
 * Censo auditable del separador «·» (U+00B7) en el Acto I · Fase 1.
 *
 * CRITERIO DE CONTEO, declarado — sin esto la cifra no es auditable: el censo de
 * agentes dio 713 y el refutador 728, y la diferencia estaba justo aquí.
 *   · Universo: las 63 piezas vivas de las 5 unidades. `src/content/book/*` son
 *     monolíticos archivados y NO se renderizan: fuera.
 *   · Se cuenta el glifo en el ARCHIVO COMPLETO, frontmatter incluido:
 *     `headerLabel` y `subtitle` son parte del render.
 *   · Se EXCLUYEN los comentarios MDX: no llegan al lector.
 *   · Cada ocurrencia cae en UNA sola clase, por prioridad de contexto (la
 *     primera regla que casa, gana). El orden de abajo ES la especificación.
 *
 * Uso:  node scripts/_censo-punto-medio.mjs         → tabla
 *       node scripts/_censo-punto-medio.mjs b1 b2   → detalle de esas clases
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const contentDir = path.join(path.resolve(here, '..'), 'src', 'content');

const UNIDADES = [
  ['Obertura', 'obertura'],
  ['Cap.1', 'chapter-sections/cap-1-universo-sinfonia'],
  ['Cap.2', 'chapter-sections/cap-2-ciencia-escuchar'],
  ['Cap.3', 'chapter-sections/cap-3-mundo-cuantico'],
  ['Cap.4', 'chapter-sections/cap-4-biologia-campo-coherente'],
];

const CLASES = [
  ['b1', 'subtitle', 'RETIRAR'],
  ['b1t', 'title', 'RETIRAR'],
  ['b2', 'encabezado de cuerpo', 'RETIRAR'],
  ['b3', 'headerLabel (chrome)', 'conservar'],
  ['b4', 'dateline VozTejido', 'CONSERVAR · aprobado'],
  ['b5', 'ficha bibliografica', 'conservar'],
  ['b6', 'pie/atributo de figura', 'conservar'],
  ['b7', 'ornamento y arte ASCII', 'gate'],
  ['b8', 'vineta de blockquote', 'gate'],
  ['b9', 'glosario de formula', 'conservar'],
  ['b10', 'operador y unidades', 'conservar'],
  ['b11', 'rotulo de fase o acto', 'gate'],
  ['b12', 'prop de componente', 'gate'],
  ['b14', 'celda de tabla markdown', 'gate'],
  ['b15', 'frontispicio y colofon', 'conservar'],
  ['b13', 'sin clasificar', 'REVISAR'],
];

const PUNTO = '·';
const U = ['Obertura', 'Cap.1', 'Cap.2', 'Cap.3', 'Cap.4'];
const filas = Object.fromEntries(CLASES.map(([id]) => [id, Object.fromEntries(U.map((u) => [u, 0]))]));
const detalle = Object.fromEntries(CLASES.map(([id]) => [id, []]));

function mdxDe(rel) {
  const dir = path.join(contentDir, rel);
  if (!statSync(dir, { throwIfNoEntry: false })?.isDirectory()) return [];
  return readdirSync(dir).filter((f) => f.endsWith('.mdx')).map((f) => path.join(dir, f))
    .filter((p) => !/^\s*archived:\s*true/m.test(readFileSync(p, 'utf8')));
}

for (const [unidad, rel] of UNIDADES) {
  for (const p of mdxDe(rel)) {
    const t = readFileSync(p, 'utf8').replace(/\r\n/g, '\n');
    const lineas = t.split('\n');
    const finFm = t.startsWith('---') ? lineas.indexOf('---', 1) : -1;

    // Comentarios MDX, por offset absoluto.
    const coments = [];
    for (const m of t.matchAll(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g)) coments.push([m.index, m.index + m[0].length]);
    const off = []; let acc = 0;
    for (const l of lineas) { off.push(acc); acc += l.length + 1; }

    // Bloque bibliográfico: del rótulo hasta el cierre de caja o el siguiente encabezado.
    const bib = new Set();
    for (let i = 0; i < lineas.length; i++) {
      if (!/^\s*\*\*(Referencias|Para profundizar):\*\*/.test(lineas[i])) continue;
      for (let j = i; j < lineas.length; j++) {
        if (j > i && lineas[j].trim() === '' && (lineas[j + 1] ?? '').trim() === '') break;
        if (j > i && /^\s*<\/|^\s*#{2,4}\s|^\s*<h[1-6]/.test(lineas[j])) break;
        bib.add(j);
      }
    }
    // La OTRA superficie bibliográfica: las entradas de `## **Notas**`, que abren
    // con superíndice unicode y también encadenan fichas con « · ». Sin esto, esas
    // ocurrencias caían en «sin clasificar» aunque son bibliografía igual.
    for (let i = 0; i < lineas.length; i++) {
      if (/^[⁰¹²³⁴⁵⁶⁷⁸⁹]+\s/.test(lineas[i])) {
        for (let j = i; j < lineas.length && lineas[j].trim() !== ''; j++) bib.add(j);
      }
    }
    // Glosario de símbolos de <Formula> (slot="donde").
    const donde = new Set();
    let enDonde = false;
    for (let i = 0; i < lineas.length; i++) {
      if (/slot="donde"/.test(lineas[i])) enDonde = true;
      else if (enDonde && /^\s*<\/(div|Formula)>/.test(lineas[i])) enDonde = false;
      if (enDonde) donde.add(i);
    }
    // Dateline: primera línea en cursiva tras abrir una VozTejido.
    const dateline = new Set();
    for (let i = 0; i < lineas.length; i++) {
      if (!/<(VozTejido|OberturaVozTejido)\b/.test(lineas[i])) continue;
      for (let j = i + 1; j < Math.min(i + 6, lineas.length); j++) {
        if (lineas[j].trim() === '') continue;
        if (/^\s*[*_].*[*_]\s*$/.test(lineas[j])) dateline.add(j);
        break;
      }
    }
    // Bloque completo de <FiguraTDV …/>, que es multilínea.
    const figura = new Set();
    let enFig = false;
    for (let i = 0; i < lineas.length; i++) {
      if (/<FiguraTDV\b/.test(lineas[i])) enFig = true;
      if (enFig) figura.add(i);
      if (enFig && /\/>\s*$/.test(lineas[i])) enFig = false;
    }

    for (let i = 0; i < lineas.length; i++) {
      const linea = lineas[i];
      const izq = (k) => linea.slice(0, k);
      let desde = 0;
      for (;;) {
        const k = linea.indexOf(PUNTO, desde);
        if (k === -1) break;
        desde = k + 1;
        if (coments.some(([a, b]) => off[i] + k >= a && off[i] + k < b)) continue;

        let cls;
        if (finFm > 0 && i < finFm) {
          if (/^subtitle:/.test(linea)) cls = 'b1';
          else if (/^title:/.test(linea)) cls = 'b1t';
          else if (/^headerLabel:/.test(linea)) cls = 'b3';
          else cls = 'b13';
        } else if (/^\s*(#{1,6}\s|<h[1-6][\s>])/.test(linea)) cls = 'b2';
        else if (dateline.has(i)) cls = 'b4';
        else if (bib.has(i)) cls = 'b5';
        else if (figura.has(i)) cls = 'b6';
        else if (donde.has(i)) cls = 'b9';
        // ATRIBUTO JSX antes que nada más: `duracion="~8 minutos · en cualquier
        // momento"` es una prop, no un operador ni una enumeración de prosa. Se
        // detecta por paridad de comillas a la izquierda: dentro de un atributo el
        // número de `"` previas es impar.
        else if (((izq(k).match(/"/g) ?? []).length % 2) === 1) cls = 'b12';
        else if (/^\s*\|.*\|\s*$/.test(linea)) cls = 'b14';
        // OPERADOR · dos formas. (a) multiplicación de unidades, PEGADA a sus
        // operandos: `fotones·cm^-2·s^-1`. (b) producto de incertidumbre, con aire
        // pero en vecindario matemático inequívoco. La primera versión de esta
        // regla solo miraba «hay alfanumérico cerca» y se tragaba props, celdas y
        // colofones: 122 aciertos de los que casi ninguno era una unidad.
        else if (k > 0 && linea[k - 1] !== ' ' && linea[k + 1] !== ' ') cls = 'b10';
        else if (/[σΔδℏπλνμΨψφ≥≤≈×∫∂√]/
          .test(linea.slice(Math.max(0, k - 14), k + 14))) cls = 'b10';
        // Arte ASCII de los mapa-cierre: cajas de líneas y rótulos en versalitas.
        else if (/[─-╿]/.test(linea) || /^[^a-záéíóúñ]*$/.test(linea.trim())) cls = 'b7';
        else if (/^\s*[·\s—◇◆*_<>/\\|+.-]*$/.test(linea)) cls = 'b7';
        // Viñeta de lista: el glifo ABRE la línea y hace de topo. En blockquote
        // (`> **· término** · glosa`, exclusivo del Cap. 1) o suelta a inicio de
        // línea (las listas del mapa-cierre del Cap. 3).
        else if (/^\s*>\s*\*\*/.test(linea) || linea.slice(0, k).trim() === '') cls = 'b8';
        // Rótulo de fase o acto. El ordinal se busca en TODO el tramo previo al
        // glifo, no en los primeros 40 caracteres: el hard-wrap a ~70 columnas
        // parte estos rótulos y la versión acotada dejaba siete fuera.
        else if (/^\s*\*\*/.test(linea)
          && /\b(primer|segund|tercer|cuart|quint|sext|acto|fase|paso|parte|movimiento|coda|diferencia|cambio)\w*\b/i.test(izq(k))) cls = 'b11';
        else if (/frontispiece|copyright-edition/.test(linea) || /^\s*\*Fin del/.test(linea)) cls = 'b15';
        else cls = 'b13';

        filas[cls][unidad]++;
        detalle[cls].push({ f: path.relative(contentDir, p).replace(/\\/g, '/'), l: i + 1, txt: linea.trim().slice(0, 116) });
      }
    }
  }
}

const pedidas = process.argv.slice(2);
if (pedidas.length) {
  for (const id of pedidas) {
    const nombre = (CLASES.find((c) => c[0] === id) ?? [, '?'])[1];
    console.log(`\n=== ${id} · ${nombre} · ${detalle[id].length} ===`);
    for (const d of detalle[id]) console.log(`  ${d.f}:${d.l}\n     ${d.txt}`);
  }
  process.exit(0);
}

console.log('\ncenso del punto medio · Acto I · comentarios MDX excluidos\n');
console.log(`  ${'clase'.padEnd(30)}${U.map((u) => u.padStart(9)).join('')}${'TOTAL'.padStart(9)}   destino`);
let tot = 0;
for (const [id, nombre, destino] of CLASES) {
  const s = U.reduce((a, u) => a + filas[id][u], 0);
  tot += s;
  if (s === 0) continue;
  console.log(`  ${(id + ' ' + nombre).padEnd(30)}${U.map((u) => String(filas[id][u]).padStart(9)).join('')}${String(s).padStart(9)}   ${destino}`);
}
const suma = (ids) => ids.reduce((a, id) => a + U.reduce((b, u) => b + filas[id][u], 0), 0);
console.log(`  ${''.padEnd(30)}${U.map(() => '-'.padStart(9)).join('')}${String(tot).padStart(9)}`);
console.log(`\n  SE RETIRAN  b1+b1t+b2 ....... ${suma(['b1', 'b1t', 'b2'])} de ${tot}  (${((100 * suma(['b1', 'b1t', 'b2'])) / tot).toFixed(1)} %)`);
console.log(`  se conservan ................ ${suma(['b3', 'b4', 'b5', 'b6', 'b9', 'b10', 'b15'])}`);
console.log(`  quedan a gate ............... ${suma(['b7', 'b8', 'b11', 'b12', 'b14'])}`);
console.log(`  sin clasificar (revisar) .... ${suma(['b13'])}`);
