import type { APIRoute } from 'astro';
import { getServerClient } from '@/lib/supabase';
import {
  verifyLemonSignature,
  mapProductToNivel,
  parseOrderEvent,
} from '@/lib/lemonsqueezy-webhook.mjs';
import { generatePurchaseToken } from '@/lib/purchase-token.mjs';
import { sendTransactionalEmail } from '@/lib/brevo';

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

  // orders.email/product_slug son NOT NULL. Validamos ANTES del upsert para no
  // disparar un fallo de constraint → 500 → reintento infinito de LS.
  if (!parsed.email) {
    console.error(`[webhooks/lemonsqueezy] order ${parsed.lsOrderId} sin user_email · 400 (no reintentable)`);
    return json(400, { ok: false, error: 'missing_email' });
  }
  // Nuestro checkout siempre manda product_slug en custom; una compra directa en LS
  // sin custom cae al único producto activo. TODO multi-producto: mapear por variant_id.
  const productSlug = parsed.productSlug ?? 'bundle-preventa';
  if (!parsed.productSlug) {
    console.warn(`[webhooks/lemonsqueezy] order ${parsed.lsOrderId} sin product_slug · fallback ${productSlug}`);
  }

  const nivelInfo = mapProductToNivel(productSlug);
  if (!nivelInfo) {
    console.error(`[webhooks/lemonsqueezy] product_slug sin nivel: ${productSlug} (order ${parsed.lsOrderId}) · default nivel 2`);
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
    const { data: lead, error: leadErr } = await supabase.from('leads').select('id').eq('email', parsed.email).maybeSingle();
    if (leadErr) console.error('[webhooks/lemonsqueezy] lookup de lead por email falló (no crítico):', leadErr.message);
    if (lead?.id) leadId = String(lead.id);
  }

  // Idempotente: upsert por ls_order_id.
  const { error } = await supabase.from('orders').upsert(
    {
      ls_order_id: parsed.lsOrderId,
      ls_order_identifier: parsed.lsOrderIdentifier,
      email: parsed.email,
      lead_id: leadId,
      product_slug: productSlug,
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
      product_slug: productSlug,
      nivel,
      test_mode: parsed.testMode,
    },
  });
  if (evErr) console.error('[webhooks/lemonsqueezy] events insert (no crítico):', evErr.message);

  // Fase 4 · otorgar acceso: email con el enlace de acceso (solo en compra, no en
  // reembolso). El enlace lleva un token de compra firmado (nivel + scope).
  if (parsed.status === 'paid' && parsed.email) {
    const tokenSecret = readEnv('ACCESS_TOKEN_SECRET');
    const apiKey = readEnv('BREVO_API_KEY');
    const templateIdRaw = readEnv('BREVO_TEMPLATE_BUNDLE_PREVENTA');
    const siteUrl = readEnv('PUBLIC_SITE_URL') || readEnv('SITE_URL') || 'https://tejidosdevibracion.com';
    const templateId = Number(templateIdRaw);
    if (tokenSecret && apiKey && templateIdRaw && !Number.isNaN(templateId)) {
      const accessToken = generatePurchaseToken(
        { email: parsed.email, nivel, slugs: [productSlug], orderId: parsed.lsOrderId },
        tokenSecret,
      );
      const slug = productSlug;
      const accesoUrl = `${siteUrl}/acceso/${encodeURIComponent(slug)}?t=${encodeURIComponent(accessToken)}`;
      // NOMBRE (no FIRSTNAME); {{ unsubscribe }} lo resuelve Brevo en la plantilla, que
      // debe tener el click-tracking DESACTIVADO (regla de transaccionales del proyecto).
      const sent = await sendTransactionalEmail({
        to: { email: parsed.email, name: parsed.userName ?? undefined },
        templateId,
        params: { NOMBRE: parsed.userName ?? '', ACCESO_URL: accesoUrl },
        apiKey,
      });
      if (!sent.ok) {
        // El email ES la entrega del acceso: si falla, 500 para que LS reintente.
        // El upsert de orders es idempotente por ls_order_id, así que el retry es seguro.
        console.error('[webhooks/lemonsqueezy] email de acceso falló · 500 para reintento de LS:', sent);
        return json(500, { ok: false, error: 'email_failed' });
      }
    } else {
      console.warn('[webhooks/lemonsqueezy] email de acceso omitido · faltan ACCESS_TOKEN_SECRET/BREVO_API_KEY/BREVO_TEMPLATE_BUNDLE_PREVENTA');
    }
  }

  return json(200, { ok: true, order: parsed.lsOrderId, status: parsed.status, nivel });
};

export const ALL: APIRoute = () => json(405, { ok: false, error: 'method_not_allowed' });
