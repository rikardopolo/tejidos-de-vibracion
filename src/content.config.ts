import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';
// FUENTE ÚNICA de slugs de producto · el MISMO catálogo que usa el webhook de
// Lemon Squeezy (SLUG_NIVEL). Tipar productoSlug como enum hace que un typo en el
// frontmatter ROMPA el build (astro check), en vez de fallar en silencio y dejar
// que el gate niegue acceso a un comprador legítimo.
import { PRODUCT_SLUGS } from '@/lib/product-slugs.mjs';

/**
 * Colección `book` · entradas top-level del libro.
 * Cada archivo en `content/book/*.mdx` es una pieza canónica del libro
 * (portada, obertura, capítulos del Volumen I, interludio, colofón).
 */
const book = defineCollection({
  loader: glob({ pattern: '**/*.mdx', base: './src/content/book' }),
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
    /**
     * Estado editorial de la pieza.
     * - 'draft', 'review', 'gestation' · invisible en /indice
     * - 'published' · visible en /indice como link activo · si chapterNum === 1, renderiza contenido completo a Nivel 1
     * - 'fragmento-permanente' · escrito pero NO disponible aún · visible en /indice con badge "soon" · runtime muestra BloquePuerta 'cap-espera'/'cap-bloqueado' (igual que un cap N1 no publicado)
     */
    status: z.enum(['draft', 'review', 'published', 'gestation', 'fragmento-permanente']).default('draft'),
    authors: z.array(z.string()).default(['Ricardo Polo']),
    tags: z.array(z.string()).default([]),
    /** URL al PDF descargable (Capa 2+). */
    pdfUrl: z.string().optional(),
    /**
     * Marca el MDX como contenido archivado: el cuerpo editorial vive en
     * `chapter-sections/` y este archivo se conserva solo para que el routing
     * resuelva `chapterEntry` (controla el status que heredan las piezas).
     * Metadata pura · no afecta runtime · señal para mantenedores.
     */
    archived: z.boolean().default(false),
    /**
     * Nivel de acceso que exige esta pieza (gating data-driven).
     * Por defecto 1 (tejedor registrado), que preserva el comportamiento
     * histórico de Acto I. El contenido de pago debe declararlo explícito:
     * Cap. 4 / Acto II → 2 ; libro completo → 3.
     */
    nivelRequerido: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]).default(1),
    /**
     * Slug del producto/bundle que desbloquea esta pieza. Cuando está
     * presente, el lector además debe tener ese slug en el scope de su token
     * de compra. Sólo aplica a contenido de pago (nivelRequerido ≥ 2);
     * déjalo vacío para contenido gratis/registrado.
     */
    productoSlug: z.enum(PRODUCT_SLUGS).optional(),
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
  loader: glob({ pattern: '**/*.mdx', base: './src/content/chapter-sections' }),
  schema: z.object({
    /** Slug del capítulo padre (ej. "cap-1-universo-sinfonia"). */
    chapter: z.string(),
    /**
     * Tipo de sección dentro del capítulo:
     * - 'portada'  · entrada del capítulo (título + Anclaje Experiencial)
     * - 'umbral'   · Umbral Poético (apertura literaria del capítulo)
     * - 'anclaje'  · Anclaje Experiencial (ejercicio corporal inicial)
     * - 'numbered' · §N.M secciones canónicas (§1.1, §1.2, ...)
     * - 'cierre'   · Cierre Vibracional (síntesis + mantra final)
     */
    kind: z.enum(['portada', 'umbral', 'anclaje', 'numbered', 'cierre']),
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
    /**
     * Estado editorial · mismo significado que en colección `book`:
     * - 'fragmento-permanente' · escrito pero no disponible · BloquePuerta espera
     * - 'published' · contenido completo renderiza para Nivel 1
     */
    status: z.enum(['draft', 'review', 'published', 'fragmento-permanente']).default('draft'),
    /**
     * Nivel de acceso de la pieza. Por defecto hereda 1 (registrado), igual
     * que el comportamiento histórico. El gate efectivo usa el MAYOR entre
     * este valor y el del capítulo padre, así que para Acto II basta con
     * declarar nivelRequerido=2 en el capítulo padre.
     */
    nivelRequerido: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]).default(1),
    /** Slug del producto que desbloquea la pieza (sólo contenido de pago). */
    productoSlug: z.enum(PRODUCT_SLUGS).optional(),
    publishedAt: z.date().optional(),
    authors: z.array(z.string()).default(['Ricardo Polo']),
    tags: z.array(z.string()).default([]),
  }),
});

/**
 * Colección `obertura` · 15 piezas que componen la Obertura del Volumen I
 * (estructura de biblioteca con 4 secciones).
 *
 * Migrada desde el portal `tejidos-de-realidad` el 2026-05-18 · ver
 * PROMPT-MIGRACION-OBERTURA-2026-05-18.md.
 *
 * Estructura editorial:
 *   i.   Apertura     · 00-frontispicio · 01-anclaje · interludio-i
 *   ii.  Capacidades  · 02-meta-observador · 03-interferometro · interludio-ii · 04-tejedor
 *   iii. Marco        · 05-cartografia · 06-velos · 07-voz-transversal · 08-niveles · 09-estados
 *   iv.  Cierre       · interludio-iii · 10-sintesis · 11-cierre
 */
const obertura = defineCollection({
  loader: glob({ pattern: '**/*.mdx', base: './src/content/obertura' }),
  schema: z.object({
    /** Número del capítulo o interludio · "00", "01", ..., "11", "i", "ii", "iii" */
    chapterNum: z.string(),
    /** Tipo · capítulo regular o interludio musical (más etéreo) */
    kind: z.enum(['frontispicio', 'capitulo', 'interludio']),
    /** Título principal (ej. "El Meta-Observador") */
    title: z.string(),
    /** Subtítulo en cursiva (ej. "La consciencia que se observa observando") */
    subtitle: z.string().optional(),
    /** Sección de la biblioteca · 4 grupos en el TOC */
    section: z.enum(['apertura', 'capacidades', 'marco', 'cierre']),
    /** Posición numérica para ordenamiento en TOC y prev/next */
    order: z.number(),
    /** Etiqueta corta del header sticky (ej. "00 · Frontispicio") */
    headerLabel: z.string(),
    /** Estado de publicación */
    status: z.enum(['draft', 'review', 'published']).default('published'),
    publishedAt: z.date().optional(),
    authors: z.array(z.string()).default(['Ricardo Polo']),
    tags: z.array(z.string()).default([]),
  }),
});

export const collections = { book, 'chapter-sections': chapterSections, obertura };
