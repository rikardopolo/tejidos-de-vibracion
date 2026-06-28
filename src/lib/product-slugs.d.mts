// Tipos sidecar para product-slugs.mjs (catálogo puro en JS, compartido por el
// webhook y el schema de contenido). FUENTE ÚNICA de los slugs de producto.
export const SLUG_NIVEL: Record<string, { nivel: 2 | 3; expira: string | null }>;

/** Catálogo de slugs válidos (claves de SLUG_NIVEL) · tupla no-vacía para z.enum. */
export const PRODUCT_SLUGS: readonly [string, ...string[]];
