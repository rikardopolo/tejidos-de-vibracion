import type { APIRoute } from 'astro';
import {
  leadSchema,
  upsertContact,
  sendTransactionalEmail,
  hashIp,
  isRateLimited,
} from '@/lib/brevo';
import { generateAccessToken } from '@/lib/token';
import { getServerClient } from '@/lib/supabase';
import { getGeo } from '@/lib/geo';
import { readEnv } from '@/lib/env';

export const prerender = false;

/**
 * Texto literal del consentimiento mostrado en el checkbox de FormularioTejedor
 * (evidencia legal · Ley 1581/2012). Debe coincidir con lo que el usuario ve.
 */
const CONSENT_TEXT_LIBRO =
  'Acepto recibir los capítulos por correo y que se registre mi avance de lectura para mejorar el libro. Conozco la política de privacidad.';

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

  // 1b. Persistir el lead en la Supabase unificada (best-effort · NUNCA bloquea el flujo).
  //     Debe existir ANTES de enviar el DOI para que el webhook de Brevo (que vive en TDR
  //     y escribe a la misma base) resuelva el evento `email_delivered` contra este lead.
  const geo = getGeo(request);
  const userAgent = request.headers.get('user-agent')?.slice(0, 500) ?? null;
  let leadId: string | null = null;
  const supabase = getServerClient();
  if (supabase) {
    try {
      const { data: lead, error } = await supabase
        .from('leads')
        .upsert(
          {
            email: parsed.data.correo,
            source: 'libro',
            name: parsed.data.nombre.slice(0, 100),
            consent_text: CONSENT_TEXT_LIBRO,
            ip_hash: ipHash,
            user_agent: userAgent,
            country: geo.country,
            region: geo.region,
            unsubscribed_at: null,
          },
          { onConflict: 'email' },
        )
        .select('id')
        .single();
      if (error) {
        console.error('[leads/libro] supabase upsert error:', error.message);
      } else {
        leadId = lead?.id ?? null;
        if (leadId) {
          await supabase.from('events').insert({
            lead_id: leadId,
            type: 'lead_created',
            source: 'api',
            metadata: {
              endpoint: 'leads/libro',
              ctaSource: 'libro',
              country: geo.country,
              region: geo.region,
            },
          });
        }
      }
    } catch (err) {
      console.error('[leads/libro] supabase persistence threw:', err);
    }
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

  // 3b. Registrar el envío del DOI (best-effort). El `messageId` permite cruzar con
  //     los eventos del webhook de Brevo (delivered/opened) si hiciera falta.
  if (supabase && leadId) {
    try {
      await supabase.from('events').insert({
        lead_id: leadId,
        type: 'email_sent',
        source: 'api',
        metadata: { endpoint: 'leads/libro', kind: 'doi', messageId: sent.messageId ?? null },
      });
    } catch (err) {
      console.error('[leads/libro] email_sent event threw:', err);
    }
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
