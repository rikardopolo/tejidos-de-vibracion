/**
 * checkout-suscripcion.mjs · Decisión del checkout de la SUSCRIPCIÓN (S-13, punto 3).
 * Plan v2 §7.6; patrón de `api/checkout/bundle-preventa.ts` + `lemonsqueezy-payload.mjs`.
 *
 * `POST /api/checkout/suscripcion` (el endpoint solo hace la E/S) exige:
 *   1. sesión del libro válida (`__Host-tdv_sesion`), con el epoch de la cuenta al día:
 *      una sesión cerrada «en todos los dispositivos» no paga;
 *   2. `cuentas.email_verificado_at` no nulo. Si falta: 403 con el enlace a la cuenta
 *      del portal, donde se confirma el correo (el libro no envía códigos).
 * Después:
 *   3. inserta `checkout_intentos` (`nonce` aleatorio de un solo uso, `account_id`,
 *      `variant_id`, `expires_at` a 30 min);
 *   4. crea el checkout de Lemon Squeezy con `custom = {account_id, nonce, iat, sig}`
 *      firmado (`custom-suscripcion.mjs`), `checkout_data.email` = correo de la cuenta
 *      y el mismo `expires_at`. SIN `lead_id`: la identidad es la cuenta firmada.
 *      `product_slug: 'suscripcion-libro'` viaja como dato informativo: el camino de
 *      órdenes del webhook solo puede usarlo para IGNORAR el `order_created` que
 *      acompaña a la suscripción, nunca para dar acceso;
 *   5. solo devuelve la URL si es de la tienda (`esUrlDePago`).
 * La variante sale del plan pedido (`mensual` | `anual`) con
 * `LS_VARIANT_SUSCRIPCION_MENSUAL` / `LS_VARIANT_SUSCRIPCION_ANUAL`.
 *
 * Sin red propia: cliente de Supabase y `crearCheckout` entran por parámetro.
 */
import { firmarCustom, nuevoNonce, secretoCustomValido } from './custom-suscripcion.mjs';
import { esUrlDePago } from './url-pago.mjs';

export const PLANES = Object.freeze(['mensual', 'anual']);
/** Vida del intento y del checkout: 30 min. */
export const INTENTO_TTL_MS = 30 * 60 * 1000;
export const TIMEOUT_CHECKOUT_MS = 2000;
export const SLUG_SUSCRIPCION = 'suscripcion-libro';
/** Donde la persona confirma su correo (portal). */
export const PORTAL_CUENTA_URL = 'https://tejidosderealidad.com/cuenta';

/** ¿Encendido? Solo el literal `true` de `SUSCRIPCION_CHECKOUT_ENABLED`. Se lee en cada llamada. */
export function checkoutSuscripcionActivo(env = typeof process !== 'undefined' && process.env ? process.env : {}) {
  return String(env?.SUSCRIPCION_CHECKOUT_ENABLED ?? '').trim() === 'true';
}

/**
 * Variantes de la suscripción por plan, recortadas.
 * @param {(k: string) => string|undefined} leer
 */
export function variantesDePlan(leer) {
  const v = (k) => {
    const x = leer(k);
    return typeof x === 'string' && x.trim() !== '' ? x.trim() : null;
  };
  return { mensual: v('LS_VARIANT_SUSCRIPCION_MENSUAL'), anual: v('LS_VARIANT_SUSCRIPCION_ANUAL') };
}

/**
 * `/cuenta` del portal, en el mismo origen que `PORTAL_AUTORIZAR_URL` (en Preview es
 * el alias de rama del portal). Sin una URL válida, la de producción.
 * @param {string|undefined|null} autorizarUrl
 */
export function urlCuentaPortal(autorizarUrl) {
  try {
    const u = new URL(String(autorizarUrl ?? ''));
    const local = u.hostname === 'localhost' || u.hostname === '127.0.0.1';
    if (u.protocol === 'https:' || (local && u.protocol === 'http:')) return new URL('/cuenta', u.origin).href;
  } catch {
    /* sin URL: la de producción */
  }
  return PORTAL_CUENTA_URL;
}

/**
 * Correo para precargar en el checkout, o `undefined`. Nunca una dirección de
 * reenvío de Apple (`privaterelay`, plan v2 §7.6): Lemon Squeezy mandaría ahí los
 * recibos.
 * @param {unknown} email
 */
export function correoPrecargable(email) {
  if (typeof email !== 'string') return undefined;
  const e = email.trim().toLowerCase();
  if (!e || !e.includes('@')) return undefined;
  if (e.endsWith('@privaterelay.appleid.com')) return undefined;
  return e;
}

/**
 * @typedef {{ status: number, body: Record<string, unknown>, desenlace: string,
 *             extra?: Record<string, unknown>, aviso?: 'config' }} RespuestaCheckout
 */

/**
 * @param {{
 *   sesion: { aid: string, ep: number } | null,
 *   plan: 'mensual'|'anual',
 *   client: any,
 *   secretCustom: string|null|undefined,
 *   variantes: { mensual: string|null, anual: string|null },
 *   crearCheckout: (o: { variantId: string, email?: string, productSlug: string,
 *                        custom: Record<string, string>, expiresAt: string }) =>
 *                  Promise<{ ok: true, url: string } | { ok: false, reason: string, status?: number, causa?: string }>,
 *   cuentaPortalUrl?: string,
 *   limitado?: (aid: string) => boolean,
 *   nowMs?: number,
 *   nonce?: string,
 *   timeoutMs?: number,
 * }} ctx
 * @returns {Promise<RespuestaCheckout>}
 */
export async function prepararCheckoutSuscripcion(ctx) {
  const nowMs = ctx.nowMs ?? Date.now();
  const timeoutMs = ctx.timeoutMs ?? TIMEOUT_CHECKOUT_MS;

  if (!ctx.sesion) {
    return { status: 401, body: { error: 'sin_sesion' }, desenlace: 'sin_sesion' };
  }

  const variantId = ctx.variantes?.[ctx.plan] ?? null;
  if (!variantId) {
    const falta = ctx.plan === 'anual' ? 'LS_VARIANT_SUSCRIPCION_ANUAL' : 'LS_VARIANT_SUSCRIPCION_MENSUAL';
    return { status: 500, body: { error: 'server_misconfigured' }, desenlace: 'mal_configurado', extra: { falta }, aviso: 'config' };
  }
  if (!secretoCustomValido(ctx.secretCustom)) {
    return {
      status: 500,
      body: { error: 'server_misconfigured' },
      desenlace: 'mal_configurado',
      extra: { falta: 'LS_CUSTOM_SECRET' },
      aviso: 'config',
    };
  }
  if (!ctx.client) {
    return {
      status: 503,
      body: { error: 'server_misconfigured' },
      desenlace: 'mal_configurado',
      extra: { falta: 'supabase' },
      aviso: 'config',
    };
  }

  // La cuenta: epoch (sesión viva) y correo verificado.
  let cuenta;
  try {
    const { data, error } = await ctx.client
      .from('cuentas')
      .select('email, email_verificado_at, session_epoch')
      .eq('account_id', ctx.sesion.aid)
      .abortSignal(AbortSignal.timeout(timeoutMs))
      .maybeSingle();
    if (error) return { status: 503, body: { error: 'no_disponible' }, desenlace: 'base_no_disponible', extra: { paso: 'cuenta' } };
    cuenta = data;
  } catch {
    return { status: 503, body: { error: 'no_disponible' }, desenlace: 'base_no_disponible', extra: { paso: 'cuenta' } };
  }
  if (!cuenta || cuenta.session_epoch !== ctx.sesion.ep) {
    return { status: 401, body: { error: 'sin_sesion' }, desenlace: 'sin_sesion', extra: { motivo: cuenta ? 'epoch' : 'cuenta' } };
  }
  if (!cuenta.email_verificado_at) {
    return {
      status: 403,
      body: {
        error: 'correo_sin_verificar',
        mensaje: 'Confirma tu correo en tu cuenta para suscribirte.',
        confirmar_url: ctx.cuentaPortalUrl ?? PORTAL_CUENTA_URL,
      },
      desenlace: 'correo_sin_verificar',
    };
  }

  // Límite de ritmo por cuenta: después de las comprobaciones, antes de escribir nada.
  if (ctx.limitado?.(ctx.sesion.aid)) {
    return { status: 429, body: { error: 'rate_limited' }, desenlace: 'limitado_por_ritmo' };
  }

  // El intento: el nonce de un solo uso que el webhook consumirá.
  const nonce = ctx.nonce ?? nuevoNonce();
  const expiresAt = new Date(nowMs + INTENTO_TTL_MS).toISOString();
  try {
    const { error } = await ctx.client
      .from('checkout_intentos')
      .insert({ nonce, account_id: ctx.sesion.aid, variant_id: variantId, expires_at: expiresAt });
    if (error) return { status: 503, body: { error: 'no_disponible' }, desenlace: 'base_no_disponible', extra: { paso: 'intento' } };
  } catch {
    return { status: 503, body: { error: 'no_disponible' }, desenlace: 'base_no_disponible', extra: { paso: 'intento' } };
  }

  const custom = firmarCustom({ accountId: ctx.sesion.aid, nonce, iat: Math.floor(nowMs / 1000) }, ctx.secretCustom);
  if (!custom) {
    // aid o nonce fuera de formato: no debería pasar con una sesión firmada.
    return { status: 500, body: { error: 'server_misconfigured' }, desenlace: 'mal_configurado', extra: { falta: 'custom' } };
  }

  const result = await ctx.crearCheckout({
    variantId,
    email: correoPrecargable(cuenta.email),
    productSlug: SLUG_SUSCRIPCION,
    custom,
    expiresAt,
  });
  if (!result.ok) {
    return {
      status: result.reason === 'not_configured' ? 500 : 502,
      body: { error: result.reason },
      desenlace: 'error_proveedor',
      extra: { motivo: result.reason ?? null, estado_proveedor: result.status ?? null, causa: result.causa ?? null },
      aviso: result.reason === 'not_configured' ? 'config' : undefined,
    };
  }
  if (!esUrlDePago(result.url)) {
    return { status: 502, body: { error: 'invalid_checkout_url' }, desenlace: 'error_proveedor', extra: { motivo: 'host_inesperado' } };
  }

  return { status: 200, body: { checkout_url: result.url }, desenlace: 'checkout_creado', extra: { plan: ctx.plan } };
}
