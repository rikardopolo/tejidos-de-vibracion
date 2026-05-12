import type { APIRoute } from 'astro';
import {
  leadSchema,
  upsertContact,
  sendTransactionalEmail,
  hashIp,
  isRateLimited,
} from '@/lib/brevo';
import { generateAccessToken } from '@/lib/token';

export const prerender = false;

const readEnv = (key: string): string | undefined => {
  if (typeof process !== 'undefined' && process.env) {
    const p = process.env[key];
    if (p !== undefined && p !== '') return p;
  }
  const m = (import.meta.env as Record<string, string | undefined>)[key];
  if (m !== undefined && m !== '') return m;
  return undefined;
};

export const POST: APIRoute = async ({ request, clientAddress }) => {
  // Solo aceptar JSON
  const ct = request.headers.get('content-type') || '';
  if (!ct.includes('application/json')) {
    return new Response(JSON.stringify({ error: 'invalid_content_type' }), { status: 415 });
  }

  let body: unknown;
  try { body = await request.json(); }
  catch { return new Response(JSON.stringify({ error: 'invalid_json' }), { status: 400 }); }

  const parsed = leadSchema.safeParse(body);
  if (!parsed.success) {
    return new Response(
      JSON.stringify({
        error: 'invalid_input',
        issues: parsed.error.issues.map(i => i.path.join('.')),
      }),
      { status: 400 }
    );
  }

  // Honeypot: éxito silencioso si lo llenan (Zod ya hizo refuse, pero por si acaso)
  if (parsed.data.website !== '') {
    return new Response(JSON.stringify({ success: true }), { status: 200 });
  }

  // Rate limit por IP hash
  const ipHash = hashIp(clientAddress || 'unknown');
  if (isRateLimited(ipHash)) {
    return new Response(JSON.stringify({ error: 'rate_limited' }), {
      status: 429,
      headers: { 'Retry-After': '60' },
    });
  }

  const apiKey = readEnv('BREVO_API_KEY');
  const templateIdRaw = readEnv('BREVO_TEMPLATE_DOI');
  const tokenSecret = readEnv('ACCESS_TOKEN_SECRET');
  const siteUrl = readEnv('PUBLIC_SITE_URL') || readEnv('SITE_URL') || 'https://tejidosdevibracion.com';

  if (!apiKey || !templateIdRaw || !tokenSecret) {
    console.error('Missing env vars: BREVO_API_KEY/BREVO_TEMPLATE_DOI/ACCESS_TOKEN_SECRET');
    return new Response(JSON.stringify({ error: 'server_misconfigured' }), { status: 500 });
  }

  const templateId = Number(templateIdRaw);
  if (Number.isNaN(templateId)) {
    return new Response(JSON.stringify({ error: 'server_misconfigured' }), { status: 500 });
  }

  // 1. Crear contacto en Brevo (sin lista todavía, así el workflow no se dispara)
  const upsert = await upsertContact({
    email: parsed.data.correo,
    apiKey,
    attributes: {
      NOMBRE: parsed.data.nombre,
      NIVEL: 'tejedor',
      FUENTE: 'registro-libro',
      DOI_PENDIENTE: 'true',
    },
  });

  if (!upsert.ok) {
    console.error('Brevo upsertContact failed:', upsert);
    return new Response(JSON.stringify({ error: 'brevo_failed' }), { status: 502 });
  }

  // 2. Generar token HMAC y URL de confirmación
  const token = generateAccessToken(parsed.data.correo, tokenSecret);
  const confirmationUrl = `${siteUrl}/bienvenido?t=${encodeURIComponent(token)}`;

  // 3. Enviar email transaccional (template #9) con CONFIRMATION_URL como parámetro
  const sent = await sendTransactionalEmail({
    to: { email: parsed.data.correo, name: parsed.data.nombre },
    templateId,
    params: {
      NOMBRE: parsed.data.nombre,
      CONFIRMATION_URL: confirmationUrl,
    },
    apiKey,
  });

  if (!sent.ok) {
    console.error('Brevo sendTransactionalEmail failed:', sent);
    return new Response(JSON.stringify({ error: 'email_send_failed' }), { status: 502 });
  }

  return new Response(
    JSON.stringify({
      success: true,
      nombre: parsed.data.nombre,
      message: 'Te enviamos un correo. Revisa tu inbox para confirmar.',
    }),
    { status: 201, headers: { 'Content-Type': 'application/json' } }
  );
};

export const ALL: APIRoute = () => {
  return new Response(JSON.stringify({ error: 'method_not_allowed' }), {
    status: 405,
    headers: { Allow: 'POST' },
  });
};
