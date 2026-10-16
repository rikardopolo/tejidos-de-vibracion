/**
 * GET /auth/entrar?next=<ruta> · empieza el salto al portal (plan v2 §7.5, paso 1).
 *
 * - `state` aleatorio (32 bytes). En `__Host-tdv_state` va su HASH y la ruta de
 *   vuelta, firmados y por 10 min; el `state` en claro solo viaja en la URL.
 * - `next` se valida aquí (mismo origen, ruta absoluta) y se revalida al volver.
 * - 302 a `PORTAL_AUTORIZAR_URL?aud=tdv&state=…`. Sin esa variable o sin
 *   `TDV_SESSION_SECRET` → 500 de configuración (no se puede salir sin poder volver).
 *
 * «Entrar» y «Crear cuenta» llegan los dos aquí: la pantalla del portal es la misma
 * («Entra o crea tu cuenta»). Es un `<a href>` con GET: un `<form>` POST que
 * redirige a otro dominio lo bloquea `form-action 'self'`.
 */
import type { APIRoute } from 'astro';
import { STATE_COOKIE, STATE_TTL_S, firmarStateTdv } from '@/lib/sesion-tdv.mjs';
import { nuevoState, sha256Hex, urlAutorizar, validarNext } from '@/lib/salto-tdv.mjs';
import {
  noEncontrado,
  opcionesCookie,
  portalAutorizarUrl,
  redirigir,
  respuestaTexto,
  secretoTdv,
  sesionTdvActiva,
} from '@/lib/cuenta-tdv';

export const prerender = false;

export const GET: APIRoute = ({ url, cookies }) => {
  if (!sesionTdvActiva()) return noEncontrado();

  const state = nuevoState();
  const destino = urlAutorizar(portalAutorizarUrl(), state);
  const next = validarNext(url.searchParams.get('next'), url.origin) ?? '/';
  const cookie = firmarStateTdv({ sh: sha256Hex(state), next }, { secret: secretoTdv() });

  if (!destino || !cookie) {
    console.error(
      '[auth/entrar] configuración incompleta: PORTAL_AUTORIZAR_URL (https) o TDV_SESSION_SECRET (≥ 32 caracteres)',
    );
    return respuestaTexto(500, 'La entrada no está disponible ahora mismo.');
  }

  cookies.set(STATE_COOKIE, cookie, opcionesCookie(STATE_TTL_S));
  return redirigir(destino);
};
