/**
 * Auxiliar de la Fase 0 · vuelca los aciertos de dup-titulo con ruta:línea y cita,
 * reutilizando la lógica del propio content-lint.mjs (no la duplica).
 * Uso:  node scripts/_auditar-dup-titulo.mjs
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { analizarCorpus, CAPITULOS } from './content-lint.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
// OJO: analizarCorpus espera la raíz del CONTENIDO (src/content), no la del repo.
// cap.root vale 'obertura', 'chapter-sections/…'. Pasarle la raíz del repo devuelve
// 0 archivos y 0 aciertos sin lanzar error: un cero silencioso y falso.
const base = path.join(path.resolve(here, '..'), 'src', 'content');
const salida = analizarCorpus(CAPITULOS, base);
const report = Array.isArray(salida) ? salida : (salida.report ?? []);

let n = 0;
for (const r of report) {
  const hits = r.cerrojoHits['dup-titulo'] ?? [];
  if (!hits.length) continue;
  console.log(`\n═══ ${r.cap.tag} · ${hits.length} ═══`);
  for (const h of hits) {
    n++;
    const abs = path.join(base, h.file);
    const linea = (readFileSync(abs, 'utf8').replace(/\r\n/g, '\n').split('\n')[h.line - 1] ?? '').trim();
    console.log(`  ${h.file}:${h.line}`);
    console.log(`     motivo : ${h.texto}`);
    console.log(`     línea  : ${linea.slice(0, 130)}`);
  }
}
console.log(`\nTOTAL: ${n}`);
