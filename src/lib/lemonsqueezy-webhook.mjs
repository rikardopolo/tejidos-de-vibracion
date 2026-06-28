/**
 * lemonsqueezy-webhook.mjs · Lógica PURA del webhook de Lemon Squeezy.
 * Verificación de firma (HMAC-SHA256 del raw body, timing-safe), mapeo
 * producto→nivel y parseo del evento de orden. Sin red, sin DB, sin env —
 * testeable con `node --test`. El efecto (Supabase) vive en el handler .ts.
 */
import crypto from 'node:crypto';
import { SLUG_NIVEL } from './product-slugs.mjs';

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

// SLUG_NIVEL (escalera producto→nivel) vive ahora en product-slugs.mjs · FUENTE
// ÚNICA compartida con el schema de contenido (config.ts). Ver ese módulo.

/**
 * Resuelve nivel/expiración desde el product_slug. Slug desconocido → null
 * (el handler decide el fallback y lo loguea).
 * @param {string|undefined|null} productSlug
 * @returns {{ nivel: 2|3, expira: string|null }|null}
 */
export function mapProductToNivel(productSlug) {
  if (!productSlug) return null;
  return SLUG_NIVEL[productSlug] ?? null;
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
    productSlug: str(custom.product_slug),
    amountCents: Number.isFinite(attr.total) ? attr.total : null,
    currency: typeof attr.currency === 'string' && attr.currency ? attr.currency : 'USD',
    status,
    testMode: attr.test_mode === true,
    eventName: ev,
  };
}
