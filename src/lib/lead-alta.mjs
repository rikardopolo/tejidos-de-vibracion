/**
 * lead-alta.mjs · Qué columnas de `leads` puede escribir un alta del libro.
 *
 * El POST de /api/leads/libro NO está confirmado: cualquiera puede mandar el
 * correo de otra persona. La doble confirmación (DOI) llega después, en
 * /bienvenido. Por eso, sobre una fila que YA existe, el alta no toca:
 *   - `name`: es el saludo de las cartas; un tercero podría reescribirlo;
 *   - `unsubscribed_at`: una baja no se deshace sin la doble confirmación
 *     (Ley 1581). Antes el alta lo ponía en null y resuscribía a quien se dio
 *     de baja con solo escribir su correo en el formulario.
 * Sobre una fila existente, lo único que el alta provoca es el reenvío del DOI.
 * Tampoco reescribe `email`: es la clave del cruce (citext) y conservar la grafía
 * original evita que un tercero la cambie.
 *
 * Lógica pura, testeable con `node --test`.
 */

/** Columnas que un alta sin confirmar no puede cambiar en una fila existente. */
export const CAMPOS_PROTEGIDOS = Object.freeze(['email', 'name', 'unsubscribed_at']);

/**
 * @param {Record<string, unknown>} fila  la fila completa del alta, como si fuera nueva
 * @param {{ existe: boolean }} ctx      ¿ya había una fila con ese correo?
 * @returns {Record<string, unknown>}    las columnas a escribir (copia nueva)
 */
export function camposDeAlta(fila, ctx) {
  const out = { ...fila };
  if (!ctx.existe) return out;
  for (const campo of CAMPOS_PROTEGIDOS) delete out[campo];
  return out;
}
