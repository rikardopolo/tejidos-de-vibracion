import type { APIRoute } from 'astro';
import { leadSchema, addContactToList, hashIp, isRateLimited } from '@/lib/brevo';
import { generateAccessToken } from '@/lib/token';

export const prerender = false;

export const POST: APIRoute = async ({ request, clientAddress, cookies }) => {
  // 1. Parsear body
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'invalid_json' }), { status: 400 });
  }

  // 2. Validar
  const parsed = leadSchema.safeParse(body);
  if (!parsed.success) {
    return new Response(
      JSON.stringify({ error: 'invalid_input', issues: parsed.error.issues.map(i => i.path.join('.')) }),
      { status: 400 }
    );
  }

  // 3. Honeypot — éxito silencioso si es bot
  if (parsed.data.honeypot !== '') {
    return new Response(null, { status: 200 });
  }

  // 4. Rate limit
  const ipHash = hashIp(clientAddress || 'unknown');
  if (isRateLimited(ipHash)) {
    return new Response(JSON.stringify({ error: 'rate_limited' }), {
      status: 429,
      headers: { 'Retry-After': '60' },
    });
  }

  // 5. Verificar env vars (runtime via process.env primero, build-time como fallback)
  const readEnv = (key: string): string | undefined => {
    if (typeof process !== 'undefined' && process.env) {
      const p = process.env[key];
      if (p !== undefined && p !== '') return p;
    }
    const m = (import.meta.env as Record<string, string | undefined>)[key];
    if (m !== undefined && m !== '') return m;
    return undefined;
  };
  const apiKey = readEnv('BREVO_API_KEY');
  const listIdRaw = readEnv('BREVO_LISTA_LIBRO');
  const tokenSecret = readEnv('ACCESS_TOKEN_SECRET');

  if (!apiKey || !listIdRaw || !tokenSecret) {
    console.error('Missing env vars: BREVO_API_KEY/BREVO_LISTA_LIBRO/ACCESS_TOKEN_SECRET');
    return new Response(JSON.stringify({ error: 'server_misconfigured' }), { status: 500 });
  }

  const listId = Number(listIdRaw);
  if (Number.isNaN(listId)) {
    return new Response(JSON.stringify({ error: 'server_misconfigured' }), { status: 500 });
  }

  // 6. Brevo
  const result = await addContactToList({
    email: parsed.data.email,
    listId,
    apiKey,
    attributes: {
      NOMBRE: parsed.data.nombre,
      NIVEL: 'tejedor',
      FUENTE: 'registro-libro',
    },
  });

  if (!result.ok) {
    console.error('Brevo error:', result);
    return new Response(JSON.stringify({ error: 'brevo_failed' }), { status: 502 });
  }

  // 7. Generar token y setear cookie HttpOnly
  const token = generateAccessToken(parsed.data.email, tokenSecret);
  cookies.set('tejedor-access', token, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 30 * 24 * 60 * 60,
  });

  return new Response(JSON.stringify({ success: true, nombre: parsed.data.nombre }), {
    status: 201,
    headers: { 'Content-Type': 'application/json' },
  });
};

// Rechazar otros métodos
export const ALL: APIRoute = () => {
  return new Response(JSON.stringify({ error: 'method_not_allowed' }), {
    status: 405,
    headers: { Allow: 'POST' },
  });
};
