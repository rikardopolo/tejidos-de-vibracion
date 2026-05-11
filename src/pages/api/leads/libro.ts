import type { APIRoute } from 'astro';
import { leadSchema, addContactToList, hashIp, isRateLimited } from '@/lib/brevo';

export const prerender = false; // serverless

export const POST: APIRoute = async ({ request, clientAddress }) => {
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
    return new Response(JSON.stringify({ error: 'invalid_input' }), { status: 400 });
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

  // 5. Brevo
  const apiKey = import.meta.env.BREVO_API_KEY;
  const listIdRaw = import.meta.env.BREVO_LISTA_LIBRO;

  if (!apiKey || !listIdRaw) {
    console.error('Brevo env vars missing');
    return new Response(JSON.stringify({ error: 'server_misconfigured' }), { status: 500 });
  }

  const listId = Number(listIdRaw);
  if (Number.isNaN(listId)) {
    return new Response(JSON.stringify({ error: 'server_misconfigured' }), { status: 500 });
  }

  const result = await addContactToList(parsed.data.email, listId, apiKey);

  if (!result.ok) {
    console.error('Brevo error:', result);
    return new Response(JSON.stringify({ error: 'brevo_failed' }), { status: 502 });
  }

  return new Response(JSON.stringify({ success: true }), {
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
