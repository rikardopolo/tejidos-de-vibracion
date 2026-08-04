/**
 * Censo y conciliacion de la superficie 2 de E4 · Fase 3.
 *
 * La superficie que Ricardo critica: «al estar agrupadas no se diferencia
 * claramente una referencia de otra». Son bloques con rotulo en negrita
 * —«**Referencias:**» / «**Para profundizar:**»— cuyas fichas van concatenadas
 * por « · » dentro de un parrafo unico.
 *
 * CRITERIO DE CONTEO, declarado:
 *   · Un BLOQUE es un rotulo en negrita a inicio de linea.
 *   · Sus FICHAS son los tramos separados por « · » (punto medio CON espacios a
 *     ambos lados) dentro del bloque. El punto medio pegado —operador de
 *     unidades— no separa fichas.
 *   · El bloque termina en linea en blanco doble, cierre de componente o
 *     encabezado.
 *   · La superficie 1 —`## **Notas**` con superindice— NO entra: es sana y no es
 *     lo criticado.
 *
 * QUE ES EXACTO Y QUE NO, declarado para que nadie lo lea al reves:
 *   · «bloques que AUN encadenan fichas en un parrafo» es EXACTO, y es el control
 *     de regresion de esta superficie. Debe ser 0. Lo vigila ademas el cerrojo
 *     `ref-encadenada` de content-lint.mjs, que es la red de verdad.
 *   · la columna «fichas» es COTA SUPERIOR en la forma via A: cuenta parrafos tras
 *     el rotulo, y si al bloque le sigue un parrafo de prosa sin marca —pasa en
 *     obertura/02-meta-observador y 03-interferometro— lo suma como si fuera ficha.
 *     Para conciliar de verdad, la prueba buena es el word-diff: normalizando el
 *     espacio y quitando el separador retirado, el texto debe ser identico.
 *
 * Uso:  node scripts/_censo-referencias.mjs          → tabla
 *       node scripts/_censo-referencias.mjs --fichas → cada ficha, para conciliar
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

const ROTULO = /^\s*\*\*(Referencias|Para profundizar|Referencias principales):\*\*/;

function mdxDe(rel) {
  const dir = path.join(contentDir, rel);
  if (!statSync(dir, { throwIfNoEntry: false })?.isDirectory()) return [];
  return readdirSync(dir).filter((f) => f.endsWith('.mdx')).map((f) => path.join(dir, f))
    .filter((p) => !/^\s*archived:\s*true/m.test(readFileSync(p, 'utf8')));
}

const bloques = [];
for (const [unidad, rel] of UNIDADES) {
  for (const p of mdxDe(rel)) {
    const lineas = readFileSync(p, 'utf8').replace(/\r\n/g, '\n').split('\n');
    for (let i = 0; i < lineas.length; i++) {
      if (!ROTULO.test(lineas[i])) continue;
      const rotulo = lineas[i].match(ROTULO)[1];
      const cuerpo = [];
      for (let j = i; j < lineas.length; j++) {
        if (j > i && lineas[j].trim() === '') break;
        if (j > i && /^\s*<\/|^\s*#{2,4}\s|^\s*<h[1-6]/.test(lineas[j])) break;
        cuerpo.push(lineas[j]);
      }
      // Aplanar el bloque: los MDX van hard-wrapped a ~72 columnas y una ficha
      // puede ocupar tres lineas. Sin aplanar, el conteo por « · » miente.
      const plano = cuerpo.join(' ').replace(/\s+/g, ' ').trim();
      const sinRotulo = plano.replace(ROTULO, '').replace(/^\s*\*\*[^*]+:\*\*\s*/, '').trim();
      let fichas = sinRotulo.split(' · ').map((f) => f.trim()).filter(Boolean);
      const encadenadas = fichas.length > 1;

      // FORMA VÍA A (desde la Fase 3): el rótulo queda solo en su línea y cada ficha
      // ocupa su propio párrafo. Entonces el «bloque» de arriba es solo el rótulo y
      // hay que seguir leyendo los párrafos siguientes. Sin esto el censo reportaba
      // «0 fichas» sobre un corpus intacto — un cero que parece pérdida de datos y
      // solo es la métrica midiendo la forma que ya no existe.
      let avance = cuerpo.length;
      if (!encadenadas) {
        fichas = [];
        let j = i + cuerpo.length;
        while (j < lineas.length) {
          if (lineas[j].trim() === '') { j++; continue; }
          const par = [];
          while (j < lineas.length && lineas[j].trim() !== '') { par.push(lineas[j]); j++; }
          const t = par.join(' ').replace(/\s+/g, ' ').trim();
          // Fin del bloque: etiqueta, encabezado, ornamento u otro rótulo.
          if (/^(<|#|\*\*|—|>|◆|◇)/.test(t)) break;
          fichas.push(t);
          avance = j - i;
        }
      }
      bloques.push({ unidad, f: path.relative(contentDir, p).replace(/\\/g, '/'), linea: i + 1, rotulo, n: fichas.length, fichas, lineas: cuerpo.length, encadenadas });
      i += avance - 1;
    }
  }
}

if (process.argv.includes('--fichas')) {
  for (const b of bloques) {
    console.log(`\n=== ${b.f}:${b.linea} · ${b.rotulo} · ${b.n} fichas · ${b.lineas} lineas ===`);
    b.fichas.forEach((f, k) => console.log(`  [${k + 1}] ${f}`));
  }
  console.log(`\nTOTAL: ${bloques.length} bloques · ${bloques.reduce((a, b) => a + b.n, 0)} fichas`);
  process.exit(0);
}

const U = ['Obertura', 'Cap.1', 'Cap.2', 'Cap.3', 'Cap.4'];
console.log('\nsuperficie 2 de E4 · bloques de bibliografia\n');
console.log(`  ${'unidad'.padEnd(12)}${'bloques'.padStart(9)}${'fichas'.padStart(9)}   rotulos`);
for (const u of U) {
  const bs = bloques.filter((b) => b.unidad === u);
  const rot = [...new Set(bs.map((b) => b.rotulo))].join(' · ') || '—';
  console.log(`  ${u.padEnd(12)}${String(bs.length).padStart(9)}${String(bs.reduce((a, b) => a + b.n, 0)).padStart(9)}   ${rot}`);
}
console.log(`  ${''.padEnd(12)}${'-'.padStart(9)}${'-'.padStart(9)}`);
console.log(`  ${'TOTAL'.padEnd(12)}${String(bloques.length).padStart(9)}${String(bloques.reduce((a, b) => a + b.n, 0)).padStart(9)}`);

const multi = bloques.filter((b) => b.encadenadas);
console.log(`\n  bloques que AUN encadenan fichas en un parrafo: ${multi.length}   ← debe ser 0 (E4, via A)`);
if (multi.length) console.log(`  el peor: ${multi.reduce((a, b) => (b.n > a.n ? b : a)).f} con ${multi.reduce((a, b) => (b.n > a.n ? b : a)).n}`);
const paraProf = bloques.filter((b) => b.rotulo === 'Para profundizar');
console.log(`  bloques «Para profundizar»: ${paraProf.length}  (${[...new Set(paraProf.map((b) => b.unidad))].join(', ') || '—'})`);
