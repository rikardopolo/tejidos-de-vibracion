/**
 * GET /r/<pieza> · enlace-puente. Sella la campaña y redirige.
 *
 * Es la pieza que faltaba para poder atribuir. Los 12 reels llevaban UTMs
 * completas en su CTA y produjeron **cero** sesiones atribuidas en 40 días,
 * porque el CTA es «link en bio» y una bio es un único enlace: no puede
 * arrastrar un `utm_content` distinto por pieza.
 *
 * Esta ruta invierte el orden. Es corta, cabe en cualquier sitio donde SÍ haya
 * un enlace real (descripción de YouTube, post de Facebook, sticker de Stories,
 * o la bio cambiada por publicación), y sella la atribución al redirigir.
 *
 * Decisiones:
 * - **302, no 301.** Un 301 se cachea en el navegador de por vida: si mañana
 *   una pieza cambia de destino, quien ya la pulsó nunca vería el nuevo. Para
 *   un enlace de campaña, permanente es justo lo que no queremos.
 * - **Nunca 404.** Un slug desconocido redirige a la Obertura marcándose como
 *   `pieza-desconocida`. Un enlace muerto en una bio publicada es peor que uno
 *   impreciso, y además el fallo queda medido en vez de perderse.
 * - **Sin captura en servidor.** El destino ya tiene PostHog y recibe las UTMs
 *   en la URL: la atribución la registra el `$pageview` normal. Añadir una
 *   llamada extra desde el servidor duplicaría eventos y metería latencia en un
 *   salto que debe ser instantáneo.
 * - **`noindex`.** Estas URLs no deben aparecer en buscadores compitiendo con
 *   el destino real.
 */
import type { APIRoute } from 'astro';
import { PIEZAS, DESTINO_FALLBACK, urlConAtribucion } from '@/lib/piezas';

export const prerender = false;

export const GET: APIRoute = ({ params, url: peticion }) => {
  const slug = (params.pieza ?? '').trim().toLowerCase();
  const pieza = PIEZAS[slug];

  // `?c=<red>` declara DÓNDE se pegó el enlace (fb, yt, ig, tiktok). Lo pone
  // quien publica —WF-01b en las descripciones de Facebook y YouTube—, porque
  // esta ruta descarta las UTMs que le llegan y sella siempre las de la pieza:
  // sin este dato, un enlace de Facebook se contaba como tráfico de Instagram.
  // Una red desconocida no rompe nada: se ignora y vale el default de la pieza.
  const red = peticion.searchParams.get('c');

  const destino = pieza
    ? urlConAtribucion(slug, pieza, red)
    : (() => {
        // Slug desconocido: no se rompe el enlace, pero se deja rastro para
        // poder verlo en PostHog y corregir el registro.
        const url = new URL(DESTINO_FALLBACK);
        url.searchParams.set('utm_source', 'enlace-puente');
        url.searchParams.set('utm_medium', 'redirect');
        url.searchParams.set('utm_campaign', 'pieza-desconocida');
        url.searchParams.set('utm_content', slug.slice(0, 64) || 'vacio');
        return url.toString();
      })();

  return new Response(null, {
    status: 302,
    headers: {
      Location: destino,
      'Cache-Control': 'public, max-age=0, s-maxage=300, must-revalidate',
      'X-Robots-Tag': 'noindex, nofollow',
      'Referrer-Policy': 'no-referrer-when-downgrade',
    },
  });
};
