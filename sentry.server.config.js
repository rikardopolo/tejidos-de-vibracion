// Sentry · SOLO servidor. Con output:'static' esto cubre exclusivamente las
// funciones serverless (endpoints /api/* y rutas prerender=false: webhook LS,
// checkout, leads, track, health, obertura/capítulo SSR, acceso) — el HTML
// estático no tiene runtime y no se reporta (correcto: el valor está en el
// camino del dinero).
//
// El SDK de navegador está desactivado en astro.config (enabled.client:false) →
// cero scripts inyectados, la CSP (script-src 'self') queda intacta.
//
// DSN vía process.env (runtime-first, patrón readEnv del repo: fuente de verdad
// = dashboard de Vercel). Sin DSN → Sentry desactivado (degrada con gracia).
import * as Sentry from '@sentry/astro';

// Query params que transportan tokens: t = token de registro (/bienvenido?t=) y
// de compra (/acceso?t=). Nunca deben llegar a Sentry.
const QUERY_SENSIBLE = ['t', 'token', 'code', 'access_token', 'session'];
const HEADER_SENSIBLE = /^(authorization|proxy-authorization|cookie|x-api-key|x-auth-token|x-signature)$/i;

function limpiarUrl(urlLike) {
  try {
    const u = new URL(urlLike, 'http://localhost');
    for (const p of QUERY_SENSIBLE) u.searchParams.delete(p);
    const qs = u.searchParams.toString();
    return /^https?:\/\//i.test(urlLike) ? u.toString() : u.pathname + (qs ? `?${qs}` : '');
  } catch {
    return String(urlLike).split('?')[0];
  }
}

const dsn = (process.env.SENTRY_DSN || '').trim();

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.VERCEL_ENV || 'development',
    // Solo errores: sin tracing (cuota y ruido; los tiempos ya viven en Vercel).
    tracesSampleRate: 0,
    // Cinturón: no recolectar PII por defecto…
    sendDefaultPii: false,
    dataCollection: {
      userInfo: false,
      cookies: false,
      httpHeaders: { request: false, response: false },
      urlQueryParams: false,
      httpBodies: [],
    },
    // …y tirantes: scrubbing defensivo por si algún camino puebla el evento igual.
    beforeSend(event) {
      delete event.user;
      const req = event.request;
      if (req) {
        if (req.headers && typeof req.headers === 'object') {
          for (const key of Object.keys(req.headers)) {
            if (HEADER_SENSIBLE.test(key)) req.headers[key] = '[Filtered]';
          }
        }
        delete req.cookies;
        delete req.data;
        if (typeof req.url === 'string') req.url = limpiarUrl(req.url);
        // query_string puede venir como string u objeto/tuplas → fuera siempre
        // (la parte inocua ya viaja dentro de req.url limpio).
        delete req.query_string;
      }
      return event;
    },
  });
}
