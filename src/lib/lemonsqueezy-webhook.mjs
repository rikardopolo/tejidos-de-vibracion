/**
 * lemonsqueezy-webhook.mjs · Lógica PURA del webhook de Lemon Squeezy.
 * Verificación de firma (HMAC-SHA256 del raw body, timing-safe), mapeo
 * variante→producto→nivel, parseo del evento de orden y la DECISIÓN de qué hacer
 * con cada entrega (`decidirEntrega`). Sin red y sin DB; el entorno entra por
 * parámetro (solo `aceptarTestMode` cae a `process.env` si no se le pasa) —
 * testeable con `node --test`. El efecto (Supabase) vive en el handler .ts.
 */
import crypto from 'node:crypto';
import { SLUG_NIVEL, PRODUCT_SLUGS, SUBSCRIPTION_SLUGS } from './product-slugs.mjs';

/**
 * Verifica la firma del webhook LS: HMAC-SHA256 hex del raw body con el signing
 * secret, comparado en tiempo constante contra el header X-Signature.
 * @param {string} rawBody  el cuerpo EXACTO recibido (no reparseado)
 * @param {string|null|undefined} signatureHeader
 * @param {string} secret
 * @returns {boolean}
 */
export function verifyLemonSignature(rawBody, signatureHeader, secret) {
  if (!signatureHeader || !secret) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody, 'utf8').digest('hex');
  const a = Buffer.from(signatureHeader, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  if (a.length !== b.length) return false; // timingSafeEqual exige misma longitud
  return crypto.timingSafeEqual(a, b);
}

/**
 * Stable correlation key for telemetry. Raw provider order IDs stay in business data.
 * @param {string} lsOrderId
 * @returns {string}
 */
export function orderRef(lsOrderId) {
  return crypto.createHash('sha256').update(`lemonsqueezy\0${String(lsOrderId)}`, 'utf8').digest('hex');
}

// SLUG_NIVEL (escalera producto→nivel) vive ahora en product-slugs.mjs · FUENTE
// ÚNICA compartida con el schema de contenido (config.ts). Ver ese módulo.

/**
 * Resuelve nivel/expiración desde un slug del catálogo. Slug desconocido → null
 * (el handler decide el fallback y lo loguea). El slug sale del `variant_id`
 * (`buildVariantMap`) o de la fila ya guardada en `orders`, NUNCA de
 * `custom_data.product_slug`, que viaja en el checkout y no decide nada.
 * @param {string|undefined|null} productSlug
 * @returns {{ nivel: 2|3, expira: string|null }|null}
 */
export function mapProductToNivel(productSlug) {
  if (!productSlug) return null;
  return SLUG_NIVEL[productSlug] ?? null;
}

// ─── Variante → producto ───────────────────────────────────────────────────
// El producto (y con él el nivel) sale de `first_order_item.variant_id`, que fija
// Lemon Squeezy, y no de `custom_data.product_slug`, que viaja en el checkout.
// Convención de nombres (la misma que ya usa el checkout de la preventa):
//   slug `bundle-preventa` → variable `LS_VARIANT_BUNDLE_PREVENTA` = id de la variante.
// Toda variable que empiece por `LS_VARIANT_SUSCRIPCION` es una variante de
// SUSCRIPCIÓN, y el camino de órdenes la ignora (se resuelve en su tabla, S-13).

export const PREFIJO_VARIANTE = 'LS_VARIANT_';
export const PREFIJO_VARIANTE_SUSCRIPCION = 'LS_VARIANT_SUSCRIPCION';

/**
 * Nombre de la variable de entorno con el id de variante de un slug.
 * @param {string} slug  p. ej. 'bundle-preventa'
 * @returns {string}     p. ej. 'LS_VARIANT_BUNDLE_PREVENTA'
 */
export function envVarDeVariante(slug) {
  return PREFIJO_VARIANTE + String(slug).toUpperCase().replace(/-/g, '_');
}

/**
 * Construye el mapa variant_id → slug desde el entorno (función pura: el entorno
 * entra por parámetro).
 *
 * Falla CERRADO ante una configuración ambigua: si dos slugs apuntan a la misma
 * variante, esa variante no se mapea (cae en `order_unknown_product`) y se
 * devuelve en `ambiguas` para que el handler lo grite. Una variante que además
 * figure como de suscripción nunca se trata como pago único.
 *
 * @param {Record<string, string|undefined>|null|undefined} env
 * @returns {{ unica: Map<string, string>, suscripcion: Set<string>, ambiguas: string[] }}
 */
