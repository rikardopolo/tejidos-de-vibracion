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
 * Dominios propios de la tienda. Si mañana se cambia el dominio de la tienda en
 * Lemon Squeezy hay que añadirlo AQUÍ o el botón dejará de vender otra vez.
 */
export const HOSTS_TIENDA = Object.freeze(['tejidosdevibracion.store']);

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
