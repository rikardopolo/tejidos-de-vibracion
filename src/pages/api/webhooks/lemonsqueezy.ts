import type { APIRoute } from 'astro';
import { getServerClient } from '@/lib/supabase';
import {
  verifyLemonSignature,
  mapProductToNivel,
  parseOrderEvent,
  persistOrderAtomic,
} from '@/lib/lemonsqueezy-webhook.mjs';
import { generatePurchaseToken } from '@/lib/purchase-token.mjs';
import { sendTransactionalEmail, tagContactSafe } from '@/lib/brevo';

export const prerender = false;

/**
 * Webhook de Lemon Squeezy → registra compras confirmadas en `orders`, la fuente
 * de verdad del acceso de pago (Nivel 2/3). Características:
 *  - Verifica la firma sobre el RAW body (HMAC-SHA256, timing-safe) antes de nada.
 *  - Idempotente ATÓMICO: la "primera vez" la decide la BD (upsert ignoreDuplicates
 *    para paid · update WHERE status<>refunded para refund), no un SELECT previo, así
 *    dos entregas concurrentes del mismo ls_order_id no duplican efectos.
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

  // IDEMPOTENCIA ATÓMICA · LS reintenta los webhooks y puede entregar el MISMO
  // ls_order_id en paralelo. La decisión de "primera vez" debe ser ATÓMICA con la
  // escritura, no de un SELECT previo (check-then-act): dos entregas concurrentes
  // leerían ambas existing=null y ambas correrían los efectos (2 emails, 2 tags, 2
  // filas en events). Por eso NO consultamos antes; dejamos que la fila de orders
  // (UNIQUE(ls_order_id)) sea el árbitro y los efectos cuelgan de ESE resultado.
  const row = {
    ls_order_id: parsed.lsOrderId,
    ls_order_identifier: parsed.lsOrderIdentifier,
    email: parsed.email,
    lead_id: leadId,
    product_slug: slug,
    tipo: 'one-time' as const,
    amount_cents: parsed.amountCents,
    currency: parsed.currency,
    status: parsed.status,
    nivel_otorgado: nivel,
    acceso_expira_at: expira,
    test_mode: parsed.testMode,
    raw: body,
  };

  // isFirstEffect: ¿es esta la primera vez que corremos los efectos de ESTE evento
  // para ESTE ls_order_id? Lo resuelve la BD de forma ATÓMICA dentro de
  // persistOrderAtomic (upsert ignoreDuplicates / update WHERE status<>refunded),
  // no un SELECT previo. Misma fuente que el test del módulo puro.
  const { isFirstEffect, error: persistErr } = await persistOrderAtomic(supabase, parsed, row);
  if (persistErr) {
    console.error('[webhooks/lemonsqueezy] persistencia atómica falló · 500 para reintento:', persistErr.message);
    return json(500, { ok: false, error: 'persist_failed' });
  }

  // EFECTOS SECUNDARIOS · solo en la PRIMERA vez (atómica) de este evento.
  if (isFirstEffect) {
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
  if (isFirstEffect && parsed.status === 'paid' && parsed.email) {
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
        // El order ya quedó persistido (insert atómico); en el retry el upsert con
        // ignoreDuplicates choca con la fila existente → [] → isFirstEffect=false y
        // NO reenviaremos el email. Trade-off ponytail: preferimos no duplicar email a
        // garantizar entrega ante un fallo transitorio de Brevo (raro; queda el log).
        console.error('[webhooks/lemonsqueezy] email de acceso falló · 500 para reintento de LS:', sent);
        return json(500, { ok: false, error: 'email_failed' });
      }
    } else {
      console.warn('[webhooks/lemonsqueezy] email de acceso omitido · faltan ACCESS_TOKEN_SECRET/BREVO_API_KEY/BREVO_TEMPLATE_BUNDLE_PREVENTA');
    }
  }

  return json(200, { ok: true, order: parsed.lsOrderId, status: parsed.status, nivel, new: isFirstEffect });
};

export const ALL: APIRoute = () => json(405, { ok: false, error: 'method_not_allowed' });
