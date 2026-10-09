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
import { esUrlDePago, esEnlaceDePruebaStripe } from '@/lib/url-pago.mjs';
import { esPreview } from '@/lib/gating';

export const prerender = false;

/**
 * Devuelve la URL de pago del Bundle de pre-venta ($26); el front redirige
 * (D1=c, sin overlay ni JS de terceros → CSP intacta).
 *
 * Qué proveedor y en qué modo (prueba o real) lo decide el entorno, en
 * `payments.ts`. Este endpoint existe aunque el enlace sea estático: es donde se
 * cuenta CADA intento de compra (`events.checkout_intento`), se frena el ritmo y
 * se valida a dónde mandamos a la gente. Sin él, «cuánta gente lo intentó»
 * vuelve a ser un número que nadie tiene.
 */

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

  // Qué proveedor y con qué datos lo decide `payments.ts` a partir del entorno.
  const result = await createCheckout({
    email: parsed.data.correo,
    leadId: parsed.data.lead_id,
    productSlug: PRODUCT_SLUG,
  });

  if (!result.ok) {
    // `result` ya no lleva cuerpo del proveedor (lemonsqueezy.ts devuelve reason +
    // status), así que es seguro loguearlo entero y es lo único que distingue
    // «LS caído» de «nuestro payload es inválido».
    console.error('[checkout/bundle-preventa] createCheckout falló:', result);
    // Sin pasarela configurada no hay «caída del proveedor» que diagnosticar:
    // es un fallo NUESTRO y se cuenta aparte, para que no ensucie el recuento de
    // errores del proveedor con algo que se arregla poniendo una env.
    if (result.reason === 'not_configured') {
      await registraIntento('mal_configurado', { falta: 'STRIPE_PAYMENT_LINK' });
      return new Response(JSON.stringify({ error: 'not_configured' }), { status: 500 });
    }
    await registraIntento('error_proveedor', {
      motivo: result.reason ?? null,
      estado_proveedor: result.status ?? null,
      causa: result.causa ?? null,
    });
    return new Response(JSON.stringify({ error: result.reason }), { status: 502 });
  }

  // El host del checkout se valida AQUÍ, donde se parsea la respuesta del
  // proveedor y donde hay tests, no en el navegador: la lista de dominios que
  // vivía en `public/comprar-checkout.js` caducó en silencio y tiró todas las
  // ventas. Si esto salta, se ve en `events` en vez de morir dentro del navegador.
  if (!esUrlDePago(result.url)) {
    console.error('[checkout/bundle-preventa] host inesperado en checkout_url:', result.url);
    await registraIntento('error_proveedor', { motivo: 'host_inesperado' });
    return new Response(JSON.stringify({ error: 'invalid_checkout_url' }), { status: 502 });
  }

  // Un enlace de PRUEBA de Stripe en producción abre un checkout impecable y no
  // cobra nada: se rompe pareciéndose al éxito. Preferimos no vender a vender de
  // mentira. En preview sí se permite, que es donde se prueba.
  if (!esPreview() && esEnlaceDePruebaStripe(result.url)) {
    console.error('[checkout/bundle-preventa] enlace de PRUEBA de Stripe en producción:', result.url);
    await registraIntento('mal_configurado', { motivo: 'enlace_de_prueba' });
    return new Response(JSON.stringify({ error: 'server_misconfigured' }), { status: 500 });
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
