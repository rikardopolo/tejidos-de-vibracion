/**
 * lemonsqueezy-webhook.mjs · Lógica PURA del webhook de Lemon Squeezy.
 * Verificación de firma (HMAC-SHA256 del raw body, timing-safe), mapeo
 * variante→producto→nivel, parseo del evento de orden y la DECISIÓN de qué hacer
 * con cada entrega (`decidirEntrega`). Sin red y sin DB; el entorno entra por
 * parámetro (solo `aceptarTestMode` cae a `process.env` si no se le pasa) —
 * testeable con `node --test`. El efecto (Supabase) vive en el handler .ts.
 *
 * S-13 · eventos `subscription_{created,updated,cancelled,resumed,expired,paused,
 * unpaused}` → tabla `subscriptions` (`parseSubscriptionEvent` + `procesarSuscripcion`,
 * que recibe el cliente por parámetro). Los `subscription_payment_*` (facturas,
 * impagos y reembolsos de suscripción) siguen IGNORADOS con 200: quedan fuera de S-13
 * y deben estar antes de la primera renovación (F3-L, plan de medios de pago).
 */
import crypto from 'node:crypto';
import { SLUG_NIVEL, PRODUCT_SLUGS, SUBSCRIPTION_SLUGS } from './product-slugs.mjs';
import { secretoCustomValido, verificarCustom } from './custom-suscripcion.mjs';

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
 *   4. `subscription_*` (S-13)      → `suscripcion` (tabla `subscriptions`), o
 *                                     `suscripcion_invalida` si el objeto no se entiende
 *   4b. otro evento que no es de orden (incl. `subscription_payment_*`) → `evento_ignorado` (200)
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

  if (eventName && SUBSCRIPTION_EVENTS.includes(eventName)) {
    const sub = parseSubscriptionEvent(body, eventName);
    if (!sub) return { accion: 'suscripcion_invalida', body, eventName };
    return { accion: 'suscripcion', body, sub };
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

// ─── Suscripciones (S-13) ───────────────────────────────────────────────────
// Plan v2 §7.6 y bloque S-13 (punto 4). La suscripción pertenece a una CUENTA: el
// `account_id` sale del `custom` FIRMADO del checkout (`custom-suscripcion.mjs`) y de
// su nonce de un solo uso en `checkout_intentos`. Nunca de un correo parecido.

/** Eventos de suscripción que escriben `subscriptions`. Los `subscription_payment_*` NO. */
export const SUBSCRIPTION_EVENTS = Object.freeze([
  'subscription_created',
  'subscription_updated',
  'subscription_cancelled',
  'subscription_resumed',
  'subscription_expired',
  'subscription_paused',
  'subscription_unpaused',
]);

/** Estados del objeto Subscription de LS = el CHECK de `subscriptions.status`. */
export const ESTADOS_SUSCRIPCION = Object.freeze([
  'active',
  'on_trial',
  'past_due',
  'paused',
  'cancelled',
  'expired',
  'unpaid',
]);

export const PROVEEDOR = 'lemonsqueezy';
export const SLUG_SUSCRIPCION = 'suscripcion-libro';
// LS usa ids numéricos; además el id entra en un filtro `or()` de PostgREST, así que
// solo se aceptan caracteres que no rompen esa sintaxis.
const ID_PROVEEDOR = /^[A-Za-z0-9_-]{1,64}$/;

/**
 * Clave de correlación para registros y `events` (el id del proveedor se queda en la fila).
 * @param {string} id
 */
export function suscripcionRef(id) {
  return crypto.createHash('sha256').update(`lemonsqueezy-sub\0${String(id)}`, 'utf8').digest('hex');
}

function isoONull(v) {
  if (typeof v !== 'string' || v === '') return null;
  const t = Date.parse(v);
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
}

function pausaNormalizada(p) {
  if (!p || typeof p !== 'object') return null;
  if (p.mode !== 'void' && p.mode !== 'free') return null;
  return { mode: p.mode, resumes_at: isoONull(p.resumes_at) };
}

/**
 * Normaliza un evento `subscription_*`. `null` si no es uno de los siete, si falta el
 * id o si el `status` no es uno de los que admite la tabla (no se escribe lo que no
 * se entiende).
 * @param {any} body
 * @param {string|undefined|null} eventName
 */
export function parseSubscriptionEvent(body, eventName) {
  const ev = eventName || body?.meta?.event_name;
  if (!SUBSCRIPTION_EVENTS.includes(ev)) return null;
  const data = body?.data;
  const id = data?.id != null ? String(data.id) : '';
  if (!ID_PROVEEDOR.test(id)) return null;
  const attr = data?.attributes ?? {};
  const status = typeof attr.status === 'string' ? attr.status : '';
  if (!ESTADOS_SUSCRIPCION.includes(status)) return null;

  const str = (v) => (v != null && String(v) !== '' ? String(v) : null);
  const custom = body?.meta?.custom_data;
  return {
    providerSubscriptionId: id,
    status,
    // En una suscripción, `variant_id` está en `attributes` (doc LS).
    variantId: str(attr.variant_id),
    customerId: str(attr.customer_id),
    email: typeof attr.user_email === 'string' && attr.user_email.trim() ? attr.user_email.toLowerCase().trim() : null,
    userName: typeof attr.user_name === 'string' && attr.user_name.trim() ? attr.user_name.trim() : null,
    renewsAt: isoONull(attr.renews_at),
    endsAt: isoONull(attr.ends_at),
    trialEndsAt: isoONull(attr.trial_ends_at),
    createdAt: isoONull(attr.created_at),
    updatedAt: isoONull(attr.updated_at),
    cancelled: attr.cancelled === true,
    pause: pausaNormalizada(attr.pause),
    testMode: esTestMode(body),
    custom: custom && typeof custom === 'object' && !Array.isArray(custom) ? custom : null,
    eventName: ev,
  };
}

/**
 * Lo que un evento PUEDE cambiar de una suscripción ya guardada: estado, periodos y
 * pausa (+ `raw`, el último payload, que es donde queda `variant_id`: la tabla no
 * tiene esa columna). NUNCA `account_id`, `vinculo`, `email` ni `provider*`.
 * `current_period_end` = `renews_at` (en una prueba, `trial_ends_at` si falta).
 */
export function cambiosSuscripcion(sub, body) {
  return {
    status: sub.status,
    current_period_end: sub.renewsAt ?? sub.trialEndsAt,
    ends_at: sub.endsAt,
    cancel_at_period_end: sub.cancelled,
    pause: sub.pause,
    raw: body,
  };
}

/** Fila nueva de `subscriptions` (solo en el PRIMER evento de un id). */
export function filaSuscripcion(sub, { accountId, vinculo, body, nowIso }) {
  return {
    provider: PROVEEDOR,
    provider_subscription_id: sub.providerSubscriptionId,
    provider_customer_id: sub.customerId,
    account_id: accountId,
    vinculo,
    email: sub.email,
    product_slug: SLUG_SUSCRIPCION,
    started_at: sub.createdAt ?? nowIso,
    test_mode: sub.testMode,
    ...cambiosSuscripcion(sub, body),
  };
}

/**
 * ¿El evento es MÁS VIEJO que lo guardado? LS reintenta a los 5, 25 y 125 s: un
 * `subscription_created` reintentado puede llegar después del `updated` que ya
 * canceló. Se compara el `updated_at` del objeto de LS; sin fechas, no se descarta.
 */
export function esEventoObsoleto(rawGuardado, sub) {
  const guardado = Date.parse(rawGuardado?.data?.attributes?.updated_at ?? '');
  const entrante = Date.parse(sub.updatedAt ?? '');
  return Number.isFinite(guardado) && Number.isFinite(entrante) && entrante < guardado;
}

async function buscarSuscripcion(supabase, id) {
  const { data, error } = await supabase
    .from('subscriptions')
    .select('id, account_id, vinculo, raw')
    .eq('provider', PROVEEDOR)
    .eq('provider_subscription_id', id)
    .maybeSingle();
  return { fila: data ?? null, error: error ?? null };
}

async function actualizarSuscripcion(supabase, sub, fila, body) {
  if (esEventoObsoleto(fila.raw, sub)) return { http: 200, resultado: 'obsoleto', vinculo: fila.vinculo };
  const { error } = await supabase
    .from('subscriptions')
    .update(cambiosSuscripcion(sub, body))
    .eq('provider', PROVEEDOR)
    .eq('provider_subscription_id', sub.providerSubscriptionId)
    .select('id');
  if (error) return { http: 500, resultado: 'error_update' };
  return { http: 200, resultado: 'actualizada', vinculo: fila.vinculo };
}

/**
 * Escribe un evento `subscription_*` en `subscriptions`. Idempotente: una reentrega
 * del mismo evento vuelve a dejar la fila igual y responde 200.
 *
 * - Ya hay fila para `(lemonsqueezy, id)` → solo `cambiosSuscripcion` (salvo evento
 *   obsoleto). Nunca toca `account_id` ni `vinculo`, ni envía correos.
 * - PRIMER evento de un id (el orden de llegada no está garantizado: puede ser
 *   `created` o `updated`):
 *     1. la variante tiene que ser de la suscripción del libro (`LS_VARIANT_SUSCRIPCION*`);
 *        otra variante de la tienda no es nuestra → 200 sin fila;
 *     2. `custom` firmado (tiempo constante, ≤ 7 días) + CAS del nonce:
 *        `update checkout_intentos set used_at = now(), provider_subscription_id = $id
 *         where nonce = $n and account_id = $aid
 *           and (used_at is null or provider_subscription_id = $id)`;
 *        si gana → fila con `account_id` y `vinculo = 'cuenta'`;
 *     3. si no (sin custom, firma mala, caducado, nonce de otra cuenta o ya usado con
 *        otro id) → fila con `account_id = null` y `vinculo = 'pendiente'`, y UN correo
 *        al del pago con el enlace para vincularla desde el portal (C11). «Una sola vez»
 *        lo garantiza el insert: solo quien lo gana envía.
 *   El insert es `on conflict (provider, provider_subscription_id) do nothing`: si otra
 *   entrega simultánea ganó, esta solo actualiza.
 *
 * @param {any} supabase  cliente supabase-js (o falso)
 * @param {ReturnType<typeof parseSubscriptionEvent>} sub
 * @param {{ body: unknown, secretCustom: string|null|undefined, variantesSuscripcion: Set<string>,
 *           nowMs?: number,
 *           enviarCorreoVincular?: (d: { email: string, nombre: string|null }) => Promise<{ ok: boolean }> }} ctx
 * @returns {Promise<{ http: number, resultado: string, vinculo?: 'cuenta'|'pendiente', motivo?: string|null,
 *                     correo?: 'enviado'|'fallido'|'omitido', aviso?: 'config' }>}
 */
export async function procesarSuscripcion(supabase, sub, ctx) {
  const nowMs = ctx.nowMs ?? Date.now();
  const nowIso = new Date(nowMs).toISOString();

  const previa = await buscarSuscripcion(supabase, sub.providerSubscriptionId);
  if (previa.error) return { http: 500, resultado: 'error_consulta' };
  if (previa.fila) return actualizarSuscripcion(supabase, sub, previa.fila, ctx.body);

  // ── Primer evento de este id ──
  const variantes = ctx.variantesSuscripcion;
  if (!variantes || variantes.size === 0) return { http: 500, resultado: 'sin_variantes', aviso: 'config' };
  if (!sub.variantId || !variantes.has(sub.variantId)) return { http: 200, resultado: 'variante_ajena' };
  // `subscriptions.email` es NOT NULL: mejor rechazar que reventar el insert.
  if (!sub.email) return { http: 400, resultado: 'sin_email' };
  // Sin secreto no se puede saber de quién es: 500 para que LS reintente cuando esté.
  if (!secretoCustomValido(ctx.secretCustom)) return { http: 500, resultado: 'sin_secreto_custom', aviso: 'config' };

  const v = verificarCustom(sub.custom, ctx.secretCustom, { nowS: Math.floor(nowMs / 1000) });
  let accountId = null;
  let motivo = v.ok ? null : v.motivo;
  if (v.ok) {
    const { data, error } = await supabase
      .from('checkout_intentos')
      .update({ used_at: nowIso, provider_subscription_id: sub.providerSubscriptionId })
      .eq('nonce', v.nonce)
      .eq('account_id', v.accountId)
      .or(`used_at.is.null,provider_subscription_id.eq.${sub.providerSubscriptionId}`)
      .select('nonce')
      .maybeSingle();
    if (error) return { http: 500, resultado: 'error_cas' };
    if (data) accountId = v.accountId;
    else motivo = 'nonce';
  }

  const vinculo = accountId ? 'cuenta' : 'pendiente';
  const { data: insertadas, error: insErr } = await supabase
    .from('subscriptions')
    .upsert(filaSuscripcion(sub, { accountId, vinculo, body: ctx.body, nowIso }), {
      onConflict: 'provider,provider_subscription_id',
      ignoreDuplicates: true,
    })
    .select('id');
  if (insErr) return { http: 500, resultado: 'error_insert' };

  if (!insertadas || insertadas.length === 0) {
    // Otra entrega simultánea creó la fila: esta solo actualiza.
    const otra = await buscarSuscripcion(supabase, sub.providerSubscriptionId);
    if (otra.error || !otra.fila) return { http: 500, resultado: 'error_consulta' };
    return actualizarSuscripcion(supabase, sub, otra.fila, ctx.body);
  }

  if (vinculo === 'cuenta') return { http: 200, resultado: 'vinculada', vinculo };

  let correo = 'omitido';
  if (ctx.enviarCorreoVincular) {
    try {
      const r = await ctx.enviarCorreoVincular({ email: sub.email, nombre: sub.userName });
      correo = r?.ok ? 'enviado' : 'fallido';
    } catch {
      correo = 'fallido';
    }
  }
  return { http: 200, resultado: 'pendiente', vinculo, motivo, correo };
}
