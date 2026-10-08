import type { APIRoute } from 'astro';
import * as Sentry from '@sentry/astro';
import { z } from 'zod';
import { createCheckout } from '@/lib/payments';
import { isRateLimited } from '@/lib/brevo';
import { getServerClient } from '@/lib/supabase';
import { leerSesionTdv, portalAutorizarUrl } from '@/lib/cuenta-tdv';
import { esMismoOrigen } from '@/lib/salto-tdv.mjs';
import {
  registraIntento as registra,
  ORIGEN_SUSCRIPCION,
  PRODUCTO_SUSCRIPCION,
  type ClienteRegistro,
  type Desenlace,
} from '@/lib/checkout-intento.mjs';
import {
  checkoutSuscripcionActivo,
  prepararCheckoutSuscripcion,
  urlCuentaPortal,
  variantesDePlan,
} from '@/lib/checkout-suscripcion.mjs';

export const prerender = false;

/**
 * POST /api/checkout/suscripcion · `{ plan: 'mensual' | 'anual' }` → `{ checkout_url }`.
 * S-13 (plan v2 §7.6). La decisión vive en `checkout-suscripcion.mjs` (probada con un
 * cliente falso); aquí solo la E/S:
 *  - Interruptor `SUSCRIPCION_CHECKOUT_ENABLED` (apagado por defecto = reversión):
 *    apagado, el endpoint no existe (404).
 *  - JSON y mismo origen (`Origin` o `Sec-Fetch-Site`): `checkOrigin` de Astro no
 *    mira `application/json`.
 *  - Exige la sesión del libro y el correo verificado de la cuenta; sin `lead_id`.
 *  - El front redirige con `location.href` a la URL devuelta (sin `<form>` hacia
 *    fuera, que `form-action 'self'` bloquearía).
 */

const readEnv = (key: string): string | undefined => {
  const pick = (v: string | undefined) => (v && v.trim() !== '' ? v.trim() : undefined);
  if (typeof process !== 'undefined' && process.env) {
    const p = pick(process.env[key]);
    if (p) return p;
  }
  return pick((import.meta.env as Record<string, string | undefined>)[key]);
};

// El interruptor se lee con `readEnv` (runtime primero, `.env` como respaldo): en
// `astro dev` Astro solo vuelca el `.env` a `process.env` al COMPILAR, así que con el
// `process.env` por defecto el endpoint respondería 404 en local aunque el `.env` lo
// encienda.
const activo = () => checkoutSuscripcionActivo({ SUSCRIPCION_CHECKOUT_ENABLED: readEnv('SUSCRIPCION_CHECKOUT_ENABLED') });

const schema = z.object({
  plan: z.enum(['mensual', 'anual']), // = PLANES de checkout-suscripcion.mjs
  website: z.string().max(0).optional(), // honeypot opcional: si viene, vacío
});

const NO_CACHE = { 'Cache-Control': 'private, no-store' };

const json = (status: number, obj: unknown, extra: Record<string, string> = {}) =>
  new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json', ...NO_CACHE, ...extra } });

async function registraIntento(desenlace: Desenlace, extra: Record<string, unknown> = {}) {
  await registra(getServerClient() as ClienteRegistro | null, desenlace, extra, {
    origen: ORIGEN_SUSCRIPCION,
    producto: PRODUCTO_SUSCRIPCION,
  });
}

let configRotaAvisada = false;
async function avisarConfigRota(extra: Record<string, unknown> | undefined): Promise<void> {
  console.error('[checkout/suscripcion] configuración incompleta · checkout CERRADO:', extra ?? {});
  if (configRotaAvisada) return;
  configRotaAvisada = true;
  try {
    Sentry.captureMessage('checkout/suscripcion: configuración incompleta · no se puede suscribir', 'error');
    await Sentry.flush(2000);
  } catch {
    /* el aviso nunca rompe la respuesta */
  }
}

export const POST: APIRoute = async ({ request, url, cookies }) => {
  if (!activo()) return json(404, { error: 'not_found' });

  if (!esMismoOrigen(request.headers, url.origin)) {
    await registraIntento('rechazado_formato', { motivo: 'origen' });
    return json(403, { error: 'forbidden_origin' });
  }
  const ct = request.headers.get('content-type') || '';
  if (!ct.includes('application/json')) {
    await registraIntento('rechazado_formato', { motivo: 'content_type' });
    return json(415, { error: 'invalid_content_type' });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    await registraIntento('rechazado_formato', { motivo: 'json_ilegible' });
    return json(400, { error: 'invalid_json' });
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    await registraIntento('rechazado_datos', { campos: parsed.error.issues.map((i) => i.path.join('.')) });
    return json(400, { error: 'invalid_input', issues: parsed.error.issues.map((i) => i.path.join('.')) });
  }
  if (parsed.data.website) {
    await registraIntento('honeypot');
    return json(400, { error: 'invalid_input' });
  }

  const sesion = leerSesionTdv(cookies);
  const r = await prepararCheckoutSuscripcion({
    sesion,
    // Un checkout por minuto y CUENTA (en memoria, por instancia): cada uno crea una
    // fila y un checkout en Lemon Squeezy. Solo cuenta lo que pasa sesión y correo
    // verificado: quien acaba de confirmar el correo no espera un minuto.
    limitado: (aid) => isRateLimited(`suscripcion:${aid}`),
    plan: parsed.data.plan,
    client: getServerClient(),
    secretCustom: readEnv('LS_CUSTOM_SECRET'),
    variantes: variantesDePlan(readEnv),
    crearCheckout: (o) => createCheckout(o),
    cuentaPortalUrl: urlCuentaPortal(portalAutorizarUrl()),
  });

  if (r.aviso === 'config') await avisarConfigRota(r.extra);
  else if (r.status >= 500) console.error('[checkout/suscripcion] fallo:', r.desenlace, r.extra ?? {});
  await registraIntento(r.desenlace, r.extra ?? {});
  return json(r.status, r.body, r.status === 429 ? { 'Retry-After': '60' } : {});
};

export const ALL: APIRoute = () => {
  if (!activo()) return json(404, { error: 'not_found' });
  return json(405, { error: 'method_not_allowed' }, { Allow: 'POST' });
};
