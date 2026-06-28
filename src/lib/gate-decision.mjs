/**
 * gate-decision.mjs · Decisión PURA de acceso (gating data-driven).
 *
 * Separada de gating.ts (que toca cookies/env y tipos de Astro) para poder
 * testearla con `node --test` sin deps, igual que purchase-token.mjs. gating.ts
 * la re-exporta como `puedeAcceder`, así el runtime y los tests comparten la
 * MISMA fuente y no hay drift.
 *
 * Regla del dinero (correcta en ambos sentidos):
 *   - acceso.nivel debe cubrir nivelRequerido (sin cap en 1 · permite 2 y 3), Y
 *   - si la pieza pertenece a un producto (slugRequerido presente), el scope
 *     del token de compra (acceso.slugs) debe incluir ese slug.
 *
 * Contenido gratis/registrado (nivelRequerido 0/1, sin slugRequerido) no se ve
 * afectado por la regla de scope → no-regresión.
 */

/**
 * @param {{ nivel: 0|1|2|3, slugs: string[] }} acceso  Nivel + scope del token.
 * @param {0|1|2|3} nivelRequerido  Nivel mínimo que exige la pieza.
 * @param {string|null|undefined} [slugRequerido]  Slug de producto de pago, si aplica.
 * @returns {boolean}
 */
export function puedeAcceder(acceso, nivelRequerido, slugRequerido) {
  if (acceso.nivel < nivelRequerido) return false;
  if (slugRequerido) return Array.isArray(acceso.slugs) && acceso.slugs.includes(slugRequerido);
  return true;
}
