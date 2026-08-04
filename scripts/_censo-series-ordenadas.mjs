/**
 * Censo de láminas con SERIE ORDENADA · Fase 8d.
 *
 * El riesgo que Ricardo destapó con la Figura 1.8: una lámina cuyo orden VISUAL
 * contradice el orden en que el texto la nombra. Ese orden vive en el píxel, así
 * que ningún grep llega — pero sí se puede acotar QUÉ láminas hay que abrir.
 *
 * Marca una lámina como «serie ordenada» si su alt o su descripcion contienen
 * señales de secuencia: escalas de frecuencia, líneas de tiempo, jerarquías,
 * enumeraciones, o palabras de dirección (arriba/abajo, ascendente/descendente).
 *
 * Uso:  node scripts/_censo-series-ordenadas.mjs
 */
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const raiz = path.resolve(here, '..');
const contentDir = path.join(raiz, 'src', 'content');

const UNIDADES = [
  ['Obertura', 'obertura'],
  ['Cap.1', 'chapter-sections/cap-1-universo-sinfonia'],
  ['Cap.2', 'chapter-sections/cap-2-ciencia-escuchar'],
  ['Cap.3', 'chapter-sections/cap-3-mundo-cuantico'],
  ['Cap.4', 'chapter-sections/cap-4-biologia-campo-coherente'],
];

// Señales de que la lámina presenta una SERIE con orden.
const SERIE = [
  [/\b(ascendente|descendente|de arriba (a|hacia) abajo|de abajo (a|hacia) arriba)\b/i, 'dirección explícita'],
  [/\b(línea de tiempo|cronolog|timeline|1[6-9]\d{2}\D+1[6-9]\d{2}|19\d{2}\D+(19|20)\d{2})\b/i, 'cronología'],
  [/\b(escala|espectro|gradiente|jerarqu|niveles|capas|plataformas)\b/i, 'escala o jerarquía'],
  [/\b(primero|segundo|tercero|cuarto|quinto|sexto)\b/i, 'ordinales'],
  [/\d+\s*Hz\D+\d+\s*Hz/i, 'serie de frecuencias'],
  [/\b(seis|cinco|cuatro|tres)\b[^.]{0,40}\b(paneles|filas|bandas|columnas|etapas|pasos|modos)\b/i, 'N elementos ordenados'],
];

function mdxDe(rel) {
  const dir = path.join(contentDir, rel);
  if (!statSync(dir, { throwIfNoEntry: false })?.isDirectory()) return [];
  return readdirSync(dir).filter((f) => f.endsWith('.mdx')).map((f) => path.join(dir, f))
    .filter((p) => !/^\s*archived:\s*true/m.test(readFileSync(p, 'utf8')));
}

const laminas = [];
for (const [unidad, rel] of UNIDADES) {
  for (const p of mdxDe(rel)) {
    const t = readFileSync(p, 'utf8').replace(/\r\n/g, '\n');
    for (const m of t.matchAll(/<FiguraTDV\b[\s\S]*?\/>/g)) {
      const g = (k) => (m[0].match(new RegExp(`${k}="([^"]*)"`, 's')) ?? [])[1] ?? '';
      const alt = g('alt'), desc = g('descripcion');
      const señales = SERIE.filter(([re]) => re.test(alt + ' ' + desc)).map(([, n]) => n);
      if (!señales.length) continue;
      const img = g('imagen');
      const abs = path.join(raiz, 'public', img.replace(/^\//, '').replace(/\//g, path.sep));
      laminas.push({
        unidad, f: path.relative(contentDir, p).replace(/\\/g, '/'),
        num: g('numero'), titulo: g('titulo'), img,
        existe: existsSync(abs), señales,
        // ¿el alt codifica una dirección? eso es lo que hay que contrastar con el píxel
        direccion: /\b(ascendente|descendente|de arriba (a|hacia) abajo|de abajo (a|hacia) arriba)\b/i.test(alt + ' ' + desc),
      });
    }
  }
}

console.log('\nláminas con SERIE ORDENADA · hay que abrir el PNG para verificarlas\n');
for (const [u] of UNIDADES.map((x) => [x[0]])) {
  const ls = laminas.filter((l) => l.unidad === u);
  if (!ls.length) continue;
  console.log(`  ── ${u} ──`);
  for (const l of ls) {
    console.log(`  ${l.direccion ? '⚠ ' : '  '}${l.num.padEnd(6)} ${l.titulo.slice(0, 52).padEnd(54)} ${l.señales.join(', ')}`);
    console.log(`      ${l.img}${l.existe ? '' : '   ← FALTA EL ARCHIVO'}`);
  }
}
console.log(`\n  TOTAL: ${laminas.length} láminas con serie`);
console.log(`  de ellas, con DIRECCIÓN explícita en el alt (contraste directo con el píxel): ${laminas.filter((l) => l.direccion).length}`);
const faltan = laminas.filter((l) => !l.existe);
if (faltan.length) console.log(`  ⚠ sin archivo en public/: ${faltan.map((l) => l.num).join(', ')}`);
