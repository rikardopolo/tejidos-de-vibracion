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
  // F2 · el Cap. 4 NO existía para el gate: sus 12 piezas nunca se linteaban.
  // Rango verificado sobre el corpus (25-jul-2026): 0 menciones, igual que Cap.3.
  { tag: 'Cap.4', root: 'chapter-sections/cap-4-biologia-campo-coherente', moMin: 0, moMax: 0 },
];

// --- Andamiaje editorial prohibido en texto final (FALLA) ---
const ANDAMIAJE = [
  { nombre: 'jerga "Modo D"', re: /Modo D\b/g },
  { nombre: '[FIGURA EN PREPARACIÓN]', re: /\[\s*F\s*I\s*G\s*U\s*R\s*A\s+EN\s+PREPARACI[ÓO]N\s*\]/gi },
  { nombre: 'Especificación para diagramación', re: /Especificaci[óo]n para diagramaci[óo]n/gi },
  { nombre: 'Nota técnica de producción', re: /Nota t[ée]cnica:/gi },
  { nombre: 'Test del Triple/Triple Lector', re: /(Test del )?Tripl[e] Lector/gi },
  { nombre: 'personas del Triple Lector (Sara/Lucía/Mateo)', re: /Sara\b[\s\S]{0,40}?\bLuc[íi]a\b|Luc[íi]a\b[\s\S]{0,40}?\bMateo\b/gi },

  // --- Retoques book-wide del Acto I (F1-F3, 2026-07) ---
  // El rigor se EJERCE, no se anuncia ni se tabula. Estas reglas impiden la
  // recaída en los tics que el art pass del Cap. 4 eliminó y que F1-F3
  // limpiaron del Acto I. Ver Plan_Retoques_BookWide_ActoI_TDV_v1.md.

  // F1 · rúbrica tabulada y fugas del taller (rompen la ficción de libro terminado)
  { nombre: 'rótulo [PAUSA CIENTÍFICA] en texto plano', re: /\[\s*P\s*A\s*U\s*S\s*A\s+C\s*I\s*E\s*N\s*T\s*[ÍI]\s*F\s*I\s*C\s*A\s*\]/gi },
  { nombre: 'fuga del taller (manuscrito/material original/Plan vN)', re: /manuscrito antiguo|material\s+original de Ricardo|\bPlan v\d/gi },

  // F2 · tabulación del veredicto (el juicio va DENTRO de la frase)
  { nombre: 'rúbrica "Veredicto epistemológico"', re: /Veredicto epistemol[óo]gico/gi },
  { nombre: 'estribillo "El puente honesto"', re: /puente honesto/gi },
  { nombre: 'rótulo "Posición editorial honesta"', re: /Posici[óo]n editorial honesta/gi },

  // F3 · el método hablando de sí mismo en vez del mundo
  // OJO: NO usar el patrón desnudo "del libro entero". En obertura/09-estados
  // (§9.4-9.5, seguridad psicológica) marca énfasis legítimo sobre contenido
  // clínico —"uno de los más importantes del libro entero"— y una regla amplia
  // presionaría a debilitar ese copy. Se exige el contexto de rigor/honestidad.
  // El sufijo «entero» era OPCIONAL en la práctica: cap-2/12-schrodinger.mdx:394
  // decía «honestidad epistémica del libro,» y se escapaba. Se amplía a «del libro»
  // CONSERVANDO el prefijo obligatorio (rigor|honestidad epistémica): verificado que
  // así no toca «uno de los más importantes del libro entero» de obertura/09-estados
  // (0 aciertos en el corpus vivo de la Obertura; 1 acierto en todo el corpus, el
  // superviviente de Cap.2).
  { nombre: 'meta-elogio del propio rigor', re: /(rigor|honestidad epist[ée]mica) del libro( entero)?|que sostiene este libro|el compromiso editorial|es decisiva para el rigor|aqu[íi] es donde el rigor importa|libre de especulaci[óo]n/gi },
  { nombre: 'invocación mecánica del método', re: /disciplina del Doble Carril|Doble Carril editorial|marco epist[ée]mico apropiado/gi },
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

/**
 * F2 · CERROJOS DE LOS ESTÁNDARES EDITORIALES (Manual_Estilo_Editorial_TDV_v1).
 *
 * Nacen en modo AVISO: reportan pero NO fallan, porque el corpus todavía no está
 * limpio y bloquearían las fases 3-9. Cada uno pasa a bloqueante cuando su fase
 * cierra → correr con LINT_ESTRICTO=1 (o pnpm lint:contenido:estricto).
 *
 * Se evalúan sobre el CUERPO APLANADO (ver flattenBody), así que una frase partida
 * por el hard-wrap a ~70 caracteres ya no los evade.
 */
const MODO_ESTRICTO = process.env.LINT_ESTRICTO === '1';

const CERROJOS = [
  // E-anti · el rigor se ejerce, no se anuncia (Fase 4a)
  { id: 'carril', nombre: 'etiqueta de Carril / lectura simbólica', re: /Carril\s+[AB]\b|Doble Carril|\(lectura simb[óo]lica\)/g },
  // E3 · numeración (Fase 4b)
  { id: 'sec-espacio', nombre: '«§ » con espacio (debe ir pegado)', re: /§\s+\d/g },
  { id: 'sec-palabra', nombre: '«sección N.N» en palabra (debe ser §N.N)', re: /secci[óo]n\s+\d+\.\d/gi },
  { id: 'h2-num', nombre: '<h2> numerado en el cuerpo (ya lo dan <h1> y breadcrumb)', re: /<span class="num">§/g },
  // E8 · fórmulas (Fase 6)
  { id: 'dd-suelto', nombre: 'bloque $$ fuera de <Formula>', re: null, custom: 'ddSuelto' },
  // E4 · un solo sistema de referencias (Fase 5b)
  // E4 tiene DOS superficies (decisión de Ricardo, Fase 5b): la nota numerada del
  // cuerpo y la bibliografía dentro de caja. La segunda es legítima, pero su rótulo
  // es cerrado: solo «**Referencias:**» y «**Para profundizar:**».
  { id: 'ref-etiqueta', nombre: 'rótulo de bibliografía en caja no canónico (solo «**Referencias:**»)', re: /^\*\*(?!Referencias:\*\*)Referencia[^:*]*:\*\*/gm },
  { id: 'rotulo-notas', nombre: 'rótulo de notas no canónico (debe ser «## **Notas**»)', re: /^\*\*Notas y referencias\*\*|^#{2,4}\s*Referencias seleccionadas|^#{2,4}\s*Para profundizar|^Referencias:/gm },
  // E4 · superficie 2 · UNA FICHA POR PÁRRAFO (Fase 3).
  //
  // Ricardo, leyendo §1.1: «las referencias, al estar agrupadas, no se diferencia
  // claramente una de otra». La Fase 5b las habia dejado en un parrafo compacto con
  // las fichas separadas por « · », y el render lo desmintio: ese separador compite
  // con los puntos internos de cada ficha —«et al.», las iniciales, la abreviatura
  // de editorial— y los MDX van hard-wrapped a ~72 columnas, asi que una ficha ocupa
  // tres lineas y la siguiente empieza a mitad de la cuarta.
  //
  // Este cerrojo caza el bloque de bibliografia que aun encadena dos o mas fichas.
  // El « · » PEGADO no cuenta: es operador de unidades. Solo el separador con
  // espacio a ambos lados.
  { id: 'ref-encadenada', nombre: 'bloque de bibliografía con fichas encadenadas por « · » (E4 · una ficha por párrafo)', re: null, custom: 'refEncadenada' },
  // E2 · título duplicado (Fase 8 / Fase 3) · necesita frontmatter → custom
  { id: 'dup-titulo', nombre: 'el cuerpo repite el título o el subtítulo del frontmatter', re: null, custom: 'dupTitulo' },
  // E11 · el punto medio (Fase 1) · ALLOWLIST POR CLASE, NUNCA PURGA.
  //
  // El «·» hace quince trabajos distintos en el Acto I y solo tres superficies
  // sobran: `title`, `subtitle` y encabezado de cuerpo (117 de 710 ocurrencias).
  // Este cerrojo vigila ESAS TRES Y NADA MÁS.
  //
  // Lo que NO toca, y por qué importa que no lo toque:
  //   b3  headerLabel ......... chrome de plantilla
  //   b4  dateline VozTejido .. «1813 — 1901 · Compositor italiano» ← ES EL
  //       EJEMPLAR QUE RICARDO APROBÓ, y el que la Fase 4 replica en 33 voces.
  //       Purgar el glifo lo destruiría; sustituirlo por raya es peor todavía,
  //       porque la dateline YA usa raya para el rango de fechas.
  //   b5  ficha bibliográfica · b6 pie de figura · b9 glosario de fórmula
  //   b10 operador y unidades («fotones·cm⁻²·s⁻¹») · b15 frontispicio y colofón
  //   b7 ornamento · b8 viñeta · b11 rótulo de acto · b12 prop · b14 celda
  //       → los cinco últimos son GATE ABIERTO de Ricardo: 241 ocurrencias, más
  //         del doble de lo que se retira, y ninguna en la superficie criticada.
  //
  // Moldes de sustitución y tabla completa por unidad: Manual §E11.
  // Censo reproducible: node scripts/_censo-punto-medio.mjs
  { id: 'punto-medio', nombre: '«·» en title, subtitle o encabezado (E11)', re: null, custom: 'puntoMedio' },
];

// E5+E9 · lemas con techo por unidad, medido POR CADA 10.000 PALABRAS del cuerpo.
// El candado de F3 era de FRASE FIJA y por eso las 82 ocurrencias de «honest*»
// sobrevivieron intactas: ninguna contenía las tres cadenas literales vigiladas.
// La UNIDAD era el problema. El plan y el manual miden por 10.000 palabras
// (Obertura 1,61 · Cap.1 10,76 · Cap.4 6,09) y este cerrojo medía por 1.000 con
// techo 2,0 — es decir, 20 por diez mil: DIEZ VECES más flojo que el objetivo
// del plan, que es ≤2 por diez mil. Así nunca podía morder: la peor unidad
// marcaba 1,03 contra un techo de 2,0 y pasaba sin avisar.
// Se cambia la unidad, no solo el número, para que la confusión no vuelva.
const LEMAS = [
  { id: 'honest', nombre: 'familia «honesto/honestidad»', re: /honest\w*/gi, techoPorDiezMil: 2.0 },
];

/**
 * Aplana el cuerpo para que los patrones multi-palabra no se evadan por el
 * hard-wrap. Une las líneas de un mismo párrafo con un espacio y conserva el
 * salto en las líneas en blanco (así un patrón no cruza de un párrafo a otro).
 * Devuelve el texto plano y un mapa offset→número de línea original, para que
 * el reporte siga señalando la línea real.
 */
function flattenBody(lines) {
  let flat = '';
  const lineOf = []; // lineOf[i] = línea 1-based del carácter flat[i]
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    if (raw.trim() === '') {
      flat += '\n';
      lineOf.push(i + 1);
      continue;
    }
    if (flat.length > 0 && flat[flat.length - 1] !== '\n') {
      flat += ' ';
      lineOf.push(i + 1);
    }
    flat += raw;
    for (let c = 0; c < raw.length; c++) lineOf.push(i + 1);
  }
  return { flat, lineOf };
}

/** Todas las coincidencias de `re` sobre el texto aplanado, con su línea real. */
function matchesConLinea(re, flat, lineOf) {
  const out = [];
  re.lastIndex = 0;
  let m;
  while ((m = re.exec(flat)) !== null) {
    out.push({ line: lineOf[m.index] ?? 1, texto: m[0].slice(0, 90) });
    if (m.index === re.lastIndex) re.lastIndex++; // guarda contra match vacío
  }
  return out;
}

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
    let marcadorCarril = 0;
    const marcadorEjemplos = [];
    const cerrojoHits = Object.fromEntries(CERROJOS.map((c) => [c.id, []]));
    const lemaHits = Object.fromEntries(LEMAS.map((l) => [l.id, 0]));
    let palabrasCuerpo = 0;

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

      // F2 · ANDAMIAJE y CERROJOS se evalúan sobre el CUERPO APLANADO. Antes se
      // evaluaban línea a línea y, con los MDX hard-wrapped a ~70 caracteres,
      // cualquier patrón de dos o más palabras se evadía solo con un salto de
      // línea (caso comprobado: cap-2/12-schrodinger.mdx:394-395).
      const cuerpoLines = lines.slice(bodyStart);
      const { flat, lineOf } = flattenBody(cuerpoLines);
      const aLinea = (n) => n + bodyStart; // offset del aplanado → línea del archivo

      // También sobre el aplanado, y por la misma razón: una muletilla de dos
      // palabras partida por el hard-wrap no existía para este contador. F2 arregló
      // ANDAMIAJE y CERROJOS y dejó MULETILLAS midiendo el texto crudo.
      for (const m of MULETILLAS) {
        muletillaTotal[m] += countMatches(flat, new RegExp(m.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'));
      }

      for (const a of ANDAMIAJE) {
        for (const h of matchesConLinea(a.re, flat, lineOf)) {
          andamiajeHits.push({ file: rel(file, baseDir), line: aLinea(h.line), nombre: a.nombre, texto: h.texto });
        }
      }

      for (const c of CERROJOS) {
        if (c.re) {
          for (const h of matchesConLinea(c.re, flat, lineOf)) {
            cerrojoHits[c.id].push({ file: rel(file, baseDir), line: aLinea(h.line), texto: h.texto });
          }
        } else if (c.custom === 'ddSuelto') {
          // $$ que no viva dentro de un par <Formula>…</Formula>
          for (const m of flat.matchAll(/\$\$/g)) {
            const ini = flat.lastIndexOf('<Formula', m.index);
            const fin = flat.lastIndexOf('</Formula>', m.index);
            if (!(ini !== -1 && ini > fin)) {
              cerrojoHits[c.id].push({ file: rel(file, baseDir), line: aLinea(lineOf[m.index] ?? 1), texto: '$$' });
            }
          }
        } else if (c.custom === 'refEncadenada') {
          // E4 dice «una ficha por párrafo», así que la unidad que hay que mirar es
          // el PÁRRAFO, y la pregunta es cuántas fichas caben dentro de uno.
          //
          // La versión anterior cortaba el bloque en la primera línea en blanco. Como
          // el formato canónico que la propia Fase 3 impuso es «rótulo → línea en
          // blanco → una ficha por párrafo», el bloque se quedaba SIEMPRE en la línea
          // del rótulo: medido sobre el corpus, 34 de 34 bloques inspeccionaban una
          // sola línea y 133 fichas caían fuera. Reportaba 0 sin mirar nada.
          //
          // El criterio sigue siendo el « · », que es como el formato viejo encadenaba
          // las fichas y lo que F3 vino a deshacer. Lo único que estaba roto era la
          // ventana. Contar «años entre paréntesis» en su lugar parece más general y
          // no lo es: da 16 falsos positivos sobre el corpus, porque una ficha lleva
          // legítimamente más de un año —el fascículo de la revista («*Science,
          // 315*(5814)»), la obra comentada («commentary on Maxwell (1865)»), la
          // reedición de una tesis—. El separador, en cambio, sólo aparece cuando
          // alguien ha pegado dos fichas de verdad.
          //
          // Cada párrafo se aplana antes de contar, porque los MDX van hard-wrapped y
          // el separador puede quedar al final de una línea con su ficha en la
          // siguiente. Se exige además un año en rango, para que un « · » de prosa
          // suelta bajo el rótulo no dispare.
          for (let k = 0; k < cuerpoLines.length; k++) {
            if (!/^\s*\*\*(Referencias|Para profundizar)[^:*]*:\*\*/.test(cuerpoLines[k])) continue;
            let parrafo = [];
            for (let j = k + 1; j <= cuerpoLines.length; j++) {
              const l = cuerpoLines[j];
              const cierra = l === undefined
                || /^\s*<\/|^\s*#{2,4}\s|^\s*<h[1-6]/.test(l)
                || /^\s*\*\*(Referencias|Para profundizar)[^:*]*:\*\*/.test(l);
              if (l !== undefined && l.trim() !== '' && !cierra) { parrafo.push(l); continue; }
              // fin de párrafo: contarlo
              if (parrafo.length) {
                const plano = parrafo.join(' ').replace(/\s+/g, ' ');
                const encadenadas = (plano.match(/ · /g) ?? []).length;
                const tieneAnio = /(?<!\d)\((1[5-9]\d{2}|20[0-2]\d)[a-z]?\)/.test(plano);
                if (encadenadas > 0 && tieneAnio) {
                  cerrojoHits[c.id].push({
                    file: rel(file, baseDir),
                    line: bodyStart + j - parrafo.length + 1,
                    texto: `${encadenadas + 1} fichas encadenadas en un párrafo`,
                  });
                }
                parrafo = [];
              }
              if (cierra) { k = j - 1; break; }
            }
          }
        } else if (c.custom === 'puntoMedio') {
          // Solo las tres superficies que E11 retira. El frontmatter se mira campo
          // a campo —`headerLabel` lleva «·» por diseño y no debe disparar— y el
          // cuerpo solo en las líneas de encabezado.
          for (let k = 0; k < bodyStart; k++) {
            if (!/^(title|subtitle):/.test(lines[k]) || !lines[k].includes('·')) continue;
            const campo = lines[k].startsWith('title') ? 'title' : 'subtitle';
            cerrojoHits[c.id].push({ file: rel(file, baseDir), line: k + 1, texto: `${campo}: ${lines[k].slice(0, 90)}` });
          }
          for (let k = 0; k < cuerpoLines.length; k++) {
            const ln = cuerpoLines[k];
            if (!/^\s*(#{1,6}\s|<h[1-6][\s>])/.test(ln) || !ln.includes('·')) continue;
            cerrojoHits[c.id].push({ file: rel(file, baseDir), line: bodyStart + k + 1, texto: `encabezado: ${ln.trim().slice(0, 90)}` });
          }
        } else if (c.custom === 'dupTitulo') {
          // Dispara cuando una LÍNEA SUELTA de la cabecera del cuerpo ES el
          // título o el subtítulo: encabezado, eyebrow o glosa que repite lo que
          // la plantilla ya pinta. Esa es la duplicación que el lector encuentra
          // como texto, y la que la Fase 8 retiró de nueve piezas de la Obertura.
          //
          // NO dispara en dos casos, y distinguirlos es todo el valor del cerrojo:
          //  · el valor viaja como PROP de un componente —<Frontispicio subtitulo>,
          //    <AnclajeExperiencial titulo>, <Interludio title>, <VozTejido name>—.
          //    Ahí el componente pinta su propio marco rotulado; si además debe
          //    aparecer el encabezado genérico es una decisión de maquetación, no
          //    un defecto del contenido.
          //  · una MENCIÓN EN PROSA. Que §1.0 diga «El umbral ha sido cruzado» en
          //    una pieza subtitulada «El umbral» es escribir, no duplicar.
          // La versión anterior usaba `cab.includes(val)` y marcaba los tres casos
          // por igual: 16 aciertos de los que solo uno era real.
          // F0 · TRES DEFECTOS REPARADOS (3-ago-2026). La versión anterior daba 0
          // sobre las 63 piezas teniendo casos dentro, por dos causas independientes:
          //
          //  1. VENTANA DE 16 LÍNEAS CRUDAS. `cuerpoLines` incluye blancos e
          //     imports, así que en cap-1/04-tradiciones-olvidadas las 16 líneas se
          //     gastaban en un blanco, cinco imports, la glosa, el ornamento y el
          //     bloque de la figura: inspeccionaba UNA línea de prosa real. El
          //     duplicado está en la 44. Ahora se recorre TODO el cuerpo y se filtra
          //     por forma —encabezado, glosa en cursiva, eyebrow—, que es más
          //     preciso que contar líneas y no depende de dónde empiece el cuerpo.
          //     El defecto venía del canon: E2-(c) pedía «las primeras 14 líneas».
          //
          //  2. IGUALDAD CONTRA EL VALOR ENTERO. En cap-1/02-aum-primordial el
          //     encabezado «La Cosmogonía Vibracional» SÍ caía dentro de la ventana
          //     y aun así no disparaba, porque el subtitle es «La cosmogonía
          //     vibracional · el AUM Primordial». El «·» parte el subtítulo en
          //     trozos que reaparecen sueltos como encabezados: es la duplicación
          //     que el lector percibe como «se repite, sobra algo», y ninguna
          //     comparación contra el valor entero puede verla.
          //
          //  3. Y no veía la CONTENCIÓN, que se da en los dos sentidos: el
          //     encabezado dentro del subtítulo (cap-4/04-telares-neurona:110) y el
          //     subtítulo dentro del encabezado (obertura/09-estados:77).
          //
          // Se mantiene intacto lo que la versión anterior hizo bien: NO dispara con
          // el valor viajando como PROP de un componente, ni con una mención en
          // prosa. Que §1.0 diga «El umbral ha sido cruzado» en una pieza subtitulada
          // «El umbral» es escribir, no duplicar.
          const fm = lines.slice(0, bodyStart).join('\n');
          const desnuda = (l) => l
            .replace(/^\s*#{1,6}\s*/, '')            // encabezado markdown
            .replace(/^\s*<h[1-6][^>]*>|<\/h[1-6]>\s*$/g, '')
            .replace(/<span class="num">[^<]*<\/span>/g, '')
            .replace(/^\s*<p[^>]*>|<\/p>\s*$/g, '')
            .replace(/^[*_\s]+|[*_\s]+$/g, '')        // cursiva/negrita de la glosa
            .trim();
          // Comparar por forma, no por bytes: sin tildes, sin puntuación, en minúscula.
          // «La Cosmogonía Vibracional» y «La cosmogonía vibracional» son el mismo texto.
          const norm = (s) => s
            .normalize('NFD').replace(/[̀-ͯ]/g, '')
            .toLowerCase()
            .replace(/[^\p{L}\p{N}\s]/gu, ' ')
            .replace(/\s+/g, ' ')
            .trim();
          // Línea candidata = la que el lector lee como rótulo, no como prosa:
          // encabezado markdown o HTML, glosa/eyebrow en cursiva o negrita a línea
          // completa. Esto sustituye a la ventana: filtra por forma, no por posición.
          const esCandidata = (l) => {
            const t = l.trim();
            if (!t) return false;
            if (/^(#{1,6}\s|<h[1-6][\s>])/.test(t)) return true;
            if (/^<p[^>]*class="[^"]*eyebrow/.test(t)) return true;
            return /^[*_]{1,2}[^*_].*[*_]{1,2}$/.test(t) && t.length < 160;
          };
          const MIN = 18; // por debajo de esto la contención produce falsos positivos
          for (const campo of ['title', 'subtitle']) {
            const mm = fm.match(new RegExp(`^${campo}:\\s*"?(.+?)"?\\s*$`, 'm'));
            const val = mm && mm[1].trim();
            if (!val || val.length <= 8) continue;
            // El valor entero y, si lleva «·», cada uno de sus trozos.
            const fragmentos = [val, ...(val.includes('·') ? val.split('·') : [])]
              .map((f) => f.trim()).filter((f) => norm(f).length >= MIN);
            let marcado = false;
            for (let k = 0; k < cuerpoLines.length && !marcado; k++) {
              if (!esCandidata(cuerpoLines[k])) continue;
              const linea = norm(desnuda(cuerpoLines[k]));
              if (linea.length < MIN) continue;
              for (const frag of fragmentos) {
                const f = norm(frag);
                const igual = linea === f;
                // El `title` NOMBRA el tema de la pieza, así que reaparece de forma
                // legítima en los encabezados que hablan de ese tema: «Qué no es el
                // Meta-Observador», «Lo que el Parlamento Cuántico sí establece y lo
                // que no». Ahí el título es el SUJETO de una frase con predicado
                // propio, no un rótulo repetido. Por eso el título solo dispara por
                // igualdad —y hoy da cero, dato ya verificado en el censo—, mientras
                // que el subtítulo, que es una formulación concreta y no un nombre,
                // dispara también por contención en los dos sentidos.
                const contiene = campo === 'subtitle'
                  && !igual && (linea.includes(f) || f.includes(linea));
                if (!igual && !contiene) continue;
                cerrojoHits[c.id].push({
                  file: rel(file, baseDir),
                  line: bodyStart + k + 1,
                  texto: `${campo}${frag === val ? '' : ' (fragmento)'} ${igual ? '=' : '⊃'} ${frag.slice(0, 52)}`,
                });
                marcado = true;
                break;
              }
            }
          }
        }
      }

      for (const l of LEMAS) {
        lemaHits[l.id] += countMatches(flat, l.re);
      }
      palabrasCuerpo += (flat.match(/\p{L}[\p{L}\p{M}'-]*/gu) || []).length;

      // Promesas: extrae referencias a capítulo/sección (solo cuerpo, no frontmatter).
      lines.forEach((line, i) => {
        if (i < bodyStart) return;
        const caps = line.match(RE_PROMESA_CAP) || [];
        const secs = line.match(RE_PROMESA_SEC) || [];
        for (const ref of [...caps, ...secs]) {
          promesas.push({ file: rel(file, baseDir), line: i + 1, ref, contexto: line.trim().slice(0, 120).replace(/\t/g, ' ') });
        }
      });

      // Énfasis sospechoso: blockquote (bloque contiguo de líneas '>') con número
      // IMPAR de asteriscos en total → énfasis sin cerrar. Una cursiva/negrita
      // multi-línea bien formada suma par (apertura + cierre), y no se marca.
      for (let k = 0; k < lines.length; k++) {
        if (!/^\s*>/.test(lines[k])) continue;
        let ast = 0, start = k;
        while (k < lines.length && /^\s*>/.test(lines[k])) { ast += (lines[k].match(/\*/g) || []).length; k++; }
        if (ast % 2 === 1) {
          enfasisSospechoso++;
          if (enfasisEjemplos.length < 3) enfasisEjemplos.push({ file: rel(file, baseDir), line: start + 1 });
        }
      }

      // F2 · REGLA INVERTIDA. Antes esta comprobación EXIGÍA el marcador
      // "PRÁCTICA CONTEMPLATIVA · Carril B" en cada práctica. Ricardo decidió
      // retirarlo de toda la obra («el término Carril A y Carril B sale de la
      // narrativa misma, no de que esté explícito»), así que el linter habría
      // reportado como defectuosas las 38 prácticas una vez limpias. Ahora
      // reporta lo contrario: las prácticas que TODAVÍA lo llevan.
      for (let k = 0; k < lines.length; k++) {
        if (!/<(LaboratorioInterior|PausaReflexiva)\b/.test(lines[k])) continue;
        const ventana = lines.slice(k, k + 7).join('\n');
        if (/PR[ÁA]CTICA CONTEMPLATIVA\s*·\s*Carril B/.test(ventana)) {
          marcadorCarril++;
          if (marcadorEjemplos.length < 3) marcadorEjemplos.push({ file: rel(file, baseDir), line: k + 1 });
        }
      }
    }

    const moOk = moTotal >= cap.moMin && moTotal <= cap.moMax;
    if (!moOk) violaciones++;
    if (andamiajeHits.length > 0) violaciones++;

    // Cerrojos y lemas: AVISO por defecto; solo cuentan como violación con
    // LINT_ESTRICTO=1, cuando su fase correspondiente ya ha cerrado.
    const lemaPorDiezMil = Object.fromEntries(
      LEMAS.map((l) => [l.id, palabrasCuerpo ? (lemaHits[l.id] * 10000) / palabrasCuerpo : 0]),
    );
    if (MODO_ESTRICTO) {
      for (const c of CERROJOS) if (cerrojoHits[c.id].length > 0) violaciones++;
      for (const l of LEMAS) if (lemaPorDiezMil[l.id] > l.techoPorDiezMil) violaciones++;
    }

    report.push({ cap, files: files.length, moTotal, moOk, muletillaTotal, andamiajeHits, enfasisSospechoso, enfasisEjemplos, marcadorCarril, marcadorEjemplos, cerrojoHits, lemaHits, lemaPorDiezMil, palabrasCuerpo });
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

console.log('\nPrácticas que TODAVÍA llevan el marcador "Carril B" (se retira en la Fase 4a)');
let marcadorGlobal = 0;
for (const r of report) {
  if (r.marcadorCarril > 0) {
    const ej = r.marcadorEjemplos.map((e) => `${e.file}:${e.line}`).join(', ');
    console.log(`  ${r.cap.tag.padEnd(9)} ${r.marcadorCarril}  (ej: ${ej})`);
    marcadorGlobal += r.marcadorCarril;
  }
}
if (marcadorGlobal === 0) console.log('  OK · ninguna práctica anuncia su carril');

// --- Cerrojos de los estándares editoriales (AVISO, salvo LINT_ESTRICTO=1) ---
const modo = MODO_ESTRICTO ? 'ESTRICTO · FALLA' : 'AVISO · no falla';
console.log(`\nCerrojos editoriales · Manual_Estilo_Editorial_TDV_v1  [${modo}]`);
console.log(`  ${'cerrojo'.padEnd(44)} ${report.map((r) => r.cap.tag.padStart(8)).join(' ')}`);
for (const c of CERROJOS) {
  const fila = report.map((r) => String(r.cerrojoHits[c.id].length).padStart(8)).join(' ');
  const total = report.reduce((s, r) => s + r.cerrojoHits[c.id].length, 0);
  console.log(`  ${(total === 0 ? '✅ ' : '·  ') + c.nombre}`.padEnd(46) + fila);
}
for (const l of LEMAS) {
  const fila = report.map((r) => (r.lemaPorDiezMil[l.id]).toFixed(2).padStart(8)).join(' ');
  console.log(`  ·  ${l.nombre} por 10.000 (techo ${l.techoPorDiezMil})`.padEnd(46) + fila);
}
console.log('  Para hacerlos bloqueantes cuando su fase cierre:  LINT_ESTRICTO=1 node scripts/content-lint.mjs');

console.log(`\nPromesas cruzadas → out/promesas.tsv (${promesas.length} referencias)`);
console.log(`\n${violaciones === 0 ? '✅ SIN violaciones de reglas FALLA' : `✗ ${violaciones} regla(s) FALLA violada(s)`}\n`);

process.exit(violaciones === 0 ? 0 : 1);
}

// Constantes de configuración expuestas para pruebas.
export { CAPITULOS, MULETILLAS, ANDAMIAJE, CERROJOS, LEMAS, flattenBody };
