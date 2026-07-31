/**
 * verificacion-integral.mjs · Fase 10 del plan de ajustes editoriales.
 *
 * Un check por estándar del Manual_Estilo_Editorial_TDV_v1, sobre las cinco
 * unidades del Acto I. Imprime conteos y SALE CON 1 si alguno se desvía.
 *
 * Complementa a content-lint.mjs, no lo sustituye: aquel vigila el TEXTO
 * (muletillas, andamiaje, lemas, cerrojos por regex); este vigila la ESTRUCTURA
 * que un regex de línea no alcanza — pares de etiquetas, conciliación de notas,
 * anclaje de figuras, series de numeración y citas cruzadas.
 *
 * Correr:  node scripts/verificacion-integral.mjs
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

// src/content/book/* son monolíticos archivados: no se renderizan.
function mdxDe(rel) {
  const dir = path.join(contentDir, rel);
  if (!statSync(dir, { throwIfNoEntry: false })?.isDirectory()) return [];
  return readdirSync(dir).filter((f) => f.endsWith('.mdx')).map((f) => path.join(dir, f))
    .filter((p) => !/^\s*archived:\s*true/m.test(readFileSync(p, 'utf8')));
}

const SUP = '⁰¹²³⁴⁵⁶⁷⁸⁹';
const aDigito = (s) => [...s].map((c) => SUP.indexOf(c)).join('');
const cuerpoDe = (t) => {
  const m = t.match(/^---\n[\s\S]*?\n---\n/);
  let c = m ? t.slice(m[0].length) : t;
  const i = c.indexOf('## **Notas**');
  return { cuerpo: i > 0 ? c.slice(0, i) : c, notas: i > 0 ? c.slice(i) : '' };
};

const fallos = [];
const nota = (msg) => fallos.push(msg);
const linea = (etq, val, ok) => console.log(`  ${ok ? '✅' : '✗ '} ${etq.padEnd(52)} ${val}`);

console.log('=== verificación integral · Acto I\n');

// ── E1 · toda pieza numerada abre con glosa en cursiva + rombo ───────────────
let e1ok = 0, e1tot = 0;
for (const [, rel] of UNIDADES) for (const p of mdxDe(rel)) {
  const t = readFileSync(p, 'utf8').replace(/\r\n/g, '\n');
  if (!/^kind:\s*"numbered"/m.test(t)) continue;
  e1tot++;
  const { cuerpo } = cuerpoDe(t);
  if (/^\*[^*]+\*\n+— ◇ —/.test(cuerpo.replace(/^import .*$/gm, '').trim())) e1ok++;
  else nota(`E1 · ${path.basename(p)} no abre con glosa`);
}
linea('E1 · pieza numerada abre con glosa', `${e1ok}/${e1tot}`, e1ok === e1tot);

// ── E4 · cada llamada de nota tiene entrada, y al revés ──────────────────────
let e4mal = 0, e4piezas = 0;
for (const [, rel] of UNIDADES) for (const p of mdxDe(rel)) {
  const t = readFileSync(p, 'utf8').replace(/\r\n/g, '\n');
  const { cuerpo, notas } = cuerpoDe(t);
  const ent = [...notas.matchAll(new RegExp(`^([${SUP}]+) `, 'gm'))].map((m) => aDigito(m[1]));
  const lla = [...cuerpo.matchAll(new RegExp(`(?<=[.,;:!?»)*”"])([${SUP}]+)|(?<=[${SUP}] )([${SUP}]+)`, 'g'))]
    .map((m) => aDigito(m[1] ?? m[2]));
  if (!ent.length && !lla.length) continue;
  e4piezas++;
  const huerf = ent.filter((n) => !lla.includes(n));
  const rotas = lla.filter((n) => !ent.includes(n));
  if (huerf.length || rotas.length) { e4mal++; nota(`E4 · ${path.basename(p)} notas sin llamada=[${huerf}] llamadas sin nota=[${rotas}]`); }
}
linea('E4 · conciliación de notas', `${e4piezas - e4mal}/${e4piezas} piezas`, e4mal === 0);

// ── E8 · ningún $$ fuera de <Formula>, series sin huecos, citas con destino ──
let dolares = 0;
const defF = new Map(), defG = new Map(), citaF = new Set(), citaG = new Set();
for (const [, rel] of UNIDADES) for (const p of mdxDe(rel)) {
  const t = readFileSync(p, 'utf8');
  const fuera = t.replace(/<Formula\b[\s\S]*?<\/Formula>/g, '');
  if (fuera.includes('$$')) { dolares++; nota(`E8 · $$ suelto en ${path.basename(p)}`); }
  for (const m of t.matchAll(/<Formula\b[^>]*?num="([^"]+)"/gs)) defF.set(m[1], (defF.get(m[1]) ?? 0) + 1);
  for (const m of t.matchAll(/<FiguraTDV\b[^>]*?numero="([^"]+)"/gs)) defG.set(m[1], (defG.get(m[1]) ?? 0) + 1);
  for (const m of t.matchAll(/F[óo]rmula (\d+\.\d+)/g)) citaF.add(m[1]);
  for (const m of t.matchAll(/Figura (\d+\.\d+)/g)) citaG.add(m[1]);
}
linea('E8 · bloques $$ fuera de <Formula>', String(dolares), dolares === 0);
const dupN = [...defF, ...defG].filter(([, n]) => n > 1).map(([k]) => k);
if (dupN.length) nota(`E8 · números duplicados: ${dupN}`);
linea('E8 · números de figura/fórmula únicos', `${defF.size} fórmulas · ${defG.size} figuras`, dupN.length === 0);
const rotasF = [...citaF].filter((n) => !defF.has(n));
const rotasG = [...citaG].filter((n) => !defG.has(n));
if (rotasF.length || rotasG.length) nota(`E8 · citas sin destino: fórmulas ${rotasF} · figuras ${rotasG}`);
linea('E8 · citas cruzadas con destino', `${citaF.size + citaG.size} citadas`, !rotasF.length && !rotasG.length);

// ── E9 · ninguna pieza abre con figura; ninguna galería de 3+ sin prosa ──────
const ORN = /^\s*(\*\*◆\*\*|— ◇ —|<Diamond\s*\/>|◆|◇ ◆ ◇|<Flourish[^>]*\/>)\s*$/;
const esPieza = (q) => /^\s*<(FiguraTDV|Formula)\b/.test(q);
let abren = 0, galerias = 0;
for (const [, rel] of UNIDADES) for (const p of mdxDe(rel)) {
  const { cuerpo } = cuerpoDe(readFileSync(p, 'utf8').replace(/\r\n/g, '\n'));
  const pars = cuerpo.replace(/^import .*$/gm, '').split('\n\n').filter((q) => q.trim());
  if (pars.length && esPieza(pars[0])) { abren++; nota(`E9 · ${path.basename(p)} abre con figura`); }
  let run = 0;
  for (const q of pars) {
    if (esPieza(q)) run++;
    else if (!ORN.test(q) && !/^\s*<\//.test(q)) { if (run >= 3) { galerias++; nota(`E9 · galería de ${run} en ${path.basename(p)}`); } run = 0; }
  }
  if (run >= 3) { galerias++; nota(`E9 · galería de ${run} en ${path.basename(p)}`); }
}
linea('E9 · piezas que abren con figura', String(abren), abren === 0);
linea('E9 · galerías de 3+ sin prosa', String(galerias), galerias === 0);

// ── estructura · toda etiqueta de componente se cierra ───────────────────────
const COMP = ['PausaCientifica', 'PausaReflexiva', 'VozTejido', 'LaboratorioInterior', 'Checkpoint',
  'VentanaCuantica', 'Marginalia', 'Formula', 'Fragment', 'Advertencia', 'Laboratorio', 'Interludio'];
let desc = 0;
for (const [, rel] of UNIDADES) for (const p of mdxDe(rel)) {
  const t = readFileSync(p, 'utf8');
  for (const c of COMP) {
    const a = (t.match(new RegExp(`<${c}\\b`, 'g')) ?? []).length;
    const b = (t.match(new RegExp(`</${c}>`, 'g')) ?? []).length;
    if (a !== b) { desc++; nota(`estructura · ${path.basename(p)} ${c} abre=${a} cierra=${b}`); }
  }
}
linea('estructura · pares de etiqueta', String(desc), desc === 0);

// ── estructura · ningún componente usado sin importar ────────────────────────
let sinImport = 0;
for (const [, rel] of UNIDADES) for (const p of mdxDe(rel)) {
  const t = readFileSync(p, 'utf8');
  const imps = new Set([...t.matchAll(/^import\s+(\w+)\s+from/gm)].map((m) => m[1]));
  const usos = new Set([...t.matchAll(/<\/?([A-Z]\w+)[\s/>]/g)].map((m) => m[1]));
  usos.delete('Fragment');
  const faltan = [...usos].filter((u) => !imps.has(u));
  if (faltan.length) { sinImport++; nota(`estructura · ${path.basename(p)} usa sin importar: ${faltan}`); }
}
linea('estructura · componentes importados', String(sinImport), sinImport === 0);

console.log('');
if (fallos.length) {
  console.log(`✗ ${fallos.length} desviación(es):`);
  for (const f of fallos) console.log(`   ${f}`);
} else {
  console.log('✅ las cinco unidades pasan los ocho checks');
}
process.exit(fallos.length ? 1 : 0);
