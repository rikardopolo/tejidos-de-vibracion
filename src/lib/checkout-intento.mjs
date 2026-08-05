// checkout-intento.mjs · deja constancia de CADA intento de compra y de cómo terminó.
//
// Antes de esto el endpoint de checkout no registraba nada en ningún sitio: la
// única señal de que alguien había pulsado «Comprar» eran los logs de Vercel,
// que no se pueden consultar ni agregar. Con el tráfico entrando a un checkout
// que aún no vende, «cuánta gente lo intentó» es el número que más falta hace —
// y era el único que no se guardaba. Un cero en `orders` no distingue «nadie
// quiso» de «todos chocaron contra la puerta cerrada».
//
// Vive aquí y no dentro del endpoint porque los tests del repo corren
// `node --test` sobre `src/lib/*.test.mjs`: en `pages/api/*.ts` no se pueden
// probar.
//
// ── La consulta que responde «¿cuánta gente lo intentó?» ────────────────────
//
//   select date_trunc('day', created_at)::date as dia,
//          metadata->>'desenlace' as desenlace,
//          count(*) as n
//   from events
//   where type = 'checkout_intento'
//     and metadata->>'desenlace' <> 'honeypot'   -- bots fuera
//   group by 1, 2
//   order by 1 desc, 3 desc;
//
// Y el embudo de un vistazo — intentos contra compras cerradas:
//
//   select
//     (select count(*) from events
//       where type='checkout_intento' and metadata->>'desenlace'='checkout_creado') as checkouts_abiertos,
//     (select count(*) from orders where not test_mode) as compras_reales;
//
// Si `checkouts_abiertos` es alto y `compras_reales` cero, el problema está
// entre Lemon Squeezy y el comprador, no en el contenido ni en el tráfico.

/**
 * Desenlaces posibles. Se nombran por lo que le pasó a la PERSONA, no por el
 * código HTTP, para que una consulta agregada se lea sin descifrar nada.
 * @typedef {'checkout_creado'|'rechazado_formato'|'rechazado_datos'|'honeypot'
 *   |'limitado_por_ritmo'|'mal_configurado'|'error_proveedor'} Desenlace
 */

export const TIPO_EVENTO = 'checkout_intento';
export const ORIGEN_EVENTO = 'checkout/bundle-preventa';

/** Los desenlaces que cuentan como intento de una PERSONA real. */
export const DESENLACES_HUMANOS = Object.freeze([
  'checkout_creado',
  'rechazado_datos',
  'limitado_por_ritmo',
  'mal_configurado',
  'error_proveedor',
]);

/**
 * Claves que NUNCA pueden acabar en `metadata`. El correo es opcional en el
 * checkout y aquí no se guarda: solo si venía o no. El interés es contar
 * intentos, no perfilar a nadie — y un evento de analítica es justo el sitio
 * donde un dato personal se queda para siempre sin que nadie lo revise.
 */
const PROHIBIDAS = Object.freeze(['correo', 'email', 'nombre', 'ip', 'telefono', 'website']);

/**
 * Construye el `metadata` del evento. Puro y sin dependencias, para poder
 * comprobar en un test que no se cuela ningún dato personal.
 *
 * @param {Desenlace} desenlace
 * @param {Record<string, unknown>} [extra]
 * @param {string} [producto]
 * @returns {Record<string, unknown>}
 */
export function construyeMetadata(desenlace, extra = {}, producto = 'bundle-preventa') {
  /** @type {Record<string, unknown>} */
  const limpio = {};
  for (const [k, v] of Object.entries(extra)) {
    if (PROHIBIDAS.includes(k.toLowerCase())) continue;
    limpio[k] = v;
  }
  return { producto, desenlace, ...limpio };
}

/**
 * Inserta el evento. **Nunca lanza**: si la base no responde, el intento se
 * pierde pero la compra sigue su curso. Registrar no puede ser la razón de que
 * alguien no pueda comprar.
 *
 * `lead_id` va dentro de `metadata`, no en la columna: la columna es una FK a
 * `leads`, y un identificador inventado en el cuerpo de la petición haría
 * fallar el INSERT entero — perderíamos el evento justo en el caso raro. Como
 * dato suelto conserva la trazabilidad sin poder romper nada.
 *
 * @param {{ from: (t: string) => { insert: (row: unknown) => Promise<{ error?: { message?: string } | null }> } } | null} supabase
 * @param {Desenlace} desenlace
 * @param {Record<string, unknown>} [extra]
 * @returns {Promise<boolean>} true si quedó registrado
 */
export async function registraIntento(supabase, desenlace, extra = {}) {
  if (!supabase) return false;
  try {
    const { error } = await supabase.from('events').insert({
      lead_id: null,
      type: TIPO_EVENTO,
      source: ORIGEN_EVENTO,
      metadata: construyeMetadata(desenlace, extra),
    });
    if (error) {
      console.error('[checkout/intento] no se registró:', error.message ?? error);
      return false;
    }
    return true;
  } catch (err) {
    console.error('[checkout/intento] no se registró:', err);
    return false;
  }
}
