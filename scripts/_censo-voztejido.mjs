/**
 * Censo de las cabeceras de <VozTejido> · Fase 4.
 *
 * Ricardo aprobo el formato de la voz de Verdi (cap-1/05-frecuencias-sagradas:73),
 * que tiene SIETE elementos:
 *   1 eyebrow «VOZ DEL TEJIDO»      ← lo pone el componente
 *   2 nombre en cursiva              ← lo pone el componente (system.css)
 *   3 DATELINE  «*1813 — 1901 · Compositor italiano, defensor de…*»   ← a mano
 *   4 CITA destacada en blockquote, comillas angulares, cursiva        ← a mano
 *   5 ATRIBUCION tras raya, en la misma linea de la cita               ← a mano
 *   6 encabezado en negrita que nombra el conflicto                    ← a mano
 *   7 prosa
 *
 * Los elementos 1 y 2 estan en el 100 % por construccion. Este censo mide los
 * cuatro que dependen de que el autor los escriba: 3, 4, 5 y 6.
 *
 * Uso:  node scripts/_censo-voztejido.mjs        → tabla
 *       node scripts/_censo-voztejido.mjs --det  → una linea por voz
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

function mdxDe(rel) {
  const dir = path.join(contentDir, rel);
  if (!statSync(dir, { throwIfNoEntry: false })?.isDirectory()) return [];
  return readdirSync(dir).filter((f) => f.endsWith('.mdx')).map((f) => path.join(dir, f))
    .filter((p) => !/^\s*archived:\s*true/m.test(readFileSync(p, 'utf8')));
}

const voces = [];
for (const [unidad, rel] of UNIDADES) {
  for (const p of mdxDe(rel)) {
    const lineas = readFileSync(p, 'utf8').replace(/\r\n/g, '\n').split('\n');
    for (let i = 0; i < lineas.length; i++) {
      const m = lineas[i].match(/<(VozTejido|OberturaVozTejido)\b([^>]*)>/);
      if (!m) continue;
      const props = m[2];
      const nombre = (props.match(/(?:titulo|name)="([^"]*)"/) ?? [])[1] ?? '?';
      // Cuerpo de la voz: hasta su cierre.
      const cuerpo = [];
      for (let j = i + 1; j < lineas.length; j++) {
        if (new RegExp(`</${m[1]}>`).test(lineas[j])) break;
        cuerpo.push(lineas[j]);
      }
      // Las tres primeras piezas no vacias, que es donde vive la cabecera.
      const utiles = cuerpo.filter((l) => l.trim() !== '');
      const cab = utiles.slice(0, 6).join('\n');

      // 3 · DATELINE: linea entera en cursiva con « · », o con un rango de fechas.
      const dateline = utiles.slice(0, 2).some((l) =>
        /^\s*[*_][^*_].*[*_]\s*$/.test(l) && (/ · /.test(l) || /\d{3,4}\s*[—–-]\s*\d{3,4}/.test(l)));
      // 3b · fechas EN ALGUN SITIO de la cabecera o del titulo (el canon del Cap.2
      // las mete dentro del propio titulo= del componente).
      const fechas = /\d{3,4}\s*[—–-]\s*\d{3,4}/.test(nombre + '\n' + cab);
      // 4 · CITA destacada: blockquote con comillas angulares.
      const cita = /^\s*>/m.test(cab) && /[«»]/.test(cab);
      // 5 · ATRIBUCION: raya seguida de fuente. Va en la MISMA linea que la cita,
      // tras el cierre de comilla angular Y el asterisco que cierra la cursiva
      // («…no se agite.»* — Carta al Ministerio…»), o en linea propia dentro del
      // blockquote. La primera version de esta regla no contaba el asterisco de
      // en medio y daba «sin atribucion» al propio ejemplar aprobado.
      const atrib = /[»"][*_]*\s*—\s*\S/.test(cab) || /^\s*>?\s*—\s*\S/m.test(cab);
      // 6 · encabezado en negrita o ####.
      const enca = cuerpo.some((l) => /^\s*#{3,4}\s+\S/.test(l) || /^\s*\*\*[^*]+\*\*\s*$/.test(l));

      voces.push({ unidad, f: path.relative(contentDir, p).replace(/\\/g, '/'), linea: i + 1,
        comp: m[1], nombre, dateline, fechas, cita, atrib, enca,
        completa: dateline && cita && atrib });
      i += cuerpo.length;
    }
  }
}

if (process.argv.includes('--det')) {
  for (const v of voces) {
    const s = (b) => (b ? '#' : '.');
    console.log(`  ${s(v.dateline)}${s(v.cita)}${s(v.atrib)}${s(v.enca)}  ${v.unidad.padEnd(9)} ${(v.f + ':' + v.linea).padEnd(62)} ${v.nombre}`);
  }
  console.log('\n  columnas: dateline · cita · atribucion · encabezado');
  process.exit(0);
}

const U = ['Obertura', 'Cap.1', 'Cap.2', 'Cap.3', 'Cap.4'];
console.log('\ncabeceras de VozTejido · elementos 3-6 del formato aprobado\n');
console.log(`  ${'unidad'.padEnd(11)}${'voces'.padStart(7)}${'dateline'.padStart(10)}${'fechas'.padStart(8)}${'cita'.padStart(7)}${'atrib'.padStart(7)}${'encab'.padStart(7)}${'completas'.padStart(11)}`);
for (const u of U) {
  const vs = voces.filter((v) => v.unidad === u);
  if (!vs.length) continue;
  const c = (k) => vs.filter((v) => v[k]).length;
  console.log(`  ${u.padEnd(11)}${String(vs.length).padStart(7)}${String(c('dateline')).padStart(10)}${String(c('fechas')).padStart(8)}${String(c('cita')).padStart(7)}${String(c('atrib')).padStart(7)}${String(c('enca')).padStart(7)}${String(c('completa')).padStart(11)}`);
}
const c = (k) => voces.filter((v) => v[k]).length;
console.log(`  ${''.padEnd(11)}${'-'.padStart(7)}${'-'.padStart(10)}${'-'.padStart(8)}${'-'.padStart(7)}${'-'.padStart(7)}${'-'.padStart(7)}${'-'.padStart(11)}`);
console.log(`  ${'TOTAL'.padEnd(11)}${String(voces.length).padStart(7)}${String(c('dateline')).padStart(10)}${String(c('fechas')).padStart(8)}${String(c('cita')).padStart(7)}${String(c('atrib')).padStart(7)}${String(c('enca')).padStart(7)}${String(c('completa')).padStart(11)}`);
console.log(`\n  componentes: ${[...new Set(voces.map((v) => v.comp))].join(' · ')}`);
