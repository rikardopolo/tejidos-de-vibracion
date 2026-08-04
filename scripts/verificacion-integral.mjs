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
//
// F0 · DEFECTO REPARADO (3-ago-2026). La versión anterior era `esPieza(pars[0])`:
// miraba SOLO el primer párrafo. Pero E1 —el check de aquí arriba— exige que las
// 33 piezas numeradas abran con una glosa en cursiva, así que en esas piezas
// pars[0] NUNCA puede ser una figura. El chequeo era CÓDIGO MUERTO por
// construcción y reportaba un 0 que no significaba nada.
//
// La regla real, en palabras de Ricardo: «ninguna sección debe comenzar con una
// tabla o figura; lo primero debe ser un texto que introduzca las figuras». La
// apertura ritual —glosa en cursiva, «— ◇ —», <Diamond/>— es CABECERA, no prosa
// introductoria: entona, no introduce. Así que se avanza sobre ella y se compara
// qué llega antes, si la primera media o la primera prosa real.
const ORN = /^\s*(\*\*◆\*\*|— ◇ —|<Diamond\s*\/>|◆|◇ ◆ ◇|<Flourish[^>]*\/>)\s*$/;
const GLOSA = /^\s*[*_][^*_][\s\S]*[*_]\s*$/;
const TABLA = /^\s*\|.*\|\s*$/;
// GATE G-E, resuelto por el hecho y no por criterio editorial (Fase 5): en la Fase 0
// metí <MapaConceptual> aquí tratándolo como lámina, y NO lo es — abre y cierra
// (`<MapaConceptual …>` … `</MapaConceptual>`) y dentro viven la glosa, el ornamento,
// el arte ASCII y hasta las propias <FiguraTDV>. Es un CONTENEDOR, como una caja.
// Marcarlo hacía que las dos piezas mapa-cierre salieran «abren con figura» cuando
// lo que abren es su propio marco.
//
// Lo que SÍ es media dentro de ellas es el ARTE ASCII: un diagrama de caja dibujado
// con ═ ║ ╔ ╝, que el lector ve como lámina y que la regla de Ricardo cubre
// («ninguna sección debe comenzar con una tabla o figura»).
const ASCII = /^[\s│├└─┌┐┘┴┬┼║╔╗╚╝═╠╣╦╩╬]*[║╔╗╚╝═╠╣╦╩╬]/;
// DOS conceptos distintos, y confundirlos produce ruido:
//  · esLamina  → lo que cuenta para GALERÍAS: piezas gráficas independientes.
//  · esPieza   → lo que cuenta para ABRIR una sección: incluye además el arte ASCII.
// Un diagrama ASCII va partido en muchos bloques por líneas en blanco, así que
// tratarlo como lámina inventaba una «galería de 7» donde hay UN solo dibujo.
const esLamina = (q) => /^\s*<(FiguraTDV|Formula)\b/.test(q) || TABLA.test(q.split('\n')[0] ?? '');
const esPieza = (q) => esLamina(q) || ASCII.test(q.split('\n')[0] ?? '');
const esRitual = (q) => ORN.test(q) || GLOSA.test(q.trim());
const esProsa = (q) => {
  const t = q.trim();
  if (!t || esRitual(q) || esPieza(q)) return false;
  if (/^<\/?[A-Za-z]/.test(t) || /^#{1,6}\s/.test(t)) return false; // etiqueta o encabezado
  // Una ENTREGA puede ser corta y seguir siendo entrega: «La velocidad predicha por
  // las ecuaciones era:» son siete palabras y es el molde canónico para presentar
  // una fórmula. El umbral de 12 la descartaba y marcaba como huérfana una figura
  // perfectamente anclada. Los dos puntos finales son la señal de que entrega.
  if (/[:;]\s*(⁰|¹|²|³|⁴|⁵|⁶|⁷|⁸|⁹)*$/.test(t) && t.split(/\s+/).length >= 4) return true;
  return t.split(/\s+/).length >= 12;
};
let abren = 0, galerias = 0;
for (const [, rel] of UNIDADES) for (const p of mdxDe(rel)) {
  const { cuerpo } = cuerpoDe(readFileSync(p, 'utf8').replace(/\r\n/g, '\n'));
  const pars = cuerpo.replace(/^import .*$/gm, '').split('\n\n').filter((q) => q.trim());
  const iMedia = pars.findIndex(esPieza);
  const iProsa = pars.findIndex(esProsa);
  if (iMedia !== -1 && (iProsa === -1 || iMedia < iProsa)) {
    abren++;
    nota(`E9 · ${path.basename(p)} abre con figura/tabla (párrafo ${iMedia + 1}) antes de la primera prosa (${iProsa === -1 ? 'ninguna' : iProsa + 1})`);
  }
  let run = 0;
  for (const q of pars) {
    if (esLamina(q)) run++;
    else if (!ORN.test(q) && !/^\s*<\//.test(q)) { if (run >= 3) { galerias++; nota(`E9 · galería de ${run} en ${path.basename(p)}`); } run = 0; }
  }
  if (run >= 3) { galerias++; nota(`E9 · galería de ${run} en ${path.basename(p)}`); }
}
linea('E9 · piezas que abren con figura', String(abren), abren === 0);

// F0 · TERCERA CLÁUSULA DE E9, que el Manual declara implementada y NO existía en
// el código: «el script detecta el caso duro —que lo que precede inmediatamente a
// la figura sea ornamento, un cierre de componente u otra figura— y lo marca».
// Es una COTA INFERIOR declarada, y el propio Manual lo dice: ningún regex puede
// decidir si la prosa INTRODUCE la figura, solo si hay prosa. El residuo lo ve un
// lector. (Se prefirió esto al check de «toda lámina citada nominalmente»: las 56
// figuras carecen hoy de cita nominal a propósito, porque E9 declara preferida la
// llamada deíctica —«observa el mapa»— y lista la nominal sistemática como el
// andamiaje que el libro evita. Ese check habría empujado al libro contra su canon.)
let sinProsaDetras = 0, parejas = 0;
for (const [, rel] of UNIDADES) for (const p of mdxDe(rel)) {
  const { cuerpo } = cuerpoDe(readFileSync(p, 'utf8').replace(/\r\n/g, '\n'));
  const pars = cuerpo.replace(/^import .*$/gm, '').split('\n\n').filter((q) => q.trim());
  for (let i = 1; i < pars.length; i++) {
    if (!esLamina(pars[i])) continue;
    const prev = pars[i - 1];
    if (esProsa(prev)) continue;
    // PAREJA DELIBERADA, el caso que E9-(d) admite con gate: una lámina cuya
    // anterior es otra lámina QUE SÍ está anclada — gráfica y su ecuación, o dos
    // modelos que se comparan bajo una sola llamada. Se cuenta aparte, no como
    // defecto: son 3 en el Acto I y las tres están documentadas en el Manual.
    if (esLamina(prev) && i >= 2 && esProsa(pars[i - 2])) { parejas++; continue; }
    const causa = esPieza(prev) ? 'otra pieza' : ORN.test(prev) ? 'ornamento'
      : /^\s*<\//.test(prev.trim()) ? 'cierre de componente' : 'no-prosa';
    sinProsaDetras++;
    const num = (pars[i].match(/num(?:ero)?="([^"]+)"/) ?? [])[1] ?? '?';
    nota(`E9 · ${path.basename(p)} · ${num} precedida de ${causa}`);
  }
}
linea('E9 · figuras/fórmulas sin prosa delante', String(sinProsaDetras), sinProsaDetras === 0);
console.log(`      parejas deliberadas (E9-d, con gate): ${parejas}`);
linea('E9 · galerías de 3+ sin prosa', String(galerias), galerias === 0);

// ── E7 / G5 · dosificación de cajas ──────────────────────────────────────────
//
// F0 · CHECK NUEVO (3-ago-2026). El Manual lo declara comprobable —«por pieza:
// % de palabras dentro de caja ≤45 %; 0 secuencias de 3+ cajas con <150 palabras
// entre ellas»— y lo lista como infracción, pero NO estaba implementado en ningún
// script. Es el eje que mueven tres de las doce observaciones de Ricardo: la 9
// añade texto DENTRO de caja, la 2 añade prosa FUERA, y la 3 puede sacar 148
// fichas de las cajas. Sin medirlo, planificar esas fases es a ciegas.
const CAJAS = ['PausaCientifica', 'PausaReflexiva', 'VozTejido', 'LaboratorioInterior',
  'Checkpoint', 'VentanaCuantica', 'Marginalia', 'Advertencia', 'Laboratorio',
  'AnclajeExperiencial', 'CierreVibracional', 'UmbralPoetico', 'Invocacion',
  'OberturaPausaCientifica', 'OberturaPausaReflexiva', 'OberturaVozTejido', 'CorteTejedor'];
// EXENCIÓN POR `kind`, no por nombre de archivo. El techo gobierna el RITMO DE
// LECTURA de las piezas de contenido —33 `numbered` + 11 `capitulo` (la Obertura)—.
// En las 19 piezas rituales el ritual ES la pieza: un umbral, un anclaje o un
// cierre son 100 % caja por diseño y medirlos contra un techo no significa nada.
// Se exenta por lo que la pieza ES, no por cómo se llama su archivo.
const KIND_CONTENIDO = new Set(['numbered', 'capitulo']);
const kindDe = (t) => (t.match(/^kind:\s*"?([a-z-]+)"?/m) ?? [])[1] ?? '';
const TECHO = 45, MIN_ENTRE = 150;
const palabras = (s) => (s.replace(/<[^>]*>/g, ' ').match(/\p{L}[\p{L}\p{M}'-]*/gu) || []).length;
const sobreTecho = [], rachas = [];
const pctPorUnidad = [];
for (const [nomU, rel] of UNIDADES) {
  let dentroU = 0, totalU = 0;
  for (const p of mdxDe(rel)) {
    const bruto = readFileSync(p, 'utf8').replace(/\r\n/g, '\n');
    const { cuerpo } = cuerpoDe(bruto);
    let prof = 0, dentro = 0, fuera = 0;
    let bloques = 0, entre = 0, racha = 0, peor = null;
    for (const ln of cuerpo.replace(/^import .*$/gm, '').split('\n')) {
      const abre = CAJAS.filter((c) => new RegExp(`<${c}\\b`).test(ln)).length;
      const cierra = CAJAS.filter((c) => new RegExp(`</${c}>`).test(ln)).length;
      if (abre && !prof) { // arranca una caja: ¿cuánta prosa la separa de la anterior?
        if (bloques && entre < MIN_ENTRE) { racha = racha || 1; racha++; if (racha >= 3 && !peor) peor = racha; }
        else racha = 1;
        entre = 0; bloques++;
      }
      prof += abre;
      const w = palabras(ln);
      if (prof > 0) dentro += w; else { fuera += w; entre += w; }
      prof = Math.max(0, prof - cierra);
    }
    // Las rituales quedan fuera TAMBIÉN del promedio por unidad: incluirlas —son
    // 100 % caja— infla la media y la vuelve incomparable con la del Manual.
    if (!KIND_CONTENIDO.has(kindDe(bruto))) continue;
    totalU += dentro + fuera; dentroU += dentro;
    const tot = dentro + fuera;
    const pct = tot ? (100 * dentro) / tot : 0;
    if (pct > TECHO) sobreTecho.push({ f: path.relative(contentDir, p).replace(/\\/g, '/'), pct });
    if (peor) rachas.push({ f: path.relative(contentDir, p).replace(/\\/g, '/'), n: peor });
  }
  pctPorUnidad.push(`${nomU} ${totalU ? ((100 * dentroU) / totalU).toFixed(1) : '0.0'} %`);
}
sobreTecho.sort((a, b) => b.pct - a.pct);
for (const s of sobreTecho) nota(`E7 · ${s.f} ${s.pct.toFixed(1)} % en caja (techo ${TECHO} %)`);
for (const r of rachas) nota(`E7 · ${r.f} racha de ${r.n} cajas con <${MIN_ENTRE} palabras entre ellas`);
linea(`E7 · piezas sobre el ${TECHO} % en caja`, String(sobreTecho.length), sobreTecho.length === 0);
linea('E7 · rachas de 3+ cajas sin prosa suficiente', String(rachas.length), rachas.length === 0);
console.log(`      por unidad: ${pctPorUnidad.join(' · ')}`);

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
