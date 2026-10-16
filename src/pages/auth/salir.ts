/**
 * POST /auth/salir · cierra la sesión DEL LIBRO (borra `__Host-tdv_sesion`).
 *
 * - Solo mismo origen: Astro ya rechaza un formulario de otro origen
 *   (`checkOrigin`); `esMismoOrigen` es la segunda capa (Origin o Sec-Fetch-Site)
 *   y la que cubre otros content-type.
 * - El borrado lleva `Secure`: sin él, el navegador ignora el de una `__Host-`.
 * - 303 a `next` (campo del formulario, validado) o a `/`.
 *
 * No cierra la sesión del portal: si el lector vuelve a pulsar «Entrar» con el
 * portal abierto, el salto lo devuelve dentro sin preguntar. Para salir de todo,
 * «Cerrar sesión» en tejidosderealidad.com.
 */
import type { APIRoute } from 'astro';
import { SESION_COOKIE } from '@/lib/sesion-tdv.mjs';
import { esMismoOrigen, validarNext } from '@/lib/salto-tdv.mjs';
import { OPCIONES_BORRADO, noEncontrado, redirigir, respuestaTexto, sesionTdvActiva } from '@/lib/cuenta-tdv';

export const prerender = false;

export const POST: APIRoute = async ({ request, url, cookies }) => {
  if (!sesionTdvActiva()) return noEncontrado();
  if (!esMismoOrigen(request.headers, url.origin)) return respuestaTexto(403, 'Origen no permitido');

  let next = '/';
  try {
    const form = await request.formData();
    next = validarNext(String(form.get('next') ?? ''), url.origin) ?? '/';
  } catch {
    /* sin formulario legible: se vuelve a la portada */
  }

  cookies.delete(SESION_COOKIE, OPCIONES_BORRADO);
  return redirigir(next, 303);
};

export const GET: APIRoute = () => {
  if (!sesionTdvActiva()) return noEncontrado();
  return new Response('Método no permitido', {
    status: 405,
    headers: { Allow: 'POST', 'Cache-Control': 'private, no-store', 'Content-Type': 'text/plain; charset=utf-8' },
  });
};
