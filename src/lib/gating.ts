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
export async function getAcceso(cookies: AstroCookies): Promise<{ nivel: Nivel; slugs: string[] }> {
  const secret = readEnv('ACCESS_TOKEN_SECRET');
  if (!secret) return { nivel: 0, slugs: [] };

  const value = cookies.get('tejedor-access')?.value;
  if (!value) return { nivel: 0, slugs: [] };

  // Token de COMPRA (nivel 2/3 + scope) · formato body.sig (un punto).
  if (looksLikePurchaseToken(value)) {
    const r = verifyPurchaseToken(value, secret);
    if (!r.valid) return { nivel: 0, slugs: [] };
    const granted = { nivel: r.nivel, slugs: r.slugs };

    // Chequeo de reembolso (best-effort). El token firmado ya prueba la compra:
    // consultamos `orders` SOLO para REVOCAR tras un reembolso/disputa. Cualquier
    // fallo de infra hace fail-open al nivel del token (un outage no debe tumbar
    // acceso legítimo). Los tokens de REGISTRO no tocan la DB (sin coste extra).
    const supabase = r.orderId ? getServerClient() : null;
    let order: { status: string } | null = null;
    let queryError = false;
    if (supabase && r.orderId) {
      const res = await supabase.from('orders').select('status').eq('ls_order_id', r.orderId).maybeSingle();
      order = res.data;
      queryError = res.error != null;
      if (queryError) console.warn('[gating] consulta orders falló · fail-open al token de compra:', res.error?.message);
    } else if (r.orderId && !supabase) {
      console.warn('[gating] Supabase no disponible · fail-open al nivel del token de compra');
    }
    return resolveRefundGate(granted, { orderId: r.orderId, hasClient: supabase != null, queryError, order });
  }

  // Token de REGISTRO (nivel 1) · formato legacy (un único blob base64url, sin puntos).
  return verifyAccessToken(value, secret).valid ? { nivel: 1, slugs: [] } : { nivel: 0, slugs: [] };
}

export async function getNivel(cookies: AstroCookies): Promise<Nivel> {
  return (await getAcceso(cookies)).nivel;
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
