/**
 * SEO helpers Â· Schema.org JSON-LD compartido entre layouts y pages.
 *
 * - `SITE` constante de URL canÃ³nica (la Ãºnica fuente de verdad para schemas).
 * - `baseSchemaGraph()` Organization + WebSite + Person Â· presente en CADA pÃ¡gina.
 * - `breadcrumb()` helper para construir BreadcrumbList limpios.
 * - `wrapGraph()` wrapper minÃºsculo para envolver un array en `@context + @graph`.
 *
 * DiseÃ±o:
 *   Las funciones devuelven objetos plain â†’ SchemaJsonLd los serializa con
 *   JSON.stringify. No hay validaciÃ³n runtime â€” confiamos en TS strict y
 *   pruebas manuales con Schema.org validator (https://validator.schema.org).
 */

export const SITE = 'https://www.tejidosdevibracion.com';
export const OG_SITE = SITE;
/** Sitio hermano (portal Â· laboratorio + constelaciÃ³n + autor). */
export const SITE_PORTAL = 'https://tejidosderealidad.com';
export const OG_IMAGE_WIDTH = 1200;
export const OG_IMAGE_HEIGHT = 630;
export const OG_IMAGE_TYPE = 'image/jpeg';
export const DEFAULT_OG_IMAGE_PATH = '/og/og-obertura.jpg';
export const DEFAULT_OG_IMAGE = `${OG_SITE}${DEFAULT_OG_IMAGE_PATH}`;
export const DEFAULT_OG_ALT = 'Tejidos de VibraciÃ³n';

export type SchemaNode = Record<string, unknown>;

export function resolveOgImage(image?: string): string {
  const source = image ?? DEFAULT_OG_IMAGE_PATH;
  return source.startsWith('http') ? source : new URL(source, OG_SITE).toString();
}

export function chapterOgImage(chapterSlug: string): string {
  const match = /^cap-(\d+)-/.exec(chapterSlug);
  if (!match) return DEFAULT_OG_IMAGE;

  const chapterNumber = Number(match[1]);
  if (chapterNumber < 1 || chapterNumber > 10) return DEFAULT_OG_IMAGE;

  return `${OG_SITE}/og/og-cap-${chapterNumber}.jpg`;
}

export function chapterOgAlt(chapterLabel: string, chapterTitle: string): string {
  return `Tejidos de VibraciÃ³n Â· ${chapterLabel} Â· ${chapterTitle}`;
}

/**
 * Schemas base Â· Organization + WebSite + Person.
 * Devuelve un array para incrustar en `@graph`. Llamar desde todos los layouts.
 */
export function baseSchemaGraph(): SchemaNode[] {
  return [
    {
      '@type': 'Organization',
      '@id': `${SITE}/#organization`,
      name: 'Tejidos de VibraciÃ³n',
      alternateName: 'TDV',
      url: SITE + '/',
      logo: {
        '@type': 'ImageObject',
        url: DEFAULT_OG_IMAGE,
        width: OG_IMAGE_WIDTH,
        height: OG_IMAGE_HEIGHT,
      },
      description:
        'Libro Tejidos de VibraciÃ³n Â· Volumen I. Sitio dedicado del libro publicado por el proyecto editorial Tejidos de Realidad.',
      founder: { '@id': `${SITE}/sobre-el-libro#person` },
      publishingPrinciples: `${SITE}/privacidad`,
      sameAs: [SITE_PORTAL + '/', 'https://github.com/rikardopolo/tejidos-de-vibracion'],
    },
    {
      '@type': 'WebSite',
      '@id': `${SITE}/#website`,
      url: SITE + '/',
      name: 'Tejidos de VibraciÃ³n',
      description:
        'Libro digital Â· Volumen I Â· por Ricardo Polo. Una Obertura, tres actos, diez capÃ­tulos.',
      publisher: { '@id': `${SITE}/#organization` },
      inLanguage: 'es',
    },
    {
      '@type': 'Person',
      '@id': `${SITE}/sobre-el-libro#person`,
      name: 'Ricardo Polo',
      alternateName: 'Orion',
      url: `${SITE}/sobre-el-libro`,
      image: `${SITE}/assets/ricardo-polo.png`,
      jobTitle: 'Autor Â· Ingeniero ElÃ©ctrico Â· Ensayista',
      description:
        'Ingeniero elÃ©ctrico y ensayista colombiano. Autor del proyecto Tejidos de Realidad y del libro Tejidos de VibraciÃ³n Â· Volumen I.',
      address: {
        '@type': 'PostalAddress',
        addressLocality: 'Cali',
        addressRegion: 'Valle del Cauca',
        addressCountry: 'CO',
      },
      knowsAbout: [
        'CymÃ¡tica',
        'FÃ­sica cuÃ¡ntica',
        'MecÃ¡nica cuÃ¡ntica',
        'Neurociencia de la conciencia',
        'Coherencia cardÃ­aca',
        'Escala de Hawkins',
        'FilosofÃ­a contemplativa',
        'DivulgaciÃ³n cientÃ­fica',
      ],
      worksFor: { '@id': `${SITE}/#organization` },
      sameAs: ['https://github.com/rikardopolo'],
    },
  ];
}

export interface BreadcrumbItem {
  name: string;
  /** Path absoluto desde root (ej. `/libro/obertura`). Se concatena con SITE. */
  href: string;
}

/** Construye un BreadcrumbList Schema.org bien formado. */
export function breadcrumb(items: BreadcrumbItem[], anchorId?: string): SchemaNode {
  return {
    '@type': 'BreadcrumbList',
    ...(anchorId ? { '@id': `${SITE}${anchorId}` } : {}),
    itemListElement: items.map((it, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: it.name,
      item: `${SITE}${it.href}`,
    })),
  };
}

/** Envuelve un array de nodes en `{@context + @graph}`. */
export function wrapGraph(graph: SchemaNode[]): SchemaNode {
  return {
    '@context': 'https://schema.org',
    '@graph': graph,
  };
}

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Sitemap helpers (P7.3)
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export interface SitemapEntry {
  /** Path absoluto desde root (ej. `/libro/obertura`) â€” se concatena con SITE */
  path: string;
  /** Fecha YYYY-MM-DD */
  lastmod: string;
  /** Priority 0.0â€“1.0 â€” recomendado: home=1.0, secciones=0.7â€“0.9, contenido=0.5â€“0.7, legal=0.2 */
  priority: number;
  /** changefreq Â· always | hourly | daily | weekly | monthly | yearly | never */
  changefreq: 'always' | 'hourly' | 'daily' | 'weekly' | 'monthly' | 'yearly' | 'never';
}

/** Escapa XML entities en URLs (paranoia Â· paths controlados, pero no cuesta nada). */
function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

/**
 * Renderiza un sitemap XML vÃ¡lido (sitemaps.org schema 0.9) con hreflang
 * para cada URL. FunciÃ³n pura â€” Ãºtil para tests.
 */
export function renderSitemapXml(entries: SitemapEntry[]): string {
  const urls = entries.map((r) => {
    const url = escapeXml(`${SITE}${r.path}`);
    return `  <url>
    <loc>${url}</loc>
    <lastmod>${r.lastmod}</lastmod>
    <changefreq>${r.changefreq}</changefreq>
    <priority>${r.priority.toFixed(1)}</priority>
    <xhtml:link rel="alternate" hreflang="es-CO" href="${url}" />
    <xhtml:link rel="alternate" hreflang="x-default" href="${url}" />
  </url>`;
  }).join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:xhtml="http://www.w3.org/1999/xhtml">
${urls}
</urlset>`;
}
