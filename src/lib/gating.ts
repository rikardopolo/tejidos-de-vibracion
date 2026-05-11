/**
 * gating.ts · Detección del nivel de acceso desde la cookie tejedor-access.
 *
 * Niveles:
 *   0 = anónimo         → fragmento 20-30% + BloqueRegistro
 *   1 = tejedor free    → contenido completo
 *   2 = suscriptor pago → contenido completo + extras (inactivo al lanzamiento)
 */
import type { AstroCookies } from 'astro';
import { verifyAccessToken } from './token';

export type Nivel = 0 | 1 | 2;

export function getNivel(cookies: AstroCookies): Nivel {
  const secret = import.meta.env.ACCESS_TOKEN_SECRET;
  if (!secret) return 0;

  const cookie = cookies.get('tejedor-access');
  if (!cookie?.value) return 0;

  const result = verifyAccessToken(cookie.value, secret);
  if (!result.valid) return 0;

  // Para el lanzamiento: todo token válido = Nivel 1 (tejedor free).
  // En el futuro: leer atributo de Brevo/Supabase para distinguir 1 vs 2.
  return 1;
}

export function gatingActivo(): boolean {
  return import.meta.env.GATING_ACTIVO === 'true';
}

export function suscripcionActiva(): boolean {
  return import.meta.env.SUSCRIPCION_ACTIVA === 'true';
}
