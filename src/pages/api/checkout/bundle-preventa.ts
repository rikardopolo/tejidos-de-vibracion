import type { APIRoute } from 'astro';
import { z } from 'zod';
import { createCheckout } from '@/lib/payments';
import { hashIp, isRateLimited } from '@/lib/brevo';

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

export const POST: APIRoute = async ({ request, clientAddress }) => {
  const ct = request.headers.get('content-type') || '';
  if (!ct.includes('application/json')) {
    return new Response(JSON.stringify({ error: 'invalid_content_type' }), { status: 415 });
  }

  let body: unknown;
  try { body = await request.json(); }
  catch { return new Response(JSON.stringify({ error: 'invalid_json' }), { status: 400 }); }

  const parsed = checkoutSchema.safeParse(body);
  if (!parsed.success) {
    return new Response(
      JSON.stringify({ error: 'invalid_input', issues: parsed.error.issues.map((i) => i.path.join('.')) }),
      { status: 400 },
    );
  }

  // Honeypot: si lo llenan, rechazo sin crear checkout.
  if (parsed.data.website !== '') {
    return new Response(JSON.stringify({ error: 'invalid_input' }), { status: 400 });
  }

  const ipHash = hashIp(clientAddress || 'unknown');
  if (isRateLimited(ipHash)) {
    return new Response(JSON.stringify({ error: 'rate_limited' }), {
      status: 429,
      headers: { 'Retry-After': '60' },
    });
  }

  const variantId = readEnv('LS_VARIANT_BUNDLE_PREVENTA');
  if (!variantId) {
    console.error('[checkout/bundle-preventa] Falta LS_VARIANT_BUNDLE_PREVENTA');
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
    const status = result.reason === 'not_configured' ? 500 : 502;
    return new Response(JSON.stringify({ error: result.reason }), { status });
  }

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