export function buildVariantMap(env) {
  const src = env ?? {};
  const valor = (k) => {
    const v = src[k];
    return typeof v === 'string' && v.trim() !== '' ? v.trim() : null;
  };

  const suscripcion = new Set();
  for (const k of Object.keys(src)) {
    if (!k.startsWith(PREFIJO_VARIANTE_SUSCRIPCION)) continue;
    const v = valor(k);
    if (v) suscripcion.add(v);
  }

  const unica = new Map();
  const ambiguas = new Set();
  for (const slug of PRODUCT_SLUGS) {
    if (SUBSCRIPTION_SLUGS.includes(slug)) continue;
    const v = valor(envVarDeVariante(slug));
    if (!v) continue;
    if (unica.has(v) && unica.get(v) !== slug) ambiguas.add(v);
    else unica.set(v, slug);
  }
  for (const v of ambiguas) unica.delete(v);
  for (const v of suscripcion) unica.delete(v);

  return { unica, suscripcion, ambiguas: [...ambiguas] };
}

/**
 * ¿Se procesan los eventos de Test Mode? Solo con `LS_ACEPTAR_TEST_MODE=true`,
 * que existe únicamente en Preview (C13). En producción (`VERCEL_ENV=production`)
 * es `false` aunque la variable esté puesta por error: las 16 órdenes de
 * producción ya son de prueba y no deben repetirse.
 * Se lee en cada llamada (interruptor de runtime, sin rebuild).
 * @param {Record<string, string|undefined>} [env]
 * @returns {boolean}
 */
export function aceptarTestMode(env = typeof process !== 'undefined' && process.env ? process.env : {}) {
  if (String(env?.VERCEL_ENV ?? '').trim() === 'production') return false;
  return String(env?.LS_ACEPTAR_TEST_MODE ?? '').trim() === 'true';
}

/**
 * Test Mode de Lemon Squeezy: `meta.test_mode` (todos los eventos) o el atributo
 * `test_mode` del objeto (órdenes y suscripciones). Basta con uno.
 * @param {any} body
 * @returns {boolean}
 */
export function esTestMode(body) {
  return body?.meta?.test_mode === true || body?.data?.attributes?.test_mode === true;
}

/**
 * Clasifica una orden ya parseada contra el mapa de variantes.
 *
 * - `suscripcion`: variante de suscripción o `custom_data.product_slug` de
 *   suscripción. El custom solo puede QUITAR (ignorar la orden), nunca otorgar.
 * - `desconocida`: sin `variant_id` o con una variante que no está en el mapa.
 * - `unica`: pago único con su slug y su nivel.
 *
 * @param {{ variantId: string|null, productSlug: string|null }} parsed
 * @param {{ unica: Map<string, string>, suscripcion: Set<string> }} variantes
 * @returns {{ tipo: 'suscripcion' } | { tipo: 'desconocida' } | { tipo: 'unica', slug: string, nivel: 2|3, expira: string|null }}
 */
export function clasificarOrden(parsed, variantes) {
  const variantId = parsed.variantId;
  if ((variantId && variantes.suscripcion.has(variantId)) || SUBSCRIPTION_SLUGS.includes(parsed.productSlug ?? '')) {
    return { tipo: 'suscripcion' };
  }
  const slug = variantId ? variantes.unica.get(variantId) : undefined;
  const info = slug ? mapProductToNivel(slug) : null;
  if (!slug || !info) return { tipo: 'desconocida' };
  return { tipo: 'unica', slug, nivel: info.nivel, expira: info.expira };
}

/**
 * Decide QUÉ hacer con una entrega del webhook, sin efectos. El handler .ts solo
 * ejecuta la decisión (escribir `orders`/`events`, enviar el enlace). Orden:
 *
 *   1. firma inválida               → `firma_invalida` (401)
 *   2. cuerpo que no es JSON        → `json_invalido` (400)
 *   3. Test Mode sin aceptarlo      → `test_mode_ignorado` (200, solo el evento)
 *   4. evento que no es de orden    → `evento_ignorado` (200)
 *   5. orden de suscripción         → `suscripcion_ignorada` (200, evento; sin orden ni token)
 *   6. reembolso PARCIAL            → `reembolso_parcial` (200, evento; NO revoca · decisión de Ricardo)
 *   7. variante desconocida         → `producto_desconocido` (camino `order_unknown_product`)
 *   8. pago único conocido          → `procesar`
 *
 * @param {{ raw: string, signature: string|null|undefined, secret: string,
 *           eventName?: string|null, variantes: { unica: Map<string, string>, suscripcion: Set<string> },
 *           aceptarTestMode: boolean }} input
 */
