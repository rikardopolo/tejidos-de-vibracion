/**
 * cuenta-tdv.ts · Pegamento de servidor de la sesión del libro (S-12).
 *
 * La lógica pura vive en `sesion-tdv.mjs` (firma) y `salto-tdv.mjs` (salto). Aquí
 * solo: leer el entorno (patrón `readEnv` del repo: `process.env` primero, para que
 * el dashboard de Vercel mande sin rebuild; `import.meta.env` como respaldo en
 * `astro dev`), las opciones de las cookies y las respuestas de `/auth/*`.
 *
 * Interruptor: `TDV_SESION_ENABLED` (apagado por defecto). Apagado, `/auth/*`
 * responde 404, `leerSesionTdv` devuelve `null` (el gating no la mira) y la
 * interfaz no enseña «Entrar». Es la reversión de la Fase 4 del v2.
 */
import type { AstroCookies } from 'astro';
import {
  OPCIONES_BORRADO_TDV,
  SESION_COOKIE,
  opcionesCookieTdv,
  sesionTdvDeCookie,
  type SesionTdvValida,
} from './sesion-tdv.mjs';

function readEnv(key: string): string | undefined {
  if (typeof process !== 'undefined' && process.env) {
    const fromProc = process.env[key];
    if (fromProc !== undefined && fromProc !== '') return fromProc;
  }
  const fromMeta = (import.meta.env as Record<string, string | undefined>)[key];
  if (fromMeta !== undefined && fromMeta !== '') return fromMeta;
  return undefined;
}

/** ¿Está encendida la sesión del libro? Se lee en cada llamada. */
export function sesionTdvActiva(): boolean {
  return readEnv('TDV_SESION_ENABLED')?.trim() === 'true';
}

/** `TDV_SESSION_SECRET` crudo · lo valida `sesion-tdv.mjs` (≥ 32 caracteres). */
export function secretoTdv(): string | undefined {
  return readEnv('TDV_SESSION_SECRET');
}

/** `PORTAL_AUTORIZAR_URL` crudo · lo valida `urlAutorizar` (https). */
export function portalAutorizarUrl(): string | undefined {
  return readEnv('PORTAL_AUTORIZAR_URL');
}

/** Enlace a las preferencias en el mismo portal que autoriza el libro (también en preview). */
export function portalCuentaUrl(): string | null {
  try {
    const url = new URL(portalAutorizarUrl() || 'https://tejidosderealidad.com/cuenta/autorizar');
    return url.protocol === 'https:' && !url.username && !url.password ? `${url.origin}/cuenta` : null;
  } catch {
    return null;
  }
}

/**
 * Sesión válida del libro (firma y caducidad, SIN consultar la base) o `null`.
 * Con el interruptor apagado, siempre `null` (decisión en `sesionTdvDeCookie`,
 * probada con `node --test`).
 *
 * RIESGO ACEPTADO (nivel 1, plan v2 §7.4 y §7.7): aquí no se mira `session_epoch`.
 * Tras «Cerrar sesión en todos los dispositivos», o tras borrar la cuenta, una
 * `__Host-tdv_sesion` YA emitida sigue dando el nivel 1 y enseñando «Entraste como
 * r***@…» en ese navegador hasta su `exp` (30 días) o hasta «Salir». El epoch se
 * comprueba en el canje (`/auth/callback`: ninguna sesión NUEVA nace con un epoch
 * viejo) y, desde S-13, en el nivel 2. Corte de emergencia para TODAS las sesiones
 * del libro: rotar `TDV_SESSION_SECRET` o `TDV_SESION_ENABLED=false`.
 */
export function leerSesionTdv(cookies: AstroCookies): SesionTdvValida | null {
  return sesionTdvDeCookie(cookies.get(SESION_COOKIE)?.value, {
    activa: sesionTdvActiva(),
    secret: secretoTdv(),
  });
}

/** Opciones de las cookies `__Host-` (ver `opcionesCookieTdv` en sesion-tdv.mjs). */
export const opcionesCookie = opcionesCookieTdv;

/** Borrado de una cookie `__Host-`, con `Secure` (ver `OPCIONES_BORRADO_TDV`). */
export const OPCIONES_BORRADO = OPCIONES_BORRADO_TDV;

/**
 * Cabeceras de toda respuesta de `/auth/*`: nada se cachea (llevan `Set-Cookie` y
 * códigos de un solo uso) y nada sale por `Referer` (la URL del callback lleva
 * `code` y `state`).
 */
export const CABECERAS_AUTH: Record<string, string> = {
  'Cache-Control': 'private, no-store',
  'Referrer-Policy': 'no-referrer',
  'X-Robots-Tag': 'noindex, nofollow',
};

export function redirigir(location: string, status: 302 | 303 = 302): Response {
  return new Response(null, { status, headers: { ...CABECERAS_AUTH, Location: location } });
}

export function respuestaTexto(status: number, texto: string): Response {
  return new Response(texto, {
    status,
    headers: { ...CABECERAS_AUTH, 'Content-Type': 'text/plain; charset=utf-8' },
  });
}

/** Interruptor apagado: `/auth/*` no existe. */
export function noEncontrado(): Response {
  return respuestaTexto(404, 'No encontrado');
}
