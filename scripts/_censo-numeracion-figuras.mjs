/**
 * Censo de NUMERACIÓN de figuras · Fase 8e.
 *
 * Dos defectos que ningún check anterior veía, y que producen el mismo síntoma
 * en página —el lector ve una lámina que no es la que el texto anuncia—:
 *
 *  (1) DESAJUSTE número↔archivo: <FiguraTDV numero="3.18" imagen=".../figura-3-19.png" />
 *      El texto dice «Figura 3.18» y el navegador carga la 3.19.
 *
 *  (2) ORDEN DE PUBLICACIÓN: el texto presenta 3.15, luego 3.14, luego 3.12.
 *      La numeración de una figura ES su orden de lectura; si no coincide,
 *      cualquier referencia cruzada («como vimos en la Figura 3.14») miente
 *      sobre dónde está.
 *
 * El check de (1) es semántico, no posicional: normaliza el número declarado
 * (3.18 -> 3-18, 4.1.1 -> 4-1-1) y exige que el basename sea figura-<n>.<ext>.
 *
 * Uso:  node scripts/_censo-numeracion-figuras.mjs
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
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

function mdxDe(rel) {
  const dir = path.join(contentDir, rel);
  if (!statSync(dir, { throwIfNoEntry: false })?.isDirectory()) return [];
  return readdirSync(dir).filter((f) => f.endsWith('.mdx')).sort()
    .map((f) => path.join(dir, f))
    .filter((p) => !/^\s*archived:\s*true/m.test(readFileSync(p, 'utf8')));
}

// «3.18» -> [3,18] · «4.1.1» -> [4,1,1]   (para ordenar numéricamente, no como texto)
const clave = (n) => n.split('.').map((x) => parseInt(x, 10) || 0);
const cmp = (a, b) => {
  const A = clave(a), B = clave(b);
  for (let i = 0; i < Math.max(A.length, B.length); i++) {
    if ((A[i] ?? -1) !== (B[i] ?? -1)) return (A[i] ?? -1) - (B[i] ?? -1);
  }
  return 0;
};

let desajustes = 0, desordenes = 0, total = 0;

for (const [unidad, rel] of UNIDADES) {
  const figs = [];
  for (const p of mdxDe(rel)) {
    const t = readFileSync(p, 'utf8').replace(/\r\n/g, '\n');
    for (const m of t.matchAll(/<FiguraTDV\b[\s\S]*?\/>/g)) {
      const g = (k) => (m[0].match(new RegExp(`${k}="([^"]*)"`, 's')) ?? [])[1] ?? '';
      figs.push({ f: path.basename(p), num: g('numero'), img: g('imagen') });
    }
  }
  if (!figs.length) continue;
  total += figs.length;
  console.log(`\n  ── ${unidad} ── (${figs.length} figuras, en orden de aparición)`);

  let previo = null;
  for (const fig of figs) {
    // (1) ¿el archivo corresponde al número declarado?
    // el basename va en minúscula (figura-o-1) aunque el número sea «O.1»
    const esperado = `figura-${fig.num.replace(/\./g, '-')}`.toLowerCase();
    const real = path.basename(fig.img).replace(/\.[a-z0-9]+$/i, '');
    // tolera sufijos de versión deliberados: figura-o-5-v3
    const ok = real === esperado || real.startsWith(`${esperado}-v`);
    if (!ok) desajustes++;

    // (2) ¿va detrás del anterior?
    const retro = previo !== null && cmp(fig.num, previo) < 0;
    if (retro) desordenes++;
    previo = fig.num;

    const marca = !ok ? '✖' : retro ? '↩' : ' ';
    console.log(`  ${marca} ${fig.num.padEnd(7)} ${real.padEnd(18)} ${fig.f}`);
    if (!ok) console.log(`      └─ el texto anuncia «Figura ${fig.num}» pero carga ${real}  (se esperaba ${esperado})`);
    if (retro) console.log(`      └─ se publica DESPUÉS de la ${previo === fig.num ? '?' : ''}${figs[figs.indexOf(fig) - 1].num}`);
  }
}

console.log(`\n  TOTAL ${total} figuras · desajustes número↔archivo: ${desajustes} · publicadas fuera de orden: ${desordenes}`);
