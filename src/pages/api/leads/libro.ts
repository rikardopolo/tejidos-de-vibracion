import type { APIRoute } from 'astro';
import { leadSchema, createDoiContact, hashIp, isRateLimited } from '@/lib/brevo';
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

  // Honeypot: éxito silencioso si lo llenan
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
  const listIdRaw = readEnv('BREVO_LISTA_LIBRO');
  const templateIdRaw = readEnv('BREVO_TEMPLATE_DOI');
  const tokenSecret = readEnv('ACCESS_TOKEN_SECRET');
  const siteUrl = readEnv('PUBLIC_SITE_URL') || readEnv('SITE_URL') || 'https://tejidosdevibracion.com';

  if (!apiKey || !listIdRaw || !templateIdRaw || !tokenSecret) {
    console.error('Missing env vars: BREVO_API_KEY/BREVO_LISTA_LIBRO/BREVO_TEMPLATE_DOI/ACCESS_TOKEN_SECRET');
    return new Response(JSON.stringify({ error: 'server_misconfigured' }), { status: 500 });
  }

  const listId = Number(listIdRaw);
  const templateId = Number(templateIdRaw);
  if (Number.isNaN(listId) || Number.isNaN(templateId)) {
    return new Response(JSON.stringify({ error: 'server_misconfigured' }), { status: 500 });
  }

  // Generamos token HMAC ahora y lo pasamos en la redirectionUrl
  // /bienvenido lo validará y seteará la cookie
  const token = generateAccessToken(parsed.data.correo, tokenSecret);
  const redirectionUrl = `${siteUrl}/bienvenido?t=${encodeURIComponent(token)}`;

  const result = await createDoiContact({
    email: parsed.data.correo,
    apiKey,
    listId,
    templateId,
    redirectionUrl,
    attributes: {
      NOMBRE: parsed.data.nombre,
      NIVEL: 'tejedor',
      FUENTE: 'registro-libro',
    },
  });

  if (!result.ok) {
    console.error('Brevo DOI error:', result);
    return new Response(JSON.stringify({ error: 'brevo_failed' }), { status: 502 });
  }

  // NO seteamos cookie aquí. La cookie se setea en /bienvenido tras la confirmación DOI.
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
