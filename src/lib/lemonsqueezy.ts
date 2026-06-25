/**
 * lemonsqueezy.ts · Cliente server-only de Lemon Squeezy (Merchant of Record).
 *
 * Espejo de brevo.ts: lee envs runtime-first, degrada con gracia si faltan, y
 * nunca lanza hacia el endpoint (devuelve un Result discriminado).
 *
 * La lógica PURA del payload vive en ./lemonsqueezy-payload.mjs (testeable con
 * `node --test`, sin red ni env). Aquí solo va el efecto (fetch).
 */
import { buildCheckoutPayload, extractCheckoutUrl } from './lemonsqueezy-payload.mjs';

const LS_API_BASE = 'https://api.lemonsqueezy.com/v1';

function readEnv(key: string): string | undefined {
  // trim: un espacio invisible pegado al valor en el dashboard no debe romper la
  // llamada (p.ej. variant_id "1817937 " -> 404 de LS al variant inexistente).
  const pick = (v: string | undefined) => (v && v.trim() !== '' ? v.trim() : undefined);
  if (typeof process !== 'undefined' && process.env) {
    const p = pick(process.env[key]);
    if (p) return p;
  }
  return pick((import.meta.env as Record<string, string | undefined>)[key]);
}

export type CheckoutResult =
  | { ok: true; url: string }
  | { ok: false; reason: 'not_configured' | 'api_error'; status?: number; message?: string };

/**
 * Crea un checkout en Lemon Squeezy y devuelve su URL. El modo test/live lo
 * determina la API key configurada (no el payload).
 */
export async function createCheckout(opts: {
  variantId: string;
  email?: string;
  leadId?: string;
  productSlug: string;
}): Promise<CheckoutResult> {
  const apiKey = readEnv('LEMONSQUEEZY_API_KEY');
  const storeId = readEnv('LS_STORE_ID');
  if (!apiKey || !storeId) return { ok: false, reason: 'not_configured' };

  const payload = buildCheckoutPayload({
    storeId,
    variantId: opts.variantId,
    email: opts.email,
    leadId: opts.leadId,
    productSlug: opts.productSlug,
  });

  try {
    const res = await fetch(`${LS_API_BASE}/checkouts`, {
      method: 'POST',
      headers: {
        Accept: 'application/vnd.api+json',
        'Content-Type': 'application/vnd.api+json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(payload),
    });

    const text = await res.text();
    if (res.status === 201) {
      let url: string | null = null;
      try { url = extractCheckoutUrl(JSON.parse(text)); } catch { /* respuesta no-JSON */ }
      if (url) return { ok: true, url };
      return { ok: false, reason: 'api_error', status: res.status, message: 'respuesta sin url' };
    }
    console.error(`[lemonsqueezy createCheckout] status=${res.status} body=${text.slice(0, 300)}`);
    return { ok: false, reason: 'api_error', status: res.status, message: text.slice(0, 300) };
  } catch (e) {
    console.error('[lemonsqueezy createCheckout] fetch threw:', e);
    return { ok: false, reason: 'api_error', message: String(e).slice(0, 300) };
  }
}
