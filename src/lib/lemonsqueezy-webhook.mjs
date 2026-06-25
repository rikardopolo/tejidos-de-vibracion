/**
 * lemonsqueezy-webhook.mjs · Lógica PURA del webhook de Lemon Squeezy.
 * Verificación de firma (HMAC-SHA256 del raw body, timing-safe), mapeo
 * producto→nivel y parseo del evento de orden. Sin red, sin DB, sin env —
 * testeable con `node --test`. El efecto (Supabase) vive en el handler .ts.
 */
import crypto from 'node:crypto';

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

// Escalera de productos → nivel de acceso (+ expiración).
// acceso_expira_at = null → permanente (decisión Nivel 3 abierta en la Guía).
const SLUG_NIVEL = {
  'bundle-preventa': { nivel: 2, expira: null },
  'bundle-normal': { nivel: 2, expira: null },
  'acto-2': { nivel: 2, expira: null },
  'acto-3': { nivel: 2, expira: null },
  'libro-completo': { nivel: 3, expira: null },
  'libro-epub': { nivel: 3, expira: null },
  'upgrade-libro': { nivel: 3, expira: null },
};

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
