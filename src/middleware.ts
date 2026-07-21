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
 */
import { defineMiddleware } from 'astro:middleware';
import * as Sentry from '@sentry/astro';
import '../sentry.server.config.js';

export const onRequest = defineMiddleware(async (_ctx, next) => {
  try {
    return await next();
  } catch (err) {
    // Captura server-only + flush antes de que la función serverless se congele.
    // No-op si Sentry no está inicializado (dev local / forks sin DSN).
    Sentry.captureException(err);
    await Sentry.flush(2000);
    throw err;
  }
});
