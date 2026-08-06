/**
 * El sitemap debe anunciar EXACTAMENTE lo que el runtime sirve.
 * Correr: node --test scripts/sitemap-coherencia.test.mjs
 *
 * Por qué existe este fichero. La nota de mantenimiento decía que el filtro del
 * sitemap «solo mira publishedChapterSlugs, nunca el status ni el archived de la
 * propia sección» y lo llamaba bomba de relojería para el día que se abriera el
 * cap-2 con sus 14 piezas. Medido el 5-ago-2026, la formulación estaba equivocada
 * y el arreglo que sugería habría sido el desastre:
 *
 *   · `status` en chapter-sections tiene default('draft') y NINGUNA pieza de los
 *     caps. 1-3 lo declara. Exigir 'published' habría dado 0 URLs para cap-2 y 0
 *     para cap-3 — sitemap vacío en el momento de abrirlos.
 *   · `archived` no existe en el schema de chapter-sections. Escribirlo en una
 *     pieza no la excluye de nada; Zod lo descarta sin avisar.
 *
 * Verificado contra producción el mismo día: las 9 URLs de pieza que anuncia el
 * sitemap responden 200 y sirven prosa al bot. Sitemap y runtime coinciden.
 *
 * Lo que este test ata no es el filtro, sino la INVARIANTE: toda pieza de un
 * capítulo publicado entra, y ninguna de un capítulo no publicado. Si alguien
 * "corrige" la asimetría con la obertura, el primer test cae.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const contentDir = path.join(raiz, 'src', 'content');
const sitemapSrc = readFileSync(path.join(raiz, 'src', 'pages', 'sitemap.xml.ts'), 'utf8');

const campo = (raw, k) => (raw.match(new RegExp(`^${k}:\\s*["']?([a-zA-Z-]+)`, 'm')) ?? [])[1];

// --- El corpus real, leído del disco (no del build) ---
const capitulos = readdirSync(path.join(contentDir, 'book'))
  .filter((f) => f.endsWith('.mdx'))
  .map((f) => {
    const raw = readFileSync(path.join(contentDir, 'book', f), 'utf8');
    return { slug: f.replace(/\.mdx$/, ''), status: campo(raw, 'status') ?? 'draft', kind: campo(raw, 'kind') };
  });

const secDir = path.join(contentDir, 'chapter-sections');
const secciones = readdirSync(secDir)
  .filter((d) => statSync(path.join(secDir, d)).isDirectory())
  .flatMap((cap) =>
    readdirSync(path.join(secDir, cap))
      .filter((f) => f.endsWith('.mdx'))
      .map((f) => ({ chapter: cap, leaf: f.replace(/\.mdx$/, '') })),
  );

// Reproduce el filtro del sitemap tal como está escrito hoy.
const publicados = new Set(capitulos.filter((c) => c.status === 'published').map((c) => c.slug));
const anunciadas = secciones.filter((s) => publicados.has(s.chapter));

test('el sitemap anuncia TODAS las piezas de un capítulo publicado', () => {
  for (const cap of publicados) {
    const total = secciones.filter((s) => s.chapter === cap).length;
    const dentro = anunciadas.filter((s) => s.chapter === cap).length;
    assert.equal(dentro, total, `${cap}: el sitemap anunciaría ${dentro} de ${total} piezas`);
  }
});

test('el sitemap NO anuncia piezas de capítulos sin publicar', () => {
  const fuera = anunciadas.filter((s) => !publicados.has(s.chapter));
  assert.equal(fuera.length, 0, `se colaron: ${JSON.stringify(fuera)}`);
});

test('toda URL anunciada corresponde a un fichero que existe', () => {
  for (const s of anunciadas) {
    const p = path.join(secDir, s.chapter, `${s.leaf}.mdx`);
    assert.ok(existsSync(p), `anunciada sin fichero: ${s.chapter}/${s.leaf}`);
  }
});

test('CONTROL POSITIVO · abrir un capítulo mete sus piezas, y son >0', () => {
  // El fallo que este fichero existe para impedir: que al abrir cap-2 el sitemap
  // se quede vacío porque alguien filtró por un campo que nadie declara.
  const cap2 = 'cap-2-ciencia-escuchar';
  const total = secciones.filter((s) => s.chapter === cap2).length;
  assert.ok(total > 0, 'el fixture del corpus cambió: cap-2 ya no tiene piezas');
  const simulado = new Set([...publicados, cap2]);
  const conCap2 = secciones.filter((s) => simulado.has(s.chapter) && s.chapter === cap2).length;
  assert.equal(conCap2, total, `al abrir ${cap2} entrarían ${conCap2} de ${total}`);
});

test('el filtro del sitemap NO exige status ni archived en la sección', () => {
  // Guarda de regresión sobre el código, no sobre los datos. `status` en
  // chapter-sections tiene default('draft') y `archived` ni siquiera existe en su
  // schema: cualquiera de los dos en este filtro vacía el sitemap en silencio.
  const bloque = sitemapSrc.slice(
    sitemapSrc.indexOf("getCollection('chapter-sections'"),
    sitemapSrc.indexOf('chapterSections.sort'),
  );
  assert.ok(bloque.length > 0, 'no se localizó el filtro de chapter-sections');
  assert.ok(!/data\.status/.test(bloque), 'el filtro exige status de la sección: vaciaría el sitemap');
  assert.ok(!/archived/.test(bloque), 'el filtro mira archived, que no existe en el schema de sección');
});

// Extrae el cuerpo de `const <nombre> = defineCollection({ … })` delimitando por la
// DECLARACIÓN siguiente, no por una ventana de caracteres. La primera versión de
// esto cortaba desde la primera aparición del texto «chapter-sections», que está en
// un COMENTARIO dentro del bloque `book` — así que se tragaba el `archived:` de book
// y daba falso positivo. Regla semántica comprobada posicionalmente: el error que
// este repo ya ha cometido cinco veces.
const cfgSrc = readFileSync(path.join(raiz, 'src', 'content.config.ts'), 'utf8');
function bloqueColeccion(nombre) {
  const re = new RegExp(`const\\s+${nombre}\\s*=\\s*defineCollection\\(`, 'm');
  const m = re.exec(cfgSrc);
  if (!m) return null;
  const desde = m.index;
  const sig = /(?:^const\s+\w+\s*=\s*defineCollection\()|(?:^export const collections)/m
    .exec(cfgSrc.slice(desde + m[0].length));
  return sig ? cfgSrc.slice(desde, desde + m[0].length + sig.index) : cfgSrc.slice(desde);
}

test('el extractor de bloques funciona · CONTROL POSITIVO sobre `book`', () => {
  // Sin esto, el test de abajo pasaría igual si el extractor devolviera vacío.
  const book = bloqueColeccion('book');
  assert.ok(book, 'no se localizó la colección book');
  assert.match(book, /archived:\s*z\.boolean/, 'book SÍ declara archived; si esto falla, el extractor está roto');
});

test('`archived` NO está en el schema de chapter-sections (por eso no se filtra)', () => {
  // Si alguien lo añade, este test cae y hay que decidir a conciencia si el sitemap
  // Y el runtime empiezan a respetarlo — los dos a la vez, no uno solo.
  const sec = bloqueColeccion('chapterSections');
  assert.ok(sec, 'no se localizó la colección chapterSections');
  assert.ok(
    !/archived:/.test(sec),
    'chapter-sections ya declara `archived`: revisar sitemap Y [section].astro a la vez',
  );
});