export function decidirEntrega(input) {
  if (!verifyLemonSignature(input.raw, input.signature, input.secret)) return { accion: 'firma_invalida' };

  let body;
  try {
    body = JSON.parse(input.raw);
  } catch {
    return { accion: 'json_invalido' };
  }

  // El nombre FIRMADO (`meta.event_name`, dentro del cuerpo) manda sobre la
  // cabecera `X-Event-Name`, que la firma no cubre: con un cuerpo firmado de
  // `order_created` y la cabecera cambiada a `order_refunded`, una repetición
  // revocaría una compra legítima. La cabecera solo es respaldo si el cuerpo no
  // trae el nombre.
  const nombreFirmado = typeof body?.meta?.event_name === 'string' ? body.meta.event_name : '';
  const eventName = nombreFirmado || input.eventName || null;

  if (esTestMode(body) && !input.aceptarTestMode) {
    const id = body?.data?.id;
    return { accion: 'test_mode_ignorado', body, eventName, lsOrderId: id != null ? String(id) : null };
  }

  const parsed = parseOrderEvent(body, eventName ?? undefined);
  if (!parsed) return { accion: 'evento_ignorado', body, eventName };

  const clase = clasificarOrden(parsed, input.variantes);
  if (clase.tipo === 'suscripcion') return { accion: 'suscripcion_ignorada', body, parsed };

  if (parsed.status === 'refunded' && parsed.orderStatus === 'partial_refund') {
    return { accion: 'reembolso_parcial', body, parsed };
  }

  if (clase.tipo === 'desconocida') return { accion: 'producto_desconocido', body, parsed };

  return {
    accion: 'procesar',
    body,
    parsed,
    producto: { slug: clase.slug, nivel: clase.nivel, expira: clase.expira },
  };
}

// Eventos de orden de LS que manejamos → status que registramos.
const ORDER_EVENTS = {
  order_created: 'paid',
  order_refunded: 'refunded',
};

/**
 * Persiste la orden de forma IDEMPOTENTE-ATÓMICA y decide si es la PRIMERA vez que
 * se procesa este evento (para correr los efectos: events, tags Brevo, email) — sin
 * un SELECT previo (check-then-act), que con entregas concurrentes del mismo
 * ls_order_id duplicaría los efectos.
 *
 * - paid: upsert con ignoreDuplicates + select('id'). La BD inserta SOLO si la fila
 *   no existía (UNIQUE(ls_order_id)); `data.length>0` ⇒ primera entrega. Reintentos
 *   o concurrencia chocan con el UNIQUE, no insertan, devuelven [] ⇒ no efecto.
 * - refunded: update({status:'refunded',...}) WHERE ls_order_id=X AND status<>'refunded'
 *   RETURNING id. Devuelve fila SOLO en la primera transición a refunded. Si afecta 0
 *   filas (ya refunded ⇒ reintento, o no existe order previo ⇒ refund-huérfano) cae a
 *   un upsert ignoreDuplicates para distinguir "huérfano nuevo" de "ya procesado".
 *
 * Lógica de DB pura (recibe el cliente por parámetro); testeable con un mock que
 * replique las semánticas atómicas de Postgres. El efecto de red real vive en el
 * cliente supabase que se le inyecta.
 *
 * @param {{ from: (t: string) => any }} supabase  cliente supabase-js (o mock)
 * @param {{ lsOrderId: string, status: 'paid'|'refunded' }} parsed
 * @param {Record<string, unknown>} row  fila a persistir (mismas columnas que orders)
 * @returns {Promise<{ isFirstEffect: boolean, error: { message: string }|null }>}
 */
export async function persistOrderAtomic(supabase, parsed, row) {
  if (parsed.status === 'refunded') {
    // Idempotente por la TRANSICIÓN a 'refunded' (el order suele existir del paid).
    const { data: transitioned, error: updErr } = await supabase
      .from('orders')
      .update({ status: 'refunded', raw: row.raw, lead_id: row.lead_id })
      .eq('ls_order_id', parsed.lsOrderId)
      .neq('status', 'refunded')
      .select('id');
    if (updErr) return { isFirstEffect: false, error: updErr };
    if (transitioned && transitioned.length > 0) return { isFirstEffect: true, error: null };
    // 0 filas: o ya 'refunded' (reintento), o refund sin paid previo (huérfano).
    const { data: inserted, error: insErr } = await supabase
      .from('orders')
      .upsert(row, { onConflict: 'ls_order_id', ignoreDuplicates: true })
      .select('id');
    if (insErr) return { isFirstEffect: false, error: insErr };
    return { isFirstEffect: !!inserted && inserted.length > 0, error: null };
  }
  // paid: insert-if-new atómico.
  const { data: inserted, error: insErr } = await supabase
    .from('orders')
    .upsert(row, { onConflict: 'ls_order_id', ignoreDuplicates: true })
    .select('id');
  if (insErr) return { isFirstEffect: false, error: insErr };
  return { isFirstEffect: !!inserted && inserted.length > 0, error: null };
}

