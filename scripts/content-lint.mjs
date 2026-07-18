/**
 * content-lint.mjs · gate mecánico de estilo del libro · stdlib node, sin deps.
 * Correr: node scripts/content-lint.mjs   (o `pnpm lint:contenido`)
 *
 * Codifica las meta-reglas verificables del Manual V5.2 (§2.8 frecuencia de
 * "Meta-Observador"; prohibición de andamiaje editorial en texto final) y los
 * reportes de la auditoría del Acto I (16-jul-2026): matriz de promesas cruzadas,
 * muletillas, énfasis markdown sospechoso.
 *
 * Corpus: src/content/obertura + src/content/chapter-sections/cap-{1,2,3}-*.
 * EXCLUYE src/content/book/* (monolíticos archivados/deprecados; no se renderizan).
 *
 * Reglas FALLA (exit 1 si se violan): §2.8 rango de Meta-Observador por capítulo;
 * fugas de andamiaje. Reglas REPORTA (nunca fallan): promesas, muletillas, énfasis.
 */
import { readFileSync, readdirSync, statSync, mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..');
const contentDir = path.join(repoRoot, 'src', 'content');
const outDir = path.join(repoRoot, 'out');

// --- Capítulos del corpus: raíz relativa a src/content → etiqueta + rango §2.8 ---
// Rango de Meta-Observador (menciones): [min, max]. max=Infinity = "≥min".
const CAPITULOS = [
  { tag: 'Obertura', root: 'obertura', moMin: 30, moMax: Infinity },
  { tag: 'Cap.1', root: 'chapter-sections/cap-1-universo-sinfonia', moMin: 5, moMax: 15 },
  { tag: 'Cap.2', root: 'chapter-sections/cap-2-ciencia-escuchar', moMin: 5, moMax: 15 },
  { tag: 'Cap.3', root: 'chapter-sections/cap-3-mundo-cuantico', moMin: 0, moMax: 0 },
];

// --- Andamiaje editorial prohibido en texto final (FALLA) ---
const ANDAMIAJE = [
  { nombre: 'jerga "Modo D"', re: /Modo D\b/g },
  { nombre: '[FIGURA EN PREPARACIÓN]', re: /\[\s*F\s*I\s*G\s*U\s*R\s*A\s+EN\s+PREPARACI[ÓO]N\s*\]/gi },
  { nombre: 'Especificación para diagramación', re: /Especificaci[óo]n para diagramaci[óo]n/gi },
  { nombre: 'Nota técnica de producción', re: /Nota t[ée]cnica:/gi },
  { nombre: 'Test del Triple/Triple Lector', re: /(Test del )?Tripl[e] Lector/gi },
  { nombre: 'personas del Triple Lector (Sara/Lucía/Mateo)', re: /Sara\b[\s\S]{0,40}?\bLuc[íi]a\b|Luc[íi]a\b[\s\S]{0,40}?\bMateo\b/gi },
];

// --- Muletillas (REPORTA, conteo por capítulo) ---
const MULETILLAS = [
  'precisión absoluta',
  'divulgación apresurada',
  'te espera al otro lado del umbral',
  'ya eres el Tejedor',
];

// --- Promesas cruzadas (REPORTA → out/promesas.tsv) ---
const RE_PROMESA_CAP = /Cap(?:[íi]tulo)?\.?\s*\d+/g;
const RE_PROMESA_SEC = /§\s*\d+\.\d+(?:\.\d+)?/g;

function walkMdx(absRoot) {
  const files = [];
  let entries;
  try {
    entries = readdirSync(absRoot);
  } catch {
    return files;
  }
  for (const name of entries) {
    const full = path.join(absRoot, name);
    if (statSync(full).isDirectory()) {
      files.push(...walkMdx(full));
    } else if (name.endsWith('.mdx') || name.endsWith('.md')) {
      files.push(full);
    }
  }
  return files;
}

function countMatches(text, re) {
  const m = text.match(re);
  return m ? m.length : 0;
}

function rel(abs, baseDir) {
  return path.relative(baseDir, abs).replace(/\\/g, '/');
}

/**
 * Analiza el corpus. Puro (sin IO de salida): devuelve el reporte, las promesas
 * y el conteo de violaciones de reglas FALLA. `baseDir` = raíz del contenido
 * (src/content en producción; un fixture temporal en el test).
 */
export function analizarCorpus(capitulos, baseDir) {
  const report = [];
  let violaciones = 0;
  const promesas = [];

  for (const cap of capitulos) {
    const files = walkMdx(path.join(baseDir, cap.root));
    let moTotal = 0;
    const muletillaTotal = Object.fromEntries(MULETILLAS.map((m) => [m, 0]));
    const andamiajeHits = [];
    let enfasisSospechoso = 0;
    const enfasisEjemplos = [];

    for (const file of files) {
      const text = readFileSync(file, 'utf8');
      const lines = text.split(/\r?\n/);
      // Fin del frontmatter (segundo '---'): las promesas se extraen solo del
      // cuerpo, para no contar headerLabel/tags como referencias cruzadas.
      let bodyStart = 0;
      if (lines[0] === '---') {
        const close = lines.indexOf('---', 1);
        if (close > 0) bodyStart = close + 1;
      }

      moTotal += countMatches(text, /meta-observador/gi);

      for (const m of MULETILLAS) {
        muletillaTotal[m] += countMatches(text, new RegExp(m.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'));
      }

      lines.forEach((line, i) => {
        // Andamiaje: registra archivo:línea de cada patrón prohibido.
        for (const a of ANDAMIAJE) {
          a.re.lastIndex = 0;
          if (a.re.test(line)) andamiajeHits.push({ file: rel(file, baseDir), line: i + 1, nombre: a.nombre, texto: line.trim().slice(0, 90) });
        }
        // Promesas: extrae referencias a capítulo/sección (solo cuerpo, no frontmatter).
        if (i >= bodyStart) {
          const caps = line.match(RE_PROMESA_CAP) || [];
          const secs = line.match(RE_PROMESA_SEC) || [];
          for (const ref of [...caps, ...secs]) {
            promesas.push({ file: rel(file, baseDir), line: i + 1, ref, contexto: line.trim().slice(0, 120).replace(/\t/g, ' ') });
          }
        }
        // Énfasis sospechoso: línea de blockquote con número impar de asteriscos.
        if (/^\s*>/.test(line)) {
          const ast = (line.match(/\*/g) || []).length;
          if (ast % 2 === 1) {
            enfasisSospechoso++;
            if (enfasisEjemplos.length < 3) enfasisEjemplos.push({ file: rel(file, baseDir), line: i + 1 });
          }
        }
      });
    }

    const moOk = moTotal >= cap.moMin && moTotal <= cap.moMax;
    if (!moOk) violaciones++;
    if (andamiajeHits.length > 0) violaciones++;

    report.push({ cap, files: files.length, moTotal, moOk, muletillaTotal, andamiajeHits, enfasisSospechoso, enfasisEjemplos });
  }

  return { report, promesas, violaciones };
}

// Solo ejecuta el CLI cuando se corre directamente (no al importarlo el test).
const esCLI = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (esCLI) runCLI();

function runCLI() {
const { report, promesas, violaciones } = analizarCorpus(CAPITULOS, contentDir);

// --- out/promesas.tsv ---
mkdirSync(outDir, { recursive: true });
const tsv = ['archivo\tlinea\tref\tcontexto', ...promesas.map((p) => `${p.file}\t${p.line}\t${p.ref}\t${p.contexto}`)].join('\n');
writeFileSync(path.join(outDir, 'promesas.tsv'), tsv + '\n');

// --- Salida legible ---
const rango = (c) => (c.moMax === Infinity ? `≥${c.moMin}` : c.moMin === c.moMax ? `=${c.moMin}` : `${c.moMin}-${c.moMax}`);
console.log('\n=== content-lint · Acto I ===\n');
console.log('§2.8 · Meta-Observador (FALLA fuera de rango)');
for (const r of report) {
  console.log(`  ${r.cap.tag.padEnd(9)} ${String(r.moTotal).padStart(3)}  (rango ${rango(r.cap)})  ${r.moOk ? 'OK' : '✗ FALLA'}   [${r.files} piezas]`);
}
console.log('\nAndamiaje editorial (FALLA si >0)');
let andamiajeGlobal = 0;
for (const r of report) {
  for (const h of r.andamiajeHits) {
    console.log(`  ✗ ${r.cap.tag}  ${h.file}:${h.line}  ${h.nombre} — "${h.texto}"`);
    andamiajeGlobal++;
  }
}
if (andamiajeGlobal === 0) console.log('  OK · 0 fugas');

console.log('\nMuletillas (REPORTA)');
for (const m of MULETILLAS) {
  const linea = report.map((r) => `${r.cap.tag}=${r.muletillaTotal[m]}`).join('  ');
  console.log(`  "${m}"  →  ${linea}`);
}

console.log('\nÉnfasis markdown sospechoso en blockquote (REPORTA)');
for (const r of report) {
  if (r.enfasisSospechoso > 0) {
    const ej = r.enfasisEjemplos.map((e) => `${e.file}:${e.line}`).join(', ');
    console.log(`  ${r.cap.tag.padEnd(9)} ${r.enfasisSospechoso}  (ej: ${ej})`);
  }
}

console.log(`\nPromesas cruzadas → out/promesas.tsv (${promesas.length} referencias)`);
console.log(`\n${violaciones === 0 ? '✅ SIN violaciones de reglas FALLA' : `✗ ${violaciones} regla(s) FALLA violada(s)`}\n`);

process.exit(violaciones === 0 ? 0 : 1);
}

// Constantes de configuración expuestas para pruebas.
export { CAPITULOS, MULETILLAS };
