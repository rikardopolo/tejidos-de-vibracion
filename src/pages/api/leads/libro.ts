import type { APIRoute } from 'astro';
import { upsertContact, sendTransactionalEmail, hashIp, isRateLimited } from '@/lib/brevo';
import { generateAccessToken } from '@/lib/token';
import { getServerClient } from '@/lib/supabase';
import { getGeo } from '@/lib/geo';
import { utmsSaneadas } from '@/lib/utm.mjs';
import { registrarAltaLibro, validarAltaLibro } from '@/lib/alta-libro.mjs';
import { sesionTdvActiva } from '@/lib/cuenta-tdv';

export const prerender = false;

/**
 * POST /api/leads/libro · registro gratis del libro (boletín opcional + nivel 1).
 *
 * Toda la decisión vive en `lib/alta-libro.mjs` (probada con `node --test`):
 *  - esquema zod 3 PROPIO (`altaLibroSchema`): correo, nombre opcional, autorización
 *    obligatoria (`true`) y Cartas opcional;
 *  - `CONSENT_TEXT_LIBRO`, partido en dos (autorización y Cartas), con su versión: es
 *    la evidencia legal (Ley 1581/2012) y el formulario lo pinta desde el mismo sitio;
 *  - un lead que ya existe no se reescribe: solo se le reenvía el enlace;
 *  - sin la casilla de las Cartas no se crea contacto de marketing ni se suscribe;
 *  - saludo neutro sin nombre (parámetro `SALUDO` de la plantilla).
 * Aquí solo: método y content-type, límite por IP, entorno y la E/S real.
 */

const readEnv = (key: string): string | undefined => {
  if (typeof process !== 'undefined' && process.env) {
    const p = process.env[key];
    if (p !== undefined && p !== '') return p;
  }
  const m = (import.meta.env as Record<string, string | undefined>)[key];
  if (m !== undefined && m !== '') return m;
  return undefined;
};

const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });

export const POST: APIRoute = async ({ request, clientAddress }) => {
  if (sesionTdvActiva()) return json(409, { error: 'usa_tu_cuenta', destino: '/auth/entrar?next=%2Fobertura' });
  // Solo aceptar JSON
  const ct = request.headers.get('content-type') || '';
  if (!ct.includes('application/json')) return json(415, { error: 'invalid_content_type' });

  let body: unknown;
  try { body = await request.json(); }
  catch { return json(400, { error: 'invalid_json' }); }

  // Fuera del esquema a propósito: las UTMs son metadato de atribución y no deben poder
  // invalidar un alta. `z.object()` descarta las claves extra: se leen del cuerpo crudo.
  const utms = utmsSaneadas((body as Record<string, unknown> | null)?.utm);

  const v = validarAltaLibro(body);
  if (!v.ok) return json(400, { error: 'invalid_input', issues: v.issues });

  // Rate limit por IP hash
  const ipHash = hashIp(clientAddress || 'unknown');
  if (isRateLimited(ipHash)) return json(429, { error: 'rate_limited' }, { 'Retry-After': '60' });

  const apiKey = readEnv('BREVO_API_KEY');
  const templateIdRaw = readEnv('BREVO_TEMPLATE_DOI');
  const tokenSecret = readEnv('ACCESS_TOKEN_SECRET');
  const siteUrl = readEnv('PUBLIC_SITE_URL') || readEnv('SITE_URL') || 'https://tejidosdevibracion.com';

  if (!apiKey || !templateIdRaw || !tokenSecret) {
    console.error('Missing env vars: BREVO_API_KEY/BREVO_TEMPLATE_DOI/ACCESS_TOKEN_SECRET');
    return json(500, { error: 'server_misconfigured' });
  }

  const templateId = Number(templateIdRaw);
  if (Number.isNaN(templateId)) return json(500, { error: 'server_misconfigured' });

  const r = await registrarAltaLibro(
    {
      datos: v.datos,
      utm: utms,
      ipHash,
      userAgent: request.headers.get('user-agent')?.slice(0, 500) ?? null,
      geo: getGeo(request),
    },
    {
      supabase: getServerClient(),
      upsertContact: (o) => upsertContact({ ...o, apiKey }),
      // Plantilla DOI (#9): usa {{params.SALUDO}} («Hola, Ana:» o «Hola:») y
      // {{params.CONFIRMATION_URL}}. NOMBRE solo llega si hay nombre.
      enviarEnlace: ({ email, name, params }) =>
        sendTransactionalEmail({ to: { email, name }, templateId, params, apiKey }),
      urlConfirmacion: (correo) =>
        `${siteUrl}/bienvenido?t=${encodeURIComponent(generateAccessToken(correo, tokenSecret))}`,
    },
  );
  return json(r.status, r.body);
};

export const ALL: APIRoute = () => {
  return new Response(JSON.stringify({ error: 'method_not_allowed' }), {
    status: 405,
    headers: { Allow: 'POST' },
  });
};
