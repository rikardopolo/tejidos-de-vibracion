/**
 * Limpieza de tokens en las propiedades que PostHog compone por su cuenta.
 *
 * El fix de cabeceras (`ingest-headers.mjs`) cierra el canal `referer`, pero el
 * SDK mete la URL en el CUERPO del evento igualmente: `$current_url` en todos,
 * `$referrer` en el pageview siguiente, y los `$initial_*`, que además se
 * PERSISTEN. Abrir `/acceso/<producto>?t=<token-de-compra>` metía ese token en
 * el payload. Ninguna corrección de cabeceras alcanza ahí.
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
  var URLISH = ['$current_url', '$referrer', '$initial_current_url', '$initial_referrer'];
  if (!evento || !evento.properties) return evento;
  for (var i = 0; i < URLISH.length; i++) {
    var clave = URLISH[i];
    var valor = evento.properties[clave];
    if (typeof valor !== 'string' || valor.indexOf('?') === -1) continue;
    try {
      var u = new URL(valor);
      var tocado = false;
      for (var j = 0; j < SENSIBLES.length; j++) {
        if (u.searchParams.has(SENSIBLES[j])) {
          u.searchParams.set(SENSIBLES[j], 'REDACTED');
          tocado = true;
        }
      }
      if (tocado) evento.properties[clave] = u.toString();
    } catch (e) {
      // URL relativa o basura: si no se puede parsear, se corta por el '?' y
      // se pierde la query entera. Preferimos perder analítica a filtrar.
      evento.properties[clave] = valor.split('?')[0];
    }
  }
  return evento;
}
