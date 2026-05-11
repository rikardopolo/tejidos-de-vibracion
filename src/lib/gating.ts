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

/**
 * Lee una variable de entorno respetando build time + runtime.
 * Vite inlines `import.meta.env.X` en build time; si la var no estaba
 * disponible entonces, queda como `undefined`. `process.env` se evalúa
 * en runtime en Node (Vercel Serverless), garantizando que los valores
 * más recientes del dashboard sean visibles sin rebuild.
 */
function readEnv(key: string): string | undefined {
  const fromMeta = (import.meta.env as Record<string, string | undefined>)[key];
  if (fromMeta !== undefined && fromMeta !== '') return fromMeta;
  if (typeof process !== 'undefined' && process.env) {
    return process.env[key];
  }
  return undefined;
}

export function getNivel(cookies: AstroCookies): Nivel {
  const secret = readEnv('ACCESS_TOKEN_SECRET');
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
  return readEnv('GATING_ACTIVO') === 'true';
}

export function suscripcionActiva(): boolean {
  return readEnv('SUSCRIPCION_ACTIVA') === 'true';
}