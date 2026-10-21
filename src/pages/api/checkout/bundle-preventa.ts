import type { APIRoute } from 'astro';

export const prerender = false;

/** La venta terminó; no se leen datos ni se contacta al proveedor de pagos. */
export const ALL: APIRoute = () => Response.json({
  error: 'oferta_retirada',
  mensaje: 'Esta oferta ya no está disponible. Puedes conocer la suscripción Acceso al Tejedor. Si ya compraste, conservas tu acceso.',
  suscripcion_url: '/suscribirse',
}, { status: 410, headers: { 'Cache-Control': 'no-store' } });

export const POST = ALL;
