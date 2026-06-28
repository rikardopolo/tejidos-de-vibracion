import type { APIRoute } from 'astro';
import { getServerClient } from '@/lib/supabase';
import {
  verifyLemonSignature,
  mapProductToNivel,
  parseOrderEvent,
} from '@/lib/lemonsqueezy-webhook.mjs';
import { generatePurchaseToken } from '@/lib/purchase-token.mjs';
import { sendTransactionalEmail, tagContactSafe } from '@/lib/brevo';

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
  // trim: un espacio invisible en un secreto (p.ej. LS_WEBHOOK_SECRET) rompería
  // la verificación de firma de forma silenciosa.
  const pick = (v: string | undefined) => (v && v.trim() !== '' ? v.trim() : undefined);
  if (typeof process !== 'undefined' && process.env) {
    const p = pick(process.env[key]);
    if (p) return p;
  }
  return pick((import.meta.env as Record<string, string | undefined>)[key]);
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
  const supabase = getServerClient();
  if (!supabase) {
    // Sin Supabase no podemos persistir. 500 → LS reintenta (la idempotencia cubre el retry).
    console.error('[webhooks/lemonsqueezy] Supabase no disponible · 500 para reintento');
    return json(500, { ok: false, error: 'persist_unavailable' });
  }

  // CAMINO DEL DINERO · sin fallback silencioso: un producto desconocido o sin
  // product_slug NO regala acceso de pago. Antes caía a bundle-preventa/nivel 2.
  // Ahora: log de auditoría (events) + ack 200 a LS, sin token ni email.
  const productSlug = parsed.productSlug ?? null;
  const nivelInfo = productSlug ? mapProductToNivel(productSlug) : null;
  if (!productSlug || !nivelInfo) {
    console.warn(
      `[webhooks/lemonsqueezy] producto NO reconocido (slug=${productSlug ?? 'ausente'}, order ${parsed.lsOrderId}) · NO se otorga nivel de pago`,
    );
    // Conciliación con leads para el log (best-effort).
    let unkLeadId = parsed.leadId;
    if (!unkLeadId && parsed.email) {
      const { data: lead } = await supabase.from('leads').select('id').eq('email', parsed.email).maybeSingle();
      if (lead?.id) unkLeadId = String(lead.id);
    }
    const { error: unkErr } = await supabase.from('events').insert({
      lead_id: unkLeadId,
      type: 'order_unknown_product',
      source: 'lemonsqueezy_webhook',
      metadata: {
        ls_order_id: parsed.lsOrderId,
        product_slug: productSlug,
        status: parsed.status,
        test_mode: parsed.testMode,
      },
    });
    if (unkErr) console.error('[webhooks/lemonsqueezy] events insert (order_unknown_product) falló (no crítico):', unkErr.message);
    // 200 = ack a LS (no reintentar): el evento es válido, solo no lo monetizamos.
    return json(200, { ok: true, order: parsed.lsOrderId, status: parsed.status, unknown_product: true });
  }
  // Aquí productSlug es un slug conocido y no-nulo (si no, ya devolvimos 200 arriba).
  const slug: string = productSlug;
  const nivel = nivelInfo.nivel;
  const expira = nivelInfo.expira;

  // Conciliación con leads: custom.lead_id; si no vino, match por email.
  let leadId = parsed.leadId;
  if (!leadId && parsed.email) {
    const { data: lead, error: leadErr } = await supabase.from('leads').select('id').eq('email', parsed.email).maybeSingle();
    if (leadErr) console.error('[webhooks/lemonsqueezy] lookup de lead por email falló (no crítico):', leadErr.message);
    if (lead?.id) leadId = String(lead.id);
  }

  // DEDUP de efectos secundarios: LS reintenta los webhooks. El email de acceso,
  // el log en `events` y los tags de Brevo deben correr UNA sola vez por orden,
  // no en cada reintento. Detectamos insert-vs-update con una consulta previa por
  // ls_order_id (patrón más simple y robusto: el heurístico created_at==updated_at
  // es frágil porque el trigger de updated_at también dispara en el upsert).
  const { data: existing, error: existErr } = await supabase
    .from('orders')
    .select('id')
    .eq('ls_order_id', parsed.lsOrderId)
    .maybeSingle();
  if (existErr) {
    console.error('[webhooks/lemonsqueezy] lookup previo de orders falló · 500 para reintento:', existErr.message);
    return json(500, { ok: false, error: 'persist_failed' });
  }
  const isNewOrder = !existing;

  // Idempotente: upsert por ls_order_id (refresca status en reintentos/refunds).
  const { error } = await supabase.from('orders').upsert(
    {
      ls_order_id: parsed.lsOrderId,
      ls_order_identifier: parsed.lsOrderIdentifier,
      email: parsed.email,
      lead_id: leadId,
      product_slug: slug,
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

  // EFECTOS SECUNDARIOS · solo en order NUEVO (no en reintentos de LS).
  if (isNewOrder) {
    // Timeline (best-effort; no rompe el ack si falla).
    const { error: evErr } = await supabase.from('events').insert({
      lead_id: leadId,
      type: parsed.status === 'refunded' ? 'order_refunded' : 'order_paid',
      source: 'lemonsqueezy_webhook',
      metadata: {
        ls_order_id: parsed.lsOrderId,
        product_slug: slug,
        nivel,
        test_mode: parsed.testMode,
      },
    });
    if (evErr) console.error('[webhooks/lemonsqueezy] events insert (no crítico):', evErr.message);

    // Tags Brevo (env-guarded, best-effort) · order_created → lista de comprador
    // según nivel; order_refunded → lista de reembolso. ponytail: sin ID el tag
    // se salta con console.warn; el cobro/entitlement NUNCA depende del tag.
    const brevoApiKey = readEnv('BREVO_API_KEY');
    if (parsed.email) {
      if (parsed.status === 'refunded') {
        await tagContactSafe({
          email: parsed.email,
          listId: Number(readEnv('BREVO_LIST_REEMBOLSO')),
          apiKey: brevoApiKey,
          label: 'comprador-reembolso',
        });
      } else {
        // nivel 3 = libro completo · nivel 2 = preventa/actos.
        const listId = nivel === 3 ? readEnv('BREVO_LIST_COMPRADOR_LIBRO') : readEnv('BREVO_LIST_COMPRADOR_PREVENTA');
        await tagContactSafe({
          email: parsed.email,
          listId: Number(listId),
          apiKey: brevoApiKey,
          label: nivel === 3 ? 'comprador-libro' : 'comprador-preventa',
        });
      }
    }
  }

  // Fase 4 · otorgar acceso: email con el enlace de acceso (solo en compra NUEVA,
  // no en reembolso ni en reintentos). El enlace lleva un token de compra firmado.
  if (isNewOrder && parsed.status === 'paid' && parsed.email) {
    const tokenSecret = readEnv('ACCESS_TOKEN_SECRET');
    const apiKey = readEnv('BREVO_API_KEY');
    const templateIdRaw = readEnv('BREVO_TEMPLATE_BUNDLE_PREVENTA');
    const siteUrl = readEnv('PUBLIC_SITE_URL') || readEnv('SITE_URL') || 'https://tejidosdevibracion.com';
    const templateId = Number(templateIdRaw);
    if (tokenSecret && apiKey && templateIdRaw && !Number.isNaN(templateId)) {
      const accessToken = generatePurchaseToken(
        { email: parsed.email, nivel, slugs: [slug], orderId: parsed.lsOrderId },
        tokenSecret,
      );
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
        // El order quedó persistido; en el retry existing!=null → isNewOrder=false y
        // NO reenviaremos el email. Trade-off ponytail: preferimos no duplicar email a
        // garantizar entrega ante un fallo transitorio de Brevo (raro; queda el log).
        console.error('[webhooks/lemonsqueezy] email de acceso falló · 500 para reintento de LS:', sent);
        return json(500, { ok: false, error: 'email_failed' });
      }
    } else {
      console.warn('[webhooks/lemonsqueezy] email de acceso omitido · faltan ACCESS_TOKEN_SECRET/BREVO_API_KEY/BREVO_TEMPLATE_BUNDLE_PREVENTA');
    }
  }

  return json(200, { ok: true, order: parsed.lsOrderId, status: parsed.status, nivel, new: isNewOrder });
};

export const ALL: APIRoute = () => json(405, { ok: false, error: 'method_not_allowed' });
