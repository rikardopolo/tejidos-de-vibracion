/**
 * Reverse-proxy same-origin hacia PostHog.
 *
 * Dos motivos, los dos importantes:
 *  1. **CSP.** La del sitio es `connect-src 'self' https://api.brevo.com`. Si el
 *     SDK hablara directamente con `eu.i.posthog.com`, el navegador lo
 *     bloquearía y la analítica quedaría muda. Proxeando por aquí no hay que
 *     abrir la CSP.
 *  2. **Bloqueadores.** uBlock, Brave Shields y Privacy Badger cortan las
 *     llamadas a dominios de PostHog. Same-origin sobreviven.
 *
 * Rutas (catch-all):
 *   /api/ingest/static/array.js  → https://eu-assets.i.posthog.com/static/array.js
 *   /api/ingest/decide           → https://eu.i.posthog.com/decide
 *   /api/ingest/e/ · /i/v0/e/    → https://eu.i.posthog.com/…
 *
 * ─── 🔴 QUÉ SALE DE CASA Y QUÉ NO ─────────────────────────────────────────
 * `/api/ingest` es **same-origin**: el navegador le adjunta exactamente lo mismo
 * que a cualquier página nuestra. Aquí eso importa más que en el portal, porque
 * en este sitio vive `tejedor-access`, la cookie que da acceso a los capítulos
 * de pago — filtrarla a un tercero sería regalar credenciales de lectura.
 *
 * Este proxy nació ya bloqueando `cookie` y `authorization` (el portal tardó
 * hasta el 31-jul-2026 en hacerlo; su hallazgo de la SecReview del 13-jul quedó
 * cerrado en `tejidos-de-realidad` PR #246). Pero la denylist dejaba salir dos
 * cosas más, que se cierran ahora pasando a **allowlist** — ver el porqué y las
 * dos fugas concretas en `@/lib/ingest-headers.mjs`.
 *
 * PostHog no necesita nada de eso: su identidad viaja en el cuerpo del evento
 * (`distinct_id`), no en cabeceras.
 */
import type { APIRoute } from 'astro';
import { filtrarPeticion, filtrarRespuesta } from '@/lib/ingest-headers.mjs';

export const prerender = false;

const POSTHOG_API_HOST = 'https://eu.i.posthog.com';
const POSTHOG_ASSETS_HOST = 'https://eu-assets.i.posthog.com';

const handler: APIRoute = async ({ request, params }) => {
  const path = (params.path as string | undefined) ?? '';
  const incomingUrl = new URL(request.url);

  const esAsset = path.startsWith('static/') || path.endsWith('.js') || path.endsWith('.js.map');
  const upstream = esAsset ? POSTHOG_ASSETS_HOST : POSTHOG_API_HOST;
  const target = `${upstream}/${path}${incomingUrl.search}`;

  const headers = filtrarPeticion(request.headers);

  const init: RequestInit = { method: request.method, headers, redirect: 'manual' };
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    init.body = await request.arrayBuffer();
  }

  let upstreamResponse: Response;
  try {
    upstreamResponse = await fetch(target, init);
  } catch {
    // Sin detalle: no se filtra la topología del upstream al cliente.
    return new Response('Bad Gateway', { status: 502 });
  }

  const responseHeaders = filtrarRespuesta(upstreamResponse.headers);

  return new Response(upstreamResponse.body, {
    status: upstreamResponse.status,
    headers: responseHeaders,
  });
};

export const GET = handler;
export const POST = handler;
export const OPTIONS = handler;
