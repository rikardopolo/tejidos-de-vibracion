/**
 * product-slugs.mjs · FUENTE ÚNICA del catálogo de slugs de producto de pago.
 *
 * Antes el catálogo vivía SOLO en `SLUG_NIVEL` (lemonsqueezy-webhook.mjs) y el
 * schema de contenido (`config.ts`) tipaba `productoSlug` como string libre. Eran
 * dos fuentes independientes: un slug en el frontmatter de un MDX que no
 * coincidiera con el catálogo pasaba el build en silencio y luego el gate NEGABA
 * acceso a un comprador legítimo (el comprador paga, `puedeAcceder` exige el slug
 * en el token y nunca coincide). Ahora ambos lados (webhook + schema) importan de
 * AQUÍ, así un desalineo CODE-side falla ruidoso (enum del schema + test).
 *
 * `SLUG_NIVEL` mapea cada slug → nivel/expiración. `PRODUCT_SLUGS` = sus claves,
 * el catálogo que consume el `z.enum(...)` del schema. Sin red, sin DB, sin env.
 */

// Escalera de productos → nivel de acceso (+ expiración).
// acceso_expira_at = null → permanente (decisión Nivel 3 abierta en la Guía).
export const SLUG_NIVEL = {
  'bundle-preventa': { nivel: 2, expira: null },
  'bundle-normal': { nivel: 2, expira: null },
  'acto-2': { nivel: 2, expira: null },
  'acto-3': { nivel: 2, expira: null },
  'libro-completo': { nivel: 3, expira: null },
  'libro-epub': { nivel: 3, expira: null },
  'upgrade-libro': { nivel: 3, expira: null },
  // Suscripción al libro (F2, 18-sep-2026): nivel 2 mientras se publica. `expira` NO
  // es una fecha: la caducidad la decide la fila de `subscriptions` (status, ends_at,
  // current_period_end) en cada petición —subscription-gate.mjs—, nunca el token ni
  // `orders.acceso_expira_at`. Este slug no pasa por el webhook de orden de LS.
  'suscripcion-libro': { nivel: 2, expira: null }, // ponytail: null a propósito — la caducidad vive en subscriptions y la lee el gate por account_id (acceso-cuenta.mjs); un valor no-fecha aquí rompería el webhook de órdenes de LS (acceso_expira_at es timestamptz)
};

/**
 * Catálogo de slugs válidos (claves de SLUG_NIVEL). Tipado como tupla no-vacía
 * para que `z.enum(PRODUCT_SLUGS)` lo acepte directamente en el schema.
 * @type {readonly [string, ...string[]]}
 */
export const PRODUCT_SLUGS = /** @type {[string, ...string[]]} */ (Object.keys(SLUG_NIVEL));

/**
 * Slugs de SUSCRIPCIÓN: el camino de órdenes (`order_created`/`order_refunded`) los
 * ignora siempre. Lemon Squeezy manda un `order_created` junto a cada
 * `subscription_created`, con el mismo `custom_data`; si ese evento llegara a
 * `SLUG_NIVEL`, crearía una orden `one-time` y un token de 365 días que no se
 * enteran de la cancelación. La suscripción la resuelve su propia tabla (S-13:
 * `subscription_*` del webhook + `acceso-cuenta.mjs`).
 * @type {readonly string[]}
 */
export const SUBSCRIPTION_SLUGS = Object.freeze(['suscripcion-libro']);
