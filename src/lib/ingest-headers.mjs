/**
 * Qué cabeceras cruzan el reverse-proxy `/api/ingest` hacia PostHog, en las dos
 * direcciones. Vive aparte del route de Astro para poder testearlo con
 * `node --test`, igual que `gate-decision.mjs`: es un camino de credenciales y
 * merece una prueba que se ponga roja si alguien lo afloja.
 *
 * ─── POR QUÉ ALLOWLIST Y NO LISTA DE BLOQUEADAS ───────────────────────────
 * Antes esto era una denylist (cookie + authorization + hop-by-hop) y aun así
 * dejaba salir dos cosas:
 *
 *  · `referer` — la CSP del sitio fija `Referrer-Policy:
 *    strict-origin-when-cross-origin`, que en peticiones SAME-ORIGIN manda la
 *    URL COMPLETA con query. `/api/ingest` es same-origin, así que abrir
 *    `/acceso/<producto>?t=<token-de-compra>` (que renderiza layout y arranca
 *    PostHog) mandaba el token de compra en la cabecera.
 *  · `x-vercel-ip-latitude` / `-longitude` / `-postal-code` — geolocalización
 *    precisa que Vercel inyecta y que PostHog no pide.
 *
 * Una denylist obliga a acertar con una lista abierta y creciente; la allowlist
 * son tres nombres documentados y lo que no esté nace excluido. Mismo criterio
 * que el portal (`tejidos-de-realidad`, PR #246) y que `sentry.server.config.js`.
 */

/**
 * Lo único que PostHog necesita de la petición del navegador, según su propia
 * referencia de reverse-proxy: `Host` (lo pone el `fetch` al construir la URL
 * destino) y `X-Forwarded-For` para geolocalizar. `content-type` va porque sin
 * él el ingest no parsea el cuerpo del evento; `user-agent` porque la
 * clasificación de bots lo mira y el SDK ya lo repite en el cuerpo.
 */
export const CABECERAS_PERMITIDAS = new Set(['content-type', 'x-forwarded-for', 'user-agent']);

/**
 * Dirección contraria: lo que el upstream no puede colarnos. `set-cookie` es el
 * importante — PostHog está detrás de Cloudflare (`__cf_bm`, `_cfuvid`) y sin
 * esto plantaría cookies de un tercero en tejidosdevibracion.com como
 * first-party. El resto son hop-by-hop, más `content-length`/`content-encoding`:
 * el runtime descomprime el body pero conserva el header, y reenviar ambos hace
 * que el cliente intente descomprimir bytes ya descomprimidos.
 */
export const CABECERAS_RESPUESTA_BLOQUEADAS = new Set([
  'set-cookie',
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
  'content-length',
  'content-encoding',
]);

/** Cabeceras que SÍ salen hacia PostHog. Todo lo demás se queda en casa. */
export function filtrarPeticion(entrantes) {
  const salida = new Headers();
  entrantes.forEach((valor, nombre) => {
    if (CABECERAS_PERMITIDAS.has(nombre.toLowerCase())) salida.set(nombre, valor);
  });
  return salida;
}

/** Cabeceras del upstream que SÍ llegan al navegador. */
export function filtrarRespuesta(entrantes) {
  const salida = new Headers();
  entrantes.forEach((valor, nombre) => {
    if (!CABECERAS_RESPUESTA_BLOQUEADAS.has(nombre.toLowerCase())) salida.set(nombre, valor);
  });
  return salida;
}
