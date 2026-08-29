/**
 * Middleware · inicializa y captura Sentry (server-only).
 *
 * `@sentry/astro` NO auto-inicializa su server config bajo Astro 7, así que lo
 * importamos aquí por su efecto (Sentry.init) — el middleware sí se evalúa en la
 * función serverless. Con `output: 'static'` cubre las rutas on-demand
 * (`prerender=false`): endpoints /api/* (webhook LS, checkout, leads, track) y
 * páginas SSR (obertura, capítulo, acceso). Envuelve `next()` para reportar
 * cualquier error no manejado. Transparente para todo lo demás (no toca auth ni
 * lógica de negocio; el gating del libro vive en lib/gating.ts).
 *
 * Segunda responsabilidad: negociar la variante markdown del 404 para agentes
 * (lib/agent-md.mjs). Es la única rama que lee cabeceras de la petición, y solo
 * después de `next()` — ver el comentario de abajo.
 */
import { defineMiddleware } from 'astro:middleware';
import * as Sentry from '@sentry/astro';
import '../sentry.server.config.js';
import { apply404Negotiation } from '@/lib/agent-md.mjs';

export const onRequest = defineMiddleware(async (context, next) => {
  try {
    const res = await next();

    // 404 de páginas (catch-all del adapter → SSR): variante markdown si el
    // agente la pide + `Vary: Accept` en ambas variantes. Ver lib/agent-md.mjs.
    // El header Accept se lee SOLO en la rama 404: leer request.headers durante
    // el prerender de una página estática emite un WARN por página — y en
    // prerender nunca hay 404.
    if (res.status !== 404) return res;
    return apply404Negotiation(context.url.pathname, context.request.headers.get('accept'), res);
  } catch (err) {
    // Captura server-only + flush antes de que la función serverless se congele.
    // No-op si Sentry no está inicializado (dev local / forks sin DSN).
    Sentry.captureException(err);
    await Sentry.flush(2000);
    throw err;
  }
});