/**
 * Reclama el derecho a enviar el email de acceso de una orden, de forma ATÓMICA.
 *
 * Por qué existe: la entrega colgaba de `isFirstEffect`, así que si el email
 * fallaba se devolvía 500 para que LS reintentara — pero en el reintento el
 * upsert ya no insertaba nada, `isFirstEffect` era false y el email NO se
 * reenviaba jamás. Resultado posible: compra pagada, fila correcta, comprador
 * sin enlace.
 *
 * El candado es la transición única sobre `acceso_enviado_at`, el mismo patrón
 * que ya usa el refund con `.neq('status', 'refunded')`: solo envía quien gana
 * la carrera, y el resto ve 0 filas afectadas.
 *
 * @returns {Promise<{claimed: boolean, error: any}>}
 */
export async function claimAccesoEnvio(supabase, lsOrderId) {
  const { data, error } = await supabase
    .from('orders')
    .update({ acceso_enviado_at: new Date().toISOString() })
    .eq('ls_order_id', lsOrderId)
    // Solo una orden VIVA entrega acceso. Sin este filtro, un `order_created`
    // reprocesado DESPUÉS de un reembolso reclamaría y emitiría un token nuevo de
    // 365 días sobre una compra ya devuelta. Antes lo impedía `isFirstEffect` por
    // accidente (la fila ya existía); al quitarlo hay que decirlo explícitamente.
    // Consulta el estado PERSISTIDO, no el derivado del nombre del evento, así que
    // cubre también las entregas fuera de orden y los resend de órdenes viejas.
    .eq('status', 'paid')
    .is('acceso_enviado_at', null)
    .select('id');
  if (error) return { claimed: false, error };
  return { claimed: !!data && data.length > 0, error: null };
}

/**
 * Devuelve el derecho a enviar cuando el email falló, para que el reintento de
 * LS pueda intentarlo de nuevo.
 *
 * Sin esto, reclamar antes de enviar reproduciría el defecto original con otro
 * nombre: el primer intento se quedaría la marca y el reintento la vería tomada.
 * Si esta liberación falla, degradamos exactamente al comportamiento anterior
 * (no se reenvía) — nunca a algo peor.
 */
export async function releaseAccesoEnvio(supabase, lsOrderId) {
  const { error } = await supabase
    .from('orders')
    .update({ acceso_enviado_at: null })
    .eq('ls_order_id', lsOrderId)
    .select('id');
  return { error: error ?? null };
}

/**
 * Normaliza el payload del webhook de orden de LS a un registro para `orders`.
 * Devuelve null si el evento no es una orden que manejemos.
 * @param {any} body  payload JSON del webhook
 * @param {string|undefined} eventName  header X-Event-Name (fallback: meta.event_name)
 * @returns {object|null}
 */
export function parseOrderEvent(body, eventName) {
  const ev = eventName || body?.meta?.event_name;
  const status = ORDER_EVENTS[ev];
  if (!status) return null;

  const data = body?.data;
  const attr = data?.attributes ?? {};
  const custom = body?.meta?.custom_data ?? {};

  const lsOrderId = data?.id != null ? String(data.id) : null;
  if (!lsOrderId) return null;

  const str = (v) => (v != null && String(v) !== '' ? String(v) : null);

  return {
    lsOrderId,
    lsOrderIdentifier: str(attr.identifier) ?? str(attr.order_number),
    email: typeof attr.user_email === 'string' ? attr.user_email.toLowerCase().trim() : null,
    userName: typeof attr.user_name === 'string' && attr.user_name.trim() ? attr.user_name.trim() : null,
    leadId: str(custom.lead_id),
    // Solo INFORMATIVO (log/evento): viaja en el checkout y no decide el nivel.
    productSlug: str(custom.product_slug),
    // En una orden, `variant_id` solo está en `first_order_item` (doc LS).
    variantId: str(attr.first_order_item?.variant_id),
    // Estado del objeto Order de LS (`paid`, `refunded`, `partial_refund`, …).
    orderStatus: str(attr.status),
    amountCents: Number.isFinite(attr.total) ? attr.total : null,
    refundedAmountCents: Number.isFinite(attr.refunded_amount) ? attr.refunded_amount : null,
    currency: typeof attr.currency === 'string' && attr.currency ? attr.currency : 'USD',
    status,
    testMode: esTestMode(body),
    eventName: ev,
  };
}
