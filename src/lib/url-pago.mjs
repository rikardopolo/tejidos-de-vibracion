// url-pago.mjs · ¿esta URL es un checkout legítimo al que podemos mandar a alguien?
//
// Defensa en profundidad contra una redirección abierta: si la respuesta del
// proveedor viniera contaminada, no queremos navegar a donde diga.
//
// 🔴 Esta comprobación vivía SOLO en `public/comprar-checkout.js`, con la lista
// escrita como `/^https:\/\/[a-z0-9-]+\.lemonsqueezy\.com\//`. Lemon Squeezy
// emite los checkouts de esta tienda en su DOMINIO PROPIO
// (`tejidosdevibracion.store`), que esa expresión no acepta: el botón llevaba
// semanas rechazando su propio checkout y enseñando «No se pudo abrir el pago»
// a TODAS las personas que pulsaban Comprar. Nadie lo vio porque en `public/`
// no hay tests y el fallo era indistinguible de una caída del proveedor.
//
// Por eso vive aquí: `node --test` corre sobre `src/lib/*.test.mjs`. Una lista
// de dominios sin test es una lista que caduca en silencio.

/**
 * Hosts a los que estamos dispuestos a mandar a un comprador.
 *
 * - `tejidosdevibracion.store` · dominio propio de la tienda en Lemon Squeezy.
 * - `buy.stripe.com` · enlaces de pago de Stripe (Managed Payments). Es el
 *   MISMO host en prueba y en real: solo cambia la ruta (`/test_…`). Esa es la
 *   diferencia con Lemon Squeezy, donde el dominio de la tienda fue la sorpresa.
 *
 * Si se cambia de proveedor o de dominio hay que añadirlo AQUÍ o el botón
 * dejará de vender otra vez.
 */
export const HOSTS_TIENDA = Object.freeze(['tejidosdevibracion.store', 'buy.stripe.com']);

/** Subdominios de Lemon Squeezy (`<tienda>.lemonsqueezy.com`). */
const LS = /(^|\.)lemonsqueezy\.com$/i;

/**
 * @param {unknown} url
 * @returns {boolean} true solo si es https y el host es de la tienda o de LS.
 */
export function esUrlDePago(url) {
  if (typeof url !== 'string') return false;
  let u;
  try {
    u = new URL(url);
  } catch {
    return false;
  }
  if (u.protocol !== 'https:') return false;
  // `host` (no `hostname`) a propósito: con puerto explícito no coincide, que es
  // lo que queremos — un checkout real nunca lleva puerto.
  return HOSTS_TIENDA.includes(u.host.toLowerCase()) || LS.test(u.host);
}

/**
 * ¿Es un enlace de pago del ENTORNO DE PRUEBA de Stripe?
 *
 * Un enlace de prueba en producción no da ningún error: abre un checkout
 * perfecto, acepta la tarjeta 4242 y no mueve un céntimo. El fallo se parece
 * exactamente al éxito, que es la forma de romperse que más caro sale aquí
 * (mismo patrón que la allowlist que rechazaba su propio checkout).
 *
 * Stripe los distingue en la ruta: `buy.stripe.com/test_…` contra
 * `buy.stripe.com/…`.
 *
 * @param {unknown} url
 * @returns {boolean}
 */
export function esEnlaceDePruebaStripe(url) {
  if (!esUrlDePago(url)) return false;
  const u = new URL(/** @type {string} */ (url));
  return u.host.toLowerCase() === 'buy.stripe.com' && u.pathname.startsWith('/test_');
}
