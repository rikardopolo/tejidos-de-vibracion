import { defineCollection, z } from 'astro:content';

/**
 * Colección `book` · entradas top-level del libro.
 * Cada archivo en `content/book/*.mdx` es una pieza canónica del libro
 * (portada, obertura, capítulos del Volumen I, interludio, colofón).
 */
const book = defineCollection({
  type: 'content',
  schema: z.object({
    title: z.string(),
    subtitle: z.string().optional(),
    /** Posición global para ordenamiento (1, 2, …). */
    order: z.number(),
    /** Volumen al que pertenece. Por defecto Volumen I. */
    volume: z.number().default(1),
    /** Acto en el que se enmarca (obertura actúa como prólogo). */
    act: z.enum(['obertura', 'I', 'II', 'III']).optional(),
    /** Número de capítulo dentro del acto. null para portada/obertura/colofón. */
    chapter: z.number().nullable().optional(),
    /** Tipo de pieza editorial. */
    kind: z.enum(['portada', 'obertura', 'capitulo', 'interludio', 'colofon']),
    /** Tiempo estimado de lectura en minutos. */
    readingTime: z.number().optional(),
    publishedAt: z.date().optional(),
    /** Estado editorial de la pieza. */
    status: z.enum(['draft', 'review', 'published', 'gestation']).default('draft'),
    authors: z.array(z.string()).default(['Ricardo Polo']),
    tags: z.array(z.string()).default([]),
    /** URL al PDF descargable (Capa 2+). */
    pdfUrl: z.string().optional(),
  }),
});

/**
 * Colección `chapter-sections` · secciones individuales de cada capítulo.
 * Cada capítulo se divide en secciones navegables (umbral poético,
 * anclaje experiencial, secciones numeradas §N.M, cierre vibracional).
 *
 * Estructura de carpetas:
 *   content/chapter-sections/cap-1-universo-sinfonia/
 *     ├── 00-umbral-poetico.mdx
 *     ├── 01-anclaje-experiencial.mdx
 *     ├── 02-cosmogonias-vibracionales.mdx   (§1.1)
 *     └── 07-cierre-vibracional.mdx
 */
const chapterSections = defineCollection({
  type: 'content',
  schema: z.object({
    /** Slug del capítulo padre (ej. "cap-1-universo-sinfonia"). */
    chapter: z.string(),
    /** Tipo de sección. */
    kind: z.enum(['umbral', 'anclaje', 'numbered', 'cierre']),
    /** Número §N.M para secciones tipo 'numbered' (ej. "1.1"). */
    num: z.string().optional(),
    /** Título principal de la sección. */
    title: z.string(),
    /** Subtítulo opcional. */
    subtitle: z.string().optional(),
    /** Orden global dentro del capítulo (0, 1, 2, …). */
    order: z.number(),
    /** Etiqueta corta del header sticky (ej. "Capítulo 1 · §1.1"). */
    headerLabel: z.string(),
    /** Estado editorial. */
    status: z.enum(['draft', 'review', 'published']).default('draft'),
    publishedAt: z.date().optional(),
    authors: z.array(z.string()).default(['Ricardo Polo']),
    tags: z.array(z.string()).default([]),
  }),
});

export const collections = { book, 'chapter-sections': chapterSections };
