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
 * ─── 🔴 POR QUÉ ESTO NO ES UNA COPIA DEL PROXY DEL PORTAL ──────────────────
 * El equivalente en `tejidos-de-realidad` (`apps/portal/src/pages/api/ingest/`)
 * reenvía TODAS las cabeceras salvo las hop-by-hop — y `cookie` no está en esa
 * lista, así que las cookies del navegador viajan a PostHog. La SecReview del
 * 13-jul-2026 lo marcó como hallazgo abierto.
 *
 * Aquí ese fallo NO se replica: `cookie` y `authorization` se eliminan
 * explícitamente. En este sitio importa todavía más que en el portal, porque
 * aquí vive `tejedor-access`, la cookie que da acceso a los capítulos de pago:
 * filtrarla a un tercero sería regalar credenciales de lectura.
 *
 * PostHog no necesita ninguna de las dos: su identidad viaja en el cuerpo del
 * evento (`distinct_id`), no en cabeceras.
 */
import type { APIRoute } from 'astro';

export const prerender = false;

const POSTHOG_API_HOST = 'https://eu.i.posthog.com';
const POSTHOG_ASSETS_HOST = 'https://eu-assets.i.posthog.com';

/** Cabeceras que nunca se reenvían aguas arriba. */
const HEADERS_BLOQUEADAS = new Set([
  // ── Credenciales · el fix respecto del portal ──
  'cookie',
  'authorization',
  // ── Hop-by-hop (RFC 9110) ──
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
  'host',
  'content-length',
  // El runtime descomprime el body pero conserva el header; reenviar ambos hace
  // que el cliente intente descomprimir bytes ya descomprimidos → respuesta vacía.
  'content-encoding',
]);

const handler: APIRoute = async ({ request, params }) => {
  const path = (params.path as string | undefined) ?? '';
  const incomingUrl = new URL(request.url);

  const esAsset = path.startsWith('static/') || path.endsWith('.js') || path.endsWith('.js.map');
  const upstream = esAsset ? POSTHOG_ASSETS_HOST : POSTHOG_API_HOST;
  const target = `${upstream}/${path}${incomingUrl.search}`;

  const headers = new Headers();
  request.headers.forEach((value, key) => {
    if (!HEADERS_BLOQUEADAS.has(key.toLowerCase())) headers.set(key, value);
  });

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

  const responseHeaders = new Headers();
  upstreamResponse.headers.forEach((value, key) => {
    const k = key.toLowerCase();
    // `set-cookie` del upstream tampoco se propaga: PostHog no debe poder
    // escribir cookies en nuestro dominio a través del proxy.
    if (k === 'set-cookie' || HEADERS_BLOQUEADAS.has(k)) return;
    responseHeaders.set(key, value);
  });

  return new Response(upstreamResponse.body, {
    status: upstreamResponse.status,
    headers: responseHeaders,
  });
};

export const GET = handler;
export const POST = handler;
export const OPTIONS = handler;
