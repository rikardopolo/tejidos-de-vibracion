/**
 * GET /auth/callback?code&state · vuelta del portal (plan v2 §7.5, paso 3).
 *
 * La decisión entera está en `resolverCallback` (`lib/salto-tdv.mjs`, probada con un
 * cliente falso): compara el `state` con la cookie, canjea el código con un CAS
 * sobre `cuenta_saltos.used_at`, comprueba el epoch y firma la sesión. Aquí solo la
 * E/S:
 * - `__Host-tdv_state` se borra SIEMPRE, salga bien o mal (un solo uso), y con
 *   `Secure`: sin él, el navegador ignora el borrado de una `__Host-`.
 * - Bien: `__Host-tdv_sesion` (30 días) y 302 a `next` con `no-referrer`.
 * - Mal: 302 a `/auth/error`, sin decir el motivo. El motivo va a los registros.
 * - Sin cliente de Supabase o sin secreto: cerrado, y aviso a Sentry.
 */
import type { APIRoute } from 'astro';
import * as Sentry from '@sentry/astro';
import { SESION_COOKIE, SESION_TTL_S, STATE_COOKIE } from '@/lib/sesion-tdv.mjs';
import { resolverCallback } from '@/lib/salto-tdv.mjs';
import { getServerClient } from '@/lib/supabase';
import {
  OPCIONES_BORRADO,
  noEncontrado,
  opcionesCookie,
  redirigir,
  secretoTdv,
  sesionTdvActiva,
} from '@/lib/cuenta-tdv';

export const prerender = false;

export const GET: APIRoute = async ({ url, cookies }) => {
  if (!sesionTdvActiva()) return noEncontrado();

  const cookieState = cookies.get(STATE_COOKIE)?.value;
  cookies.delete(STATE_COOKIE, OPCIONES_BORRADO);

  const r = await resolverCallback({
    code: url.searchParams.get('code'),
    state: url.searchParams.get('state'),
    cookieState,
    origen: url.origin,
    client: getServerClient(),
    secret: secretoTdv(),
  });

  if (!r.ok) {
    if (r.motivo === 'config') await avisarConfigRota();
    else console.warn('[auth/callback] salto rechazado:', r.motivo);
    return redirigir(`/auth/error?next=${encodeURIComponent(r.next)}`);
  }

  cookies.set(SESION_COOKIE, r.sesion, opcionesCookie(SESION_TTL_S));
  return redirigir(r.next);
};

// Un aviso a Sentry por instancia (patrón de gating.ts): con la configuración rota,
// cada intento de entrar pasaría por aquí. El console.error sí sale siempre.
let configRotaAvisada = false;

async function avisarConfigRota(): Promise<void> {
  console.error(
    '[auth/callback] configuración incompleta (Supabase o TDV_SESSION_SECRET) · salto CERRADO',
  );
  if (configRotaAvisada) return;
  configRotaAvisada = true;
  try {
    Sentry.captureMessage('auth/callback: configuración incompleta · salto cerrado', 'error');
    await Sentry.flush(2000);
  } catch {
    /* el aviso nunca debe romper la respuesta */
  }
}
