/**
 * gating.ts · Nivel de acceso desde la cookie tejedor-access.
 *
 * Niveles (Guía Estratégica · escalera de compromiso):
 *   0 = visitante          → fragmento 20-30% + BloqueRegistro
 *   1 = tejedor registrado → Obertura + Acto I (token de registro · token.ts)
 *   2 = comprador          → + Cap. 4 + Acto II/III (token de compra · purchase-token.mjs)
 *   3 = libro completo     → + objeto terminado / acceso permanente
 */
import type { AstroCookies } from 'astro';
import { verifyAccessToken } from './token';
import { verifyPurchaseToken, looksLikePurchaseToken } from './purchase-token.mjs';
import { resolveRefundGate } from './refund-gate.mjs';
import { getServerClient } from './supabase';

export type Nivel = 0 | 1 | 2 | 3;

/**
 * Lee una variable de entorno respetando runtime PRIMERO, build-time como fallback.
 * `process.env[key]` (bracket-notation) no es estáticamente analizable por Vite y
 * se evalúa en runtime en Vercel → el dashboard es la fuente de verdad sin rebuild.
 */
function readEnv(key: string): string | undefined {
  if (typeof process !== 'undefined' && process.env) {
    const fromProc = process.env[key];
    if (fromProc !== undefined && fromProc !== '') return fromProc;
  }
  const fromMeta = (import.meta.env as Record<string, string | undefined>)[key];
  if (fromMeta !== undefined && fromMeta !== '') return fromMeta;
  return undefined;
}

/** Nivel + scope (slugs comprados) leídos y verificados desde la cookie. */
export function getAcceso(cookies: AstroCookies): { nivel: Nivel; slugs: string[] } {
  const secret = readEnv('ACCESS_TOKEN_SECRET');
  if (!secret) return { nivel: 0, slugs: [] };

  const value = cookies.get('tejedor-access')?.value;
  if (!value) return { nivel: 0, slugs: [] };

  // Token de COMPRA (nivel 2/3 + scope) · formato body.sig (un punto).
  if (looksLikePurchaseToken(value)) {
    const r = verifyPurchaseToken(value, secret);
    return r.valid ? { nivel: r.nivel, slugs: r.slugs } : { nivel: 0, slugs: [] };
  }

  // Token de REGISTRO (nivel 1) · formato legacy (un único blob base64url, sin puntos).
  return verifyAccessToken(value, secret).valid ? { nivel: 1, slugs: [] } : { nivel: 0, slugs: [] };
}

export function getNivel(cookies: AstroCookies): Nivel {
  return getAcceso(cookies).nivel;
}

/**
 * Igual que `getAcceso`, pero cruza el token de COMPRA contra `orders.status`
 * para que un reembolso corte el acceso de verdad.
 *
 * Por qué existe aparte y no dentro de `getAcceso`: solo el nivel ≥ 2 nace de una
 * compra, así que solo ahí hay algo que revocar. Dejar `getAcceso` síncrona evita
 * volver async —y tocar— las cuatro superficies de nivel 1 (Obertura, /recibir,
 * LecturaLarga), y evita una consulta a la base por cada lector registrado.
 *
 * Úsala en toda página que gatee contenido PAGADO. La política de qué hacer
 * cuando la comprobación no se puede completar vive en `refund-gate.mjs`.
 */
export async function getAccesoVerificado(
  cookies: AstroCookies,
): Promise<{ nivel: Nivel; slugs: string[] }> {
  const granted = getAcceso(cookies);
  if (granted.nivel < 2) return granted;

  const otorgado = { nivel: granted.nivel as 2 | 3, slugs: granted.slugs };
  const orderId = orderIdDeCookie(cookies);

  // Sin orderId no hay nada que consultar: la política decide (hoy, revocar).
  if (!orderId) {
    return resolveRefundGate(otorgado, { orderId: null, hasClient: false, queryError: false, order: null });
  }

  const client = getServerClient();
  if (!client) {
    return resolveRefundGate(otorgado, { orderId, hasClient: false, queryError: false, order: null });
  }

  const { data, error } = await client
    .from('orders')
    .select('status')
    .eq('ls_order_id', orderId)
    // Acota la consulta ENTERA, reintentos de postgrest incluidos. Sin esto, la
    // política de "fail-OPEN ante fallo de infraestructura" no se cumple en el caso
    // que más se parece a una caída: un Supabase LENTO no devuelve error, se cuelga,
    // agota la función SSR y el comprador ve un 504 — nunca llegaríamos a abrir.
    // El abort vuelve como `error`, que es justo lo que activa el fail-OPEN.
    .abortSignal(AbortSignal.timeout(2000))
    .maybeSingle();

  return resolveRefundGate(otorgado, {
    orderId,
    hasClient: true,
    queryError: Boolean(error),
    order: data ? { status: String(data.status) } : null,
  });
}

/** `ls_order_id` que viaja dentro del token de compra, o null si no lo lleva. */
function orderIdDeCookie(cookies: AstroCookies): string | null {
  const secret = readEnv('ACCESS_TOKEN_SECRET');
  const value = cookies.get('tejedor-access')?.value;
  if (!secret || !value || !looksLikePurchaseToken(value)) return null;
  const r = verifyPurchaseToken(value, secret);
  return r.valid ? (r.orderId ?? null) : null;
}

// Decisión PURA de acceso (nivel + scope de producto). Vive en gate-decision.mjs
// para ser testeable con `node --test` sin deps; se re-exporta aquí para que las
// páginas la consuman desde un único punto. Ver gate-decision.mjs para la regla.
export { puedeAcceder } from './gate-decision.mjs';

/**
 * `true` SOLO en un deploy de Vercel de rama distinta de `main`.
 *
 * Sirve para que el revisor interno lea en preview lo que todavía no está
 * publicado, sin tocar el `status` del contenido — que es el interruptor de
 * visibilidad PÚBLICA y no debe moverse para una revisión.
 *
 * Es seguro por construcción: en producción `VERCEL_GIT_COMMIT_REF === 'main'`,
 * así que esta función devuelve `false` ahí SIEMPRE. A diferencia de
 * `gatingActivo()`, no depende de ninguna variable de entorno que pueda estar
 * mal puesta: si la rama es `main`, o si no hay rama (build local), es `false`.
 */
export function esPreview(): boolean {
  if (typeof process === 'undefined' || !process.env) return false;
  const branch = process.env.VERCEL_GIT_COMMIT_REF ?? '';
  return branch !== '' && branch !== 'main';
}

export function gatingActivo(): boolean {
  // En cualquier rama Vercel distinta de `main` se desactiva el gating por
  // completo para que el revisor interno vea el contenido sin pasar por la puerta.
  // main NUNCA toma este camino (VERCEL_GIT_COMMIT_REF=main en producción).
  if (typeof process !== 'undefined' && process.env) {
    const branch = process.env.VERCEL_GIT_COMMIT_REF ?? '';
    if (branch && branch !== 'main') return false;
  }
  return readEnv('GATING_ACTIVO') === 'true';
}

export function suscripcionActiva(): boolean {
  return readEnv('SUSCRIPCION_ACTIVA') === 'true';
}
