import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';

const SITE = 'https://tejidosdevibracion.com';

export const GET: APIRoute = async () => {
  const today = new Date().toISOString().slice(0, 10);

  // Páginas estáticas
  const staticUrls = [
    '/',
    '/obertura',
    '/indice',
    '/acto-i',
    '/acto-ii',
    '/acto-iii',
    '/sobre-el-libro',
    '/recibir',
    '/comunidad',
    '/colofon',
    '/privacidad',
    '/buscar',
  ];

  // Páginas de capítulos (solo publicados)
  const chapters = await getCollection('book', ({ data }) =>
    data.kind === 'capitulo' && data.status === 'published'
  );
  const chapterUrls = chapters.map((c) => `/capitulo/${c.slug}`);

  const allUrls = [...staticUrls, ...chapterUrls];

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${allUrls
  .map(
    (url) => `  <url>
    <loc>${SITE}${url}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>${url === '/' ? '1.0' : url === '/obertura' ? '0.9' : '0.7'}</priority>
  </url>`
  )
  .join('\n')}
</urlset>`;

  return new Response(xml, {
    headers: { 'Content-Type': 'application/xml; charset=utf-8' },
  });
};
