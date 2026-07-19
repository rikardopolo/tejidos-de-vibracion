/**
 * GET /api/health — healthcheck para monitoreo externo (UptimeRobot).
 * Ligero: 200 + latencia, sin tocar Supabase/Brevo/LS (el uptime del sitio
 * no debe acoplarse a la salud de terceros → evita falsos rojos).
 */
import type { APIRoute } from 'astro';

export const prerender = false;

// ponytail: healthcheck mínimo; sin dependencias externas.
export const GET: APIRoute = () =>
  new Response(JSON.stringify({ ok: true, service: 'tdv-libro', ts: Date.now() }), {
    status: 200,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    },
  });
