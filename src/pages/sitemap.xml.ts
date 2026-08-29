import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';

const SITE = 'https://tejidosdevibracion.com';

const STATIC_PUBLIC_URLS = [
  '/',
  '/recibir',
  '/indice',
  '/sobre-el-libro',
  '/comunidad',
  '/acto-i',
  '/acto-ii',
  '/acto-iii',
  '/colofon',
  '/obertura',
  '/contacto',
];

function priorityFor(path: string): string {
  if (path === '/') return '1.0';
  if (path === '/obertura') return '0.9';
  if (path.startsWith('/obertura/')) return '0.8';
  if (path.startsWith('/capitulo/')) return '0.7';
  return '0.7';
}

export const GET: APIRoute = async () => {
  const today = new Date().toISOString().slice(0, 10);

  const oberturaEntries = await getCollection('obertura', ({ data }) => data.status === 'published');
  oberturaEntries.sort((a, b) => a.data.order - b.data.order);
  const oberturaUrls = oberturaEntries.map((entry) => `/obertura/${entry.id}`);

  // Indexable chapters: only when the parent chapter is published.
  // `fragmento-permanente` is excluded because today it renders BloquePuerta.
  const publishedChapters = await getCollection('book', ({ data }) =>
    data.kind === 'capitulo' && data.status === 'published'
  );
  publishedChapters.sort((a, b) => a.data.order - b.data.order);
  const publishedChapterSlugs = new Set<string>(publishedChapters.map((chapter) => chapter.id));

  const chapterIndexUrls = publishedChapters.map((chapter) => `/capitulo/${chapter.id}`);
  // El filtro mira SOLO el capítulo padre, y es correcto: `[section].astro:60-69`
  // declara que la visibilidad la decide el status del capítulo, no el de la pieza.
  //
  // ⚠️ NO añadir aquí `data.status === 'published'` ni `!data.archived`, por mucho
  // que la asimetría con la línea 30 (obertura, que sí filtra por status) invite a
  // "corregirla". Medido el 5-ago-2026 sobre el corpus:
  //   · `status` en chapter-sections tiene default('draft') y NINGUNA pieza de los
  //     caps. 1-3 lo declara: las 9 piezas del Cap. 1 están hoy indexadas siendo
  //     'draft'. Exigir 'published' daría 0 URLs para cap-2 y 0 para cap-3.
  //   · `archived` NO EXISTE en el schema de chapter-sections — sólo en `book`.
  //     Escribirlo en el frontmatter de una pieza no la excluye de nada: Zod lo
  //     descarta en silencio, y ni el sitemap ni el runtime lo ven.
  //
  // La invariante que sí hay que sostener es la COHERENCIA con el runtime: el
  // sitemap debe anunciar exactamente las URLs que `[section].astro` sirve. Está
  // atada en `scripts/sitemap-coherencia.test.mjs` con su control positivo.
  const chapterSections = await getCollection('chapter-sections', ({ data }) =>
    publishedChapterSlugs.has(data.chapter)
  );
  chapterSections.sort((a, b) => {
    const byChapter = a.data.chapter.localeCompare(b.data.chapter);
    return byChapter === 0 ? a.data.order - b.data.order : byChapter;
  });
  const chapterSectionUrls = chapterSections.map((section) => {
    const [chapter, leaf] = section.id.split('/');
    return `/capitulo/${chapter}/${leaf}`;
  });

  const allUrls = Array.from(new Set([
    ...STATIC_PUBLIC_URLS,
    ...oberturaUrls,
    ...chapterIndexUrls,
    ...chapterSectionUrls,
  ]));

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${allUrls
  .map(
    (url) => `  <url>
    <loc>${SITE}${url}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>${priorityFor(url)}</priority>
  </url>`
  )
  .join('\n')}
</urlset>`;

  return new Response(xml, {
    headers: { 'Content-Type': 'application/xml; charset=utf-8' },
  });
};