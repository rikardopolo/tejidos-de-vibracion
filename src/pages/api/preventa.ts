import type { APIRoute } from 'astro';
import { z } from 'zod';
import { upsertContact, hashIp, isRateLimited } from '@/lib/brevo';

export const prerender = false;

/**
 * Captura de interés para la pre-venta del Acto II (caps V-VII).
 *
 * A diferencia de /api/leads/libro (DOI completo con email transaccional),
 * esto es una captura ligera: hace upsert del contacto en Brevo SIN añadirlo
 * a ninguna lista (no dispara workflow), marcándolo con el atributo
 * FUENTE=preventa-acto-2 para segmentarlo cuando abra el checkout (Sep 2026).
 *
 * Solo requiere BREVO_API_KEY (ya configurada en prod). No usa Resend.
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

const preventaSchema = z.object({
  nombre: z.string().min(2).max(100).trim(),
  email: z.string().email().max(254),
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

  const parsed = preventaSchema.safeParse(body);
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

  // Rate limit por IP hash (1 req / 60 s)
  const ipHash = hashIp(clientAddress || 'unknown');
  if (isRateLimited(ipHash)) {
    return new Response(JSON.stringify({ error: 'rate_limited' }), {
      status: 429,
      headers: { 'Retry-After': '60' },
    });
  }

  const apiKey = readEnv('BREVO_API_KEY');
  if (!apiKey) {
    console.error('[preventa] Missing env var: BREVO_API_KEY');
    return new Response(JSON.stringify({ error: 'server_misconfigured' }), { status: 500 });
  }

  // Upsert sin lista: marca el interés con atributos para segmentar en Sep 2026.
  const upsert = await upsertContact({
    email: parsed.data.email,
    apiKey,
    attributes: {
      NOMBRE: parsed.data.nombre,
      FUENTE: 'preventa-acto-2',
      PREVENTA_ACTO2: 'true',
    },
  });

  if (!upsert.ok) {
    console.error('[preventa] Brevo upsertContact failed:', upsert);
    return new Response(JSON.stringify({ error: 'brevo_failed' }), { status: 502 });
  }

  return new Response(
    JSON.stringify({
      success: true,
      nombre: parsed.data.nombre,
      message: 'Listo. Te avisaremos cuando el Acto II esté disponible.',
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
