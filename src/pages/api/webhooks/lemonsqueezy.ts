import type { APIRoute } from 'astro';
import { getServerClient } from '@/lib/supabase';
import {
  verifyLemonSignature,
  mapProductToNivel,
  parseOrderEvent,
} from '@/lib/lemonsqueezy-webhook.mjs';

export const prerender = false;

/**
 * Webhook de Lemon Squeezy → registra compras confirmadas en `orders`, la fuente
 * de verdad del acceso de pago (Nivel 2/3). Características:
 *  - Verifica la firma sobre el RAW body (HMAC-SHA256, timing-safe) antes de nada.
 *  - Idempotente: upsert por ls_order_id (LS reintenta los webhooks).
 *  - Resuelve nivel_otorgado desde product_slug (mapa en lemonsqueezy-webhook.mjs).
 *  - Concilia con leads vía custom.lead_id; si no viene, por email.
 *
 * El OTORGAMIENTO de acceso (email Brevo + token de nivel) es Fase 4: aquí solo
 * se persiste la orden y su status.
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

const json = (status: number, obj: unknown) =>
  new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json' } });

export const POST: APIRoute = async ({ request }) => {
  const secret = readEnv('LS_WEBHOOK_SECRET');
  if (!secret) {
    console.error('[webhooks/lemonsqueezy] Falta LS_WEBHOOK_SECRET · rechazando todo');
    return json(503, { ok: false, error: 'not_configured' });
  }

  // Raw body EXACTO: la firma se calcula sobre estos bytes, no sobre el JSON reparseado.
  const raw = await request.text();
  const signature = request.headers.get('x-signature');
  if (!verifyLemonSignature(raw, signature, secret)) {
    return json(401, { ok: false, error: 'bad_signature' });
  }

  const eventName = request.headers.get('x-event-name') ?? undefined;
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return json(400, { ok: false, error: 'invalid_json' });
  }

  const parsed = parseOrderEvent(body, eventName);
  if (!parsed) {
    // Evento que no manejamos (subscription_*, etc.) → ack sin procesar.
    return json(200, { ok: true, ignored: eventName ?? 'unknown' });
  }

  const nivelInfo = mapProductToNivel(parsed.productSlug);
  if (!nivelInfo) {
    console.error(
      `[webhooks/lemonsqueezy] product_slug desconocido: ${parsed.productSlug} (order ${parsed.lsOrderId}) · default nivel 2`,
    );
  }
  const nivel = nivelInfo?.nivel ?? 2;
  const expira = nivelInfo?.expira ?? null;

  const supabase = getServerClient();
  if (!supabase) {
    // Sin Supabase no podemos persistir. 500 → LS reintenta (la idempotencia cubre el retry).
    console.error('[webhooks/lemonsqueezy] Supabase no disponible · 500 para reintento');
    return json(500, { ok: false, error: 'persist_unavailable' });
  }

  // Conciliación con leads: custom.lead_id; si no vino, match por email.
  let leadId = parsed.leadId;
  if (!leadId && parsed.email) {
    const { data: lead } = await supabase.from('leads').select('id').eq('email', parsed.email).maybeSingle();
    if (lead?.id) leadId = String(lead.id);
  }

  // Idempotente: upsert por ls_order_id.
  const { error } = await supabase.from('orders').upsert(
    {
      ls_order_id: parsed.lsOrderId,
      ls_order_identifier: parsed.lsOrderIdentifier,
      email: parsed.email,
      lead_id: leadId,
      product_slug: parsed.productSlug,
      tipo: 'one-time',
      amount_cents: parsed.amountCents,
      currency: parsed.currency,
      status: parsed.status,
      nivel_otorgado: nivel,
      acceso_expira_at: expira,
      test_mode: parsed.testMode,
      raw: body,
    },
    { onConflict: 'ls_order_id' },
  );

  if (error) {
    console.error('[webhooks/lemonsqueezy] upsert orders falló:', error.message);
    return json(500, { ok: false, error: 'persist_failed' });
  }

  // Timeline (best-effort; no rompe el ack si falla).
  const { error: evErr } = await supabase.from('events').insert({
    lead_id: leadId,
    type: parsed.status === 'refunded' ? 'order_refunded' : 'order_paid',
    source: 'lemonsqueezy_webhook',
    metadata: {
      ls_order_id: parsed.lsOrderId,
      product_slug: parsed.productSlug,
      nivel,
      test_mode: parsed.testMode,
    },
  });
  if (evErr) console.error('[webhooks/lemonsqueezy] events insert (no crítico):', evErr.message);

  return json(200, { ok: true, order: parsed.lsOrderId, status: parsed.status, nivel });
};

export const ALL: APIRoute = () => json(405, { ok: false, error: 'method_not_allowed' });
