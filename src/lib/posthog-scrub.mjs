/**
 * Limpieza de tokens en las propiedades que PostHog compone por su cuenta.
 *
 * El fix de cabeceras (`ingest-headers.mjs`) cierra el canal `referer`, pero el
 * SDK mete la URL en el CUERPO del evento igualmente: `$current_url`,
 * `$referrer`, los `$initial_*` y `$session_entry_url` — varias de ellas
 * PERSISTEN toda la sesión. Abrir `/acceso/<producto>?t=<token-de-compra>`
 * metía ese token en el payload. Ninguna corrección de cabeceras alcanza ahí.
 *
 * La lista de parámetros es la MISMA que el portal ya aplica a Sentry
 * (`sentry.server.config.js`), donde `t` está anotado como «magic-link de cuenta
 * / purchase-token». Un solo criterio para los dos terceros.
 *
 * ─── 🔴 RESTRICCIÓN QUE PARECE UN DETALLE Y NO LO ES ──────────────────────
 * `limpiarEvento` se serializa con `.toString()` dentro del snippet que sirve
 * `/posthog-init.js` — el navegador recibe su TEXTO, no este módulo. Por eso
 * tiene que ser **autocontenida**: nada de constantes de módulo, imports ni
 * closures, o la copia serializada se rompe con un ReferenceError en cliente y
 * PostHog deja de mandar eventos en silencio. El test lo comprueba
 * serializándola y evaluándola, no solo llamándola.
 */

/**
 * Quita los parámetros que transportan credenciales de toda propiedad que
 * parezca una URL. Devuelve el evento (contrato de `before_send`: devolver algo
 * falsy lo descartaría).
 */
export function limpiarEvento(evento) {
  var SENSIBLES = ['t', 'token', 'code', 'access_token', 'session'];
  if (!evento || !evento.properties) return evento;
  // Se recorren TODAS las propiedades, no una lista de nombres conocidos. La
  // primera versión enumeraba cuatro (`$current_url`, `$referrer` y los dos
  // `$initial_*`) y PostHog tenía una quinta, `$session_entry_url`, que se
  // persiste durante toda la sesión: el token salía igual. Enumerar nombres es
  // una denylist disfrazada y falla por omisión, igual que falló en el proxy.
  for (var clave in evento.properties) {
    var valor = evento.properties[clave];
    if (typeof valor !== 'string' || valor.indexOf('?') === -1) continue;
    // Solo se tocan URLs absolutas y rutas. Un texto libre con interrogación
    // («¿y ahora qué?») no es asunto nuestro y debe salir intacto.
    var absoluta = valor.indexOf('https://') === 0 || valor.indexOf('http://') === 0;
    if (!absoluta && valor.charAt(0) !== '/') continue;
    try {
      // La base solo sirve para poder parsear rutas relativas; nunca se emite.
      var u = new URL(valor, 'https://base.invalid');
      var tocado = false;
      for (var j = 0; j < SENSIBLES.length; j++) {
        if (u.searchParams.has(SENSIBLES[j])) {
          u.searchParams.set(SENSIBLES[j], 'REDACTED');
          tocado = true;
        }
      }
      if (tocado) {
        evento.properties[clave] = absoluta ? u.toString() : u.pathname + u.search + u.hash;
      }
    } catch (e) {
      // Si ni con base se puede parsear, se corta por el '?': preferimos perder
      // analítica a filtrar un token.
      evento.properties[clave] = valor.split('?')[0];
    }
  }
  return evento;
}
