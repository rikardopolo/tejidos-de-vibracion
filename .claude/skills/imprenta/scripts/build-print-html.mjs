#!/usr/bin/env node
/**
 * build-print-html.mjs · enumera las piezas MDX en orden canónico para el PDF.
 *
 * No renderiza: produce el MANIFIESTO de orden (qué piezas, en qué secuencia,
 * con qué estado) que luego alimenta el render de Astro/Vivliostyle.
 *
 * Estrategia recomendada en el repo (Astro): crear una ruta de impresión
 * (ej. /print/volumen-i) que importe este manifiesto, renderice cada pieza con
 * sus componentes reales y cargue print.css. Aquí solo se resuelve el ORDEN.
 *
 * Uso:  node scripts/build-print-html.mjs [--status published] [--scope acto-i]
 */
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();
const C = path.join(ROOT, "src/content");

// Orden de actos/capítulos del Índice Maestro v3.
const SEQUENCE = [
  { kind: "obertura", dir: path.join(C, "obertura") },
  { kind: "capitulo", dir: path.join(C, "chapter-sections/cap-1-universo-sinfonia") },
  { kind: "capitulo", dir: path.join(C, "chapter-sections/cap-2-ciencia-escuchar") },
  { kind: "capitulo", dir: path.join(C, "chapter-sections/cap-3-mundo-cuantico") },
  // Acto II y III se añaden aquí cuando sus piezas existan.
];

function readFrontmatter(src) {
  const m = src.match(/^---\n([\s\S]*?)\n---/);
  if (!m) return {};
  const fm = {};
  for (const line of m[1].split("\n")) {
    const kv = line.match(/^(\w+):\s*"?(.*?)"?\s*$/);
    if (kv) fm[kv[1]] = kv[2];
  }
  return fm;
}

const wantStatus = (process.argv.find(a => a.startsWith("--status="))?.split("=")[1]) || null;

const manifest = [];
for (const entry of SEQUENCE) {
  let files;
  try { files = (await readdir(entry.dir)).filter(f => f.endsWith(".mdx")).sort(); }
  catch { continue; }
  for (const f of files) {
    const src = await readFile(path.join(entry.dir, f), "utf8");
    const fm = readFrontmatter(src);
    if (wantStatus && fm.status && fm.status !== wantStatus) continue;
    manifest.push({
      file: path.relative(ROOT, path.join(entry.dir, f)),
      kind: entry.kind,
      order: Number(fm.order ?? 999),
      num: fm.num || null,
      title: fm.title || f.replace(/\.mdx$/, ""),
      status: fm.status || "draft",
    });
  }
}

console.log(JSON.stringify(manifest, null, 2));
console.error(`\n${manifest.length} piezas en el manifiesto de impresión.`);
