// utm.mjs · saneado de la atribución que llega con un alta.
//
// El puente `/r/<pieza>` sella cuatro UTMs en la URL de destino, pero hasta hoy el alta
// no guardaba ninguna: las 7 altas de `libro` traen país, región y `endpoint`, y CERO
// `utm_campaign` (medido contra producción el 14-sep-2026). Sin esto no se puede
// responder «qué pieza trae lectores», que es la única pregunta que justifica publicar
// 117 piezas — y tampoco se puede saber si la Obertura funciona mejor que el capítulo.
//
// 🔴 Lo que entra aquí viene del NAVEGADOR, vía sessionStorage: es entrada no fiable y
// acaba en una columna `jsonb`, que se traga cualquier cosa. Lista blanca de claves,
// solo cadenas, recorte a 120 caracteres. Nada de volcar el objeto tal cual.
//
// Vive aquí y no dentro del endpoint porque los tests del repo corren `node --test`
// sobre `src/lib/*.test.mjs`: en `pages/api/*.ts` no se pueden probar.

/** Las cinco UTMs estándar. Cualquier otra clave se descarta en silencio. */
export const CAMPOS_UTM = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'];

/** Tope por valor. Una campaña real ronda los 20 caracteres; 120 es holgura, no permiso. */
export const MAX_LARGO_UTM = 120;

/**
 * Devuelve un objeto solo con las UTMs reconocidas, o `null` si no hay ninguna válida.
 *
 * `null` es significativo: dice «llegó sin atribución» (directo, buscador, o storage
 * bloqueado), que es distinto de «no lo estábamos guardando». Esa distinción es
 * justamente la que faltaba hasta hoy.
 */
export function utmsSaneadas(crudo) {
  if (!crudo || typeof crudo !== 'object' || Array.isArray(crudo)) return null;
  const limpio = {};
  for (const campo of CAMPOS_UTM) {
    const v = crudo[campo];
    // Solo cadenas: un número, un objeto anidado o un array no son una UTM.
    if (typeof v !== 'string') continue;
    const podado = v.trim();
    if (podado) limpio[campo] = podado.slice(0, MAX_LARGO_UTM);
  }
  return Object.keys(limpio).length ? limpio : null;
}
