import type { APIRoute } from 'astro';
import { z } from 'zod';
import { createCheckout } from '@/lib/payments';
import { hashIp, isRateLimited } from '@/lib/brevo';
import { getServerClient } from '@/lib/supabase';
import {
  registraIntento as registra,
  type ClienteRegistro,
  type Desenlace,
} from '@/lib/checkout-intento.mjs';
import { esUrlDePago } from '@/lib/url-pago.mjs';

export const prerender = false;

/**
 * Crea un checkout de Lemon Squeezy para el Bundle de pre-venta ($26) y devuelve
 * su URL; el front redirige (D1=c, sin overlay ni JS de terceros → CSP intacta).
 *
 * El email es opcional (prefill); `lead_id` viaja como custom data para conciliar
 * la compra con el lead Brevo en el webhook (Fase 3). El modo test/live lo
 * determina la API key configurada en el entorno.
 */

const readEnv = (key: string): string | undefined => {
  // trim: un espacio invisible en el valor (p.ej. variant_id "1817937 ") rompía
  // el checkout con un 404 de LS al variant inexistente.
  const pick = (v: string | undefined) => (v && v.trim() !== '' ? v.trim() : undefined);
  if (typeof process !== 'undefined' && process.env) {
    const p = pick(process.env[key]);
    if (p) return p;
  }
  return pick((import.meta.env as Record<string, string | undefined>)[key]);
};

const PRODUCT_SLUG = 'bundle-preventa';

const checkoutSchema = z.object({
  correo: z.string().email().max(254).optional(),
  lead_id: z.string().max(64).optional(),
  website: z.string().max(0), // honeypot: debe venir vacío
});

/**
 * Registro del intento · la lógica y su porqué viven en `@/lib/checkout-intento`
 * (allí se pueden testear; en `pages/api/*.ts` no). Aquí solo se inyecta el
 * cliente y se llama en cada salida.
 */
async function registraIntento(desenlace: Desenlace, extra: Record<string, unknown> = {}) {
  await registra(getServerClient() as ClienteRegistro | null, desenlace, extra);
}

export const POST: APIRoute = async ({ request, clientAddress }) => {
  const iniciado = Date.now();
  const ct = request.headers.get('content-type') || '';
  if (!ct.includes('application/json')) {
    await registraIntento('rechazado_formato', { motivo: 'content_type' });
    return new Response(JSON.stringify({ error: 'invalid_content_type' }), { status: 415 });
  }

  let body: unknown;
  try { body = await request.json(); }
  catch {
    await registraIntento('rechazado_formato', { motivo: 'json_ilegible' });
    return new Response(JSON.stringify({ error: 'invalid_json' }), { status: 400 });
  }

  const parsed = checkoutSchema.safeParse(body);
  if (!parsed.success) {
    await registraIntento('rechazado_datos', { campos: parsed.error.issues.map((i) => i.path.join('.')) });
    return new Response(
      JSON.stringify({ error: 'invalid_input', issues: parsed.error.issues.map((i) => i.path.join('.')) }),
      { status: 400 },
    );
  }

  // Honeypot: si lo llenan, rechazo sin crear checkout.
  if (parsed.data.website !== '') {
    // Casi con seguridad un bot · se cuenta aparte para no inflar el número de
    // personas que de verdad intentaron comprar.
    await registraIntento('honeypot');
    return new Response(JSON.stringify({ error: 'invalid_input' }), { status: 400 });
  }

  const ipHash = hashIp(clientAddress || 'unknown');
  if (isRateLimited(ipHash)) {
    // Se registra: un pico de intentos limitados es indistinguible del silencio
    // si no se cuenta, y es justo la señal de que algo va mal.
    await registraIntento('limitado_por_ritmo');
    return new Response(JSON.stringify({ error: 'rate_limited' }), {
      status: 429,
      headers: { 'Retry-After': '60' },
    });
  }

  const variantId = readEnv('LS_VARIANT_BUNDLE_PREVENTA');
  if (!variantId) {
    console.error('[checkout/bundle-preventa] Falta LS_VARIANT_BUNDLE_PREVENTA');
    await registraIntento('mal_configurado', { falta: 'LS_VARIANT_BUNDLE_PREVENTA' });
    return new Response(JSON.stringify({ error: 'server_misconfigured' }), { status: 500 });
  }

  const result = await createCheckout({
    variantId,
    email: parsed.data.correo,
    leadId: parsed.data.lead_id,
    productSlug: PRODUCT_SLUG,
  });

  if (!result.ok) {
    console.error('[checkout/bundle-preventa] createCheckout falló:', result);
    await registraIntento('error_proveedor', { motivo: result.reason ?? null });
    const status = result.reason === 'not_configured' ? 500 : 502;
    return new Response(JSON.stringify({ error: result.reason }), { status });
  }

  // El host del checkout se valida AQUÍ, donde se parsea la respuesta de LS y
  // donde hay tests, no en el navegador: la lista de dominios que vivía en
  // `public/comprar-checkout.js` caducó en silencio y tiró todas las ventas.
  // Si esto salta, se ve en `events` en vez de morir dentro del navegador.
  if (!esUrlDePago(result.url)) {
    console.error('[checkout/bundle-preventa] host inesperado en checkout_url:', result.url);
    await registraIntento('error_proveedor', { motivo: 'host_inesperado' });
    return new Response(JSON.stringify({ error: 'invalid_checkout_url' }), { status: 502 });
  }

  await registraIntento('checkout_creado', {
    con_correo: Boolean(parsed.data.correo),
    lead_id: parsed.data.lead_id ?? null,
    ms: Date.now() - iniciado,
  });
  return new Response(JSON.stringify({ checkout_url: result.url }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};

export const ALL: APIRoute = () =>
  new Response(JSON.stringify({ error: 'method_not_allowed' }), {
    status: 405,
    headers: { Allow: 'POST' },
  });
