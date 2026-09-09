/**
 * payments.ts · Punto único de acoplamiento con la pasarela de pago.
 *
 * Hoy hay DOS proveedores posibles y los desempata una env, no el código:
 *
 * - **Stripe Managed Payments** (`STRIPE_PAYMENT_LINK`) · comerciante registrado
 *   = Link, LLC. El enlace de pago es estático: no hay llamada a ninguna API, ni
 *   clave, ni modo de fallo. El importe, el producto y el redirect post-pago
 *   viven en el dashboard de Stripe.
 * - **Lemon Squeezy clásico** (`LS_VARIANT_BUNDLE_PREVENTA`) · el de siempre,
 *   que crea el checkout por API. Se queda como camino de vuelta mientras la
 *   cuenta de Stripe no esté verificada.
 *
 * Si `STRIPE_PAYMENT_LINK` está puesta, manda Stripe. Es un `if`, no una
 * interfaz de proveedores: no hay tercer candidato ni lo habrá.
 *
 * El endpoint de checkout importa SOLO desde aquí.
 */
import { createCheckout as createCheckoutLS } from './lemonsqueezy';
import type { CheckoutResult } from './lemonsqueezy';

export type { CheckoutResult } from './lemonsqueezy';

function readEnv(key: string): string | undefined {
  // trim: un espacio invisible pegado al valor en el dashboard de Vercel rompía
  // el checkout de LS con un 404 al variant inexistente. Vale igual para una URL.
  const pick = (v: string | undefined) => (v && v.trim() !== '' ? v.trim() : undefined);
  if (typeof process !== 'undefined' && process.env) {
    const p = pick(process.env[key]);
    if (p) return p;
  }
  return pick((import.meta.env as Record<string, string | undefined>)[key]);
}

export async function createCheckout(opts: {
  email?: string;
  leadId?: string;
  productSlug: string;
}): Promise<CheckoutResult> {
  const enlaceStripe = readEnv('STRIPE_PAYMENT_LINK');
  if (enlaceStripe) return { ok: true, url: enlaceStripe };

  const variantId = readEnv('LS_VARIANT_BUNDLE_PREVENTA');
  if (!variantId) return { ok: false, reason: 'not_configured' };
  return createCheckoutLS({ variantId, ...opts });
}
