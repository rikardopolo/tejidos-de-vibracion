import type { APIRoute } from 'astro';
import * as Sentry from '@sentry/astro';
import { getServerClient } from '@/lib/supabase';
import {
  orderRef,
  mapProductToNivel,
  buildVariantMap,
  aceptarTestMode,
  decidirEntrega,
  persistOrderAtomic,
  claimAccesoEnvio,
  releaseAccesoEnvio,
  PREFIJO_VARIANTE,
  type ParsedOrderEvent,
} from '@/lib/lemonsqueezy-webhook.mjs';
import { SUBSCRIPTION_SLUGS } from '@/lib/product-slugs.mjs';
import { generatePurchaseToken } from '@/lib/purchase-token.mjs';
import { sendTransactionalEmail, tagContactSafe } from '@/lib/brevo';

export const prerender = false;

/**
 * Webhook de Lemon Squeezy → registra compras confirmadas en `orders`, la fuente
 * de verdad del acceso de pago (Nivel 2/3). Características:
 *  - Verifica la firma sobre el RAW body (HMAC-SHA256, timing-safe) antes de nada.
 *  - QUÉ hacer con cada entrega lo decide `decidirEntrega` (lógica pura, testeada
 *    con payloads firmados); este handler solo ejecuta la decisión.
 *  - El producto y el nivel salen de `first_order_item.variant_id` con el mapa
 *    `LS_VARIANT_*` del entorno. `custom_data.product_slug` ya NO decide: solo se
 *    registra como dato informativo.
 *  - Test Mode (`meta.test_mode`) se ignora salvo `LS_ACEPTAR_TEST_MODE=true`
 *    (solo Preview): 200 y un evento `test_mode_ignorado`, nada más.
 *  - Las órdenes de suscripción (variantes `LS_VARIANT_SUSCRIPCION*` o slug
 *    `suscripcion-libro`) no crean orden one-time ni token: evento y 200.
 *  - Un reembolso PARCIAL no revoca (decisión de Ricardo, 7-oct-2026): evento y 200.
 *  - Idempotente ATÓMICO: la "primera vez" la decide la BD (upsert ignoreDuplicates
 *    para paid · update WHERE status<>refunded para refund), no un SELECT previo, así
 *    dos entregas concurrentes del mismo ls_order_id no duplican efectos.
 *  - Concilia con leads vía custom.lead_id; si no viene, por email.
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

/** Variables `LS_VARIANT_*` (runtime primero, build como respaldo), para el mapa de variantes. */
function entornoVariantes(): Record<string, string | undefined> {
  const meta = import.meta.env as Record<string, string | undefined>;
  const proc: Record<string, string | undefined> =
    typeof process !== 'undefined' && process.env ? process.env : {};
  const out: Record<string, string | undefined> = {};
  for (const k of new Set([...Object.keys(meta), ...Object.keys(proc)])) {
    if (k.startsWith(PREFIJO_VARIANTE)) out[k] = readEnv(k);
  }
  return out;
}

const json = (status: number, obj: unknown) =>
  new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json' } });

type Cliente = NonNullable<ReturnType<typeof getServerClient>>;

/** Línea de tiempo (best-effort): un fallo aquí nunca rompe el ack a LS. */
async function registrarEvento(
  supabase: Cliente,
  type: string,
  leadId: string | null,
  metadata: Record<string, unknown>,
): Promise<void> {
  const { error } = await supabase
    .from('events')
    .insert({ lead_id: leadId, type, source: 'lemonsqueezy_webhook', metadata });
  if (error) console.error(`[webhooks/lemonsqueezy] events insert (${type}) fallo (no critico)`);
}

/** Conciliación con leads: custom.lead_id; si no vino, match por email (best-effort). */
async function resolverLeadId(supabase: Cliente, parsed: ParsedOrderEvent): Promise<string | null> {
  if (parsed.leadId) return parsed.leadId;
  if (!parsed.email) return null;
  const { data: lead, error } = await supabase.from('leads').select('id').eq('email', parsed.email).maybeSingle();
  if (error) console.error('[webhooks/lemonsqueezy] lookup de lead fallo (no critico)');
  return lead?.id ? String(lead.id) : null;
}

export const POST: APIRoute = async ({ request }) => {
  const startedAt = Date.now();
  const secret = readEnv('LS_WEBHOOK_SECRET');
  if (!secret) {
    console.error('[webhooks/lemonsqueezy] Falta LS_WEBHOOK_SECRET · rechazando todo');
    return json(503, { ok: false, error: 'not_configured' });
  }

  // Raw body EXACTO: la firma se calcula sobre estos bytes, no sobre el JSON reparseado.
  const raw = await request.text();
  const variantes = buildVariantMap(entornoVariantes());
  if (variantes.ambiguas.length > 0) {
    console.error(
      '[webhooks/lemonsqueezy] CONFIG · variantes reclamadas por dos slugs · se tratan como desconocidas:',
      variantes.ambiguas,
    );
  }

  const decision = decidirEntrega({
    raw,
    signature: request.headers.get('x-signature'),
    secret,
    eventName: request.headers.get('x-event-name'),
    variantes,
    aceptarTestMode: aceptarTestMode(),
  });

  if (decision.accion === 'firma_invalida') return json(401, { ok: false, error: 'bad_signature' });
  if (decision.accion === 'json_invalido') return json(400, { ok: false, error: 'invalid_json' });
  if (decision.accion === 'evento_ignorado') {
    // Evento que no manejamos (subscription_*, etc.) → ack sin procesar.
    return json(200, { ok: true, ignored: decision.eventName ?? 'unknown' });
  }

  if (decision.accion === 'test_mode_ignorado') {
    // C13 · Test Mode no toca `orders` ni emite tokens: solo queda la huella.
    const supabase = getServerClient();
    if (supabase) {
      await registrarEvento(supabase, 'test_mode_ignorado', null, {
        event_name: decision.eventName,
        ref: decision.lsOrderId ? orderRef(decision.lsOrderId) : null,
      });
    } else {
      console.warn('[webhooks/lemonsqueezy] test_mode_ignorado sin Supabase · evento no registrado');
    }
    return json(200, { ok: true, ignored: 'test_mode' });
  }

  const { parsed, body } = decision;
  const eventRef = orderRef(parsed.lsOrderId);
  let productoLog = 'unknown';
  const logWebhook = (
    status: 'success' | 'error',
    result: string,
    errorCode: string | null = null,
  ) => {
    const entry = JSON.stringify({
      event: 'webhook_run',
      provider: 'lemonsqueezy',
      event_ref: eventRef,
      event_type: parsed.eventName,
      product: productoLog,
      status,
      result,
      error_code: errorCode,
      duration_ms: Date.now() - startedAt,
    });
    if (status === 'success') console.info('[webhook/run]', entry);
    else console.error('[webhook/run]', entry);
  };

  const supabase = getServerClient();

  // Órdenes que el camino de órdenes NO procesa a propósito: la de una suscripción
  // (su acceso lo decide la tabla de suscripciones, nunca un token de 365 días) y el
  // reembolso parcial (no revoca). Solo dejan evento; 200 para que LS no reintente.
  if (decision.accion === 'suscripcion_ignorada' || decision.accion === 'reembolso_parcial') {
    const tipo = decision.accion === 'suscripcion_ignorada' ? 'order_suscripcion_ignorada' : 'order_reembolso_parcial';
    if (supabase) {
      await registrarEvento(supabase, tipo, await resolverLeadId(supabase, parsed), {
        order_ref: eventRef,
        variant_id: parsed.variantId,
        product_slug: parsed.productSlug,
        status: parsed.status,
        order_status: parsed.orderStatus,
        refunded_amount_cents: parsed.refundedAmountCents,
        test_mode: parsed.testMode,
      });
    } else {
      console.warn(`[webhooks/lemonsqueezy] ${tipo} sin Supabase · evento no registrado`);
    }
    logWebhook('success', decision.accion);
    return json(200, { ok: true, order: parsed.lsOrderId, ignored: decision.accion });
  }

  // orders.email/product_slug son NOT NULL. Validamos ANTES del upsert para no
  // disparar un fallo de constraint → 500 → reintento infinito de LS.
  if (!parsed.email) {
    logWebhook('error', 'rejected', 'missing_email');
    return json(400, { ok: false, error: 'missing_email' });
  }
  if (!supabase) {
    // Sin Supabase no podemos persistir. 500 → LS reintenta (la idempotencia cubre el retry).
    console.error('[webhooks/lemonsqueezy] Supabase no disponible · 500 para reintento');
    logWebhook('error', 'retry', 'persist_unavailable');
    return json(500, { ok: false, error: 'persist_unavailable' });
  }

  let producto = decision.accion === 'procesar' ? decision.producto : null;

  // Reembolso de una variante que hoy no está en el mapa (p. ej. se cambió
  // LS_VARIANT_* después de la venta): el producto es el que se GUARDÓ al vender,
  // nunca el de custom_data. Sin esto, el reembolso de una orden vieja no
  // revocaría el acceso.
  if (!producto && parsed.status === 'refunded') {
    const { data: previa, error: previaErr } = await supabase
      .from('orders')
      .select('product_slug')
      .eq('ls_order_id', parsed.lsOrderId)
      .maybeSingle();
    if (previaErr) {
      console.error('[webhooks/lemonsqueezy] lookup de la orden a reembolsar fallo · 500 para reintento');
      logWebhook('error', 'retry', 'refund_lookup_failed');
      return json(500, { ok: false, error: 'refund_lookup_failed' });
    }
    const slugPrevio = previa?.product_slug ? String(previa.product_slug) : null;
    const info = slugPrevio && !SUBSCRIPTION_SLUGS.includes(slugPrevio) ? mapProductToNivel(slugPrevio) : null;
    if (slugPrevio && info) producto = { slug: slugPrevio, nivel: info.nivel, expira: info.expira };
  }

  // CAMINO DEL DINERO · sin fallback silencioso: una variante desconocida (o sin
  // variant_id) NO regala acceso de pago. Log de auditoría (events) + ack 200 a
  // LS, sin token ni email.
  if (!producto) {
    await registrarEvento(supabase, 'order_unknown_product', await resolverLeadId(supabase, parsed), {
      order_ref: eventRef,
      variant_id: parsed.variantId,
      product_slug: parsed.productSlug,
      status: parsed.status,
      test_mode: parsed.testMode,
    });
    if (parsed.status === 'paid') {
      // Alguien PAGÓ y no recibe acceso. Desde S-05 el producto sale del mapa
      // `LS_VARIANT_*` de Vercel, así que lo normal aquí es una variable que falta
      // (o el id de Test Mode puesto en Production). Sin este aviso el caso es mudo:
      // 200 a LS, una fila en `events` y nadie se entera.
      console.error(
        `[webhooks/lemonsqueezy] PAGO SIN ACCESO · variante ${parsed.variantId ?? '(sin variant_id)'} fuera del mapa LS_VARIANT_* · ${eventRef}`,
      );
      try {
        Sentry.captureMessage('lemonsqueezy: pago con variante fuera del mapa LS_VARIANT_* · comprador sin acceso', {
          level: 'error',
          extra: { variant_id: parsed.variantId, order_ref: eventRef, test_mode: parsed.testMode },
        });
        await Sentry.flush(2000);
      } catch {
        /* el aviso nunca rompe el ack a LS */
      }
    }
    logWebhook('success', 'unknown_product');
    // 200 = ack a LS (no reintentar): el evento es válido, solo no lo monetizamos.
    return json(200, { ok: true, order: parsed.lsOrderId, status: parsed.status, unknown_product: true });
  }
  const { slug, nivel, expira } = producto;
  productoLog = slug;

  const leadId = await resolverLeadId(supabase, parsed);

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
    console.error('[webhooks/lemonsqueezy] persistencia atomica fallo');
    logWebhook('error', 'retry', 'persist_failed');
    return json(500, { ok: false, error: 'persist_failed' });
  }

  // EFECTOS SECUNDARIOS · solo en la PRIMERA vez (atómica) de este evento.
  if (isFirstEffect) {
    // Timeline (best-effort; no rompe el ack si falla).
    await registrarEvento(supabase, parsed.status === 'refunded' ? 'order_refunded' : 'order_paid', leadId, {
      order_ref: eventRef,
      product_slug: slug,
      variant_id: parsed.variantId,
      nivel,
      test_mode: parsed.testMode,
    });

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

  // Fase 4 · otorgar acceso: email con el enlace de acceso. El enlace lleva un
  // token de compra firmado.
  //
  // NO cuelga de `isFirstEffect`: si el email falla devolvemos 500 para que LS
  // reintente, y en el reintento isFirstEffect ya es false — el email no se
  // reenviaría nunca y el comprador se quedaría sin enlace. El candado correcto
  // es la transición única sobre `acceso_enviado_at`, que además se libera si el
  // envío falla para que el reintento pueda volver a tomarlo.
  if (parsed.status === 'paid' && parsed.email) {
    const tokenSecret = readEnv('ACCESS_TOKEN_SECRET');
    const apiKey = readEnv('BREVO_API_KEY');
    const templateIdRaw = readEnv('BREVO_TEMPLATE_BUNDLE_PREVENTA');
    const siteUrl = readEnv('PUBLIC_SITE_URL') || readEnv('SITE_URL') || 'https://tejidosdevibracion.com';
    const templateId = Number(templateIdRaw);
    const { claimed: claimedRaw, error: claimErr } = await claimAccesoEnvio(supabase, parsed.lsOrderId);
    if (claimErr) {
      // El candado no está disponible (p.ej. la migración de `acceso_enviado_at`
      // aún no se aplicó en esta base). DEGRADAMOS al comportamiento anterior —
      // entregar la primera vez — en vez de devolver 500 y dejar a TODO comprador
      // sin enlace. Devolver 500 aquí haría el despliegue dependiente del orden
      // migración→código, y sería estrictamente peor que antes del cambio.
      console.error('[webhooks/lemonsqueezy] candado de entrega no disponible · degradando a isFirstEffect:', claimErr);
    }
    const claimed = claimErr ? isFirstEffect : claimedRaw;
    if (claimed && tokenSecret && apiKey && templateIdRaw && !Number.isNaN(templateId)) {
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
        // El email ES la entrega del acceso: si falla, liberamos la marca y
        // devolvemos 500 para que LS reintente. Gracias a la liberación, el
        // reintento SÍ vuelve a enviar (antes se perdía para siempre).
        const { error: relErr } = await releaseAccesoEnvio(supabase, parsed.lsOrderId);
        if (relErr) {
          // La liberación es lo único que hace recuperable el fallo. Si ELLA falla,
          // la marca queda tomada y el reintento no reenviará: hace falta mano.
          console.error(
            `[webhooks/lemonsqueezy] CRÍTICO · order ${parsed.lsOrderId}: no se pudo liberar acceso_enviado_at · el reintento NO reenviará · arreglo manual: update orders set acceso_enviado_at = null where ls_order_id = '${parsed.lsOrderId}'`,
            relErr,
          );
        }
        // `sent` ya no lleva cuerpo del proveedor (brevo.ts devuelve status + clase),
        // así que sigue siendo seguro loguearlo y es lo único que dice POR QUÉ falló.
        console.error('[webhooks/lemonsqueezy] email de acceso falló · 500 para reintento de LS:', sent);
        logWebhook('error', 'retry', 'email_failed');
        return json(500, { ok: false, error: 'email_failed' });
      }
    } else if (claimed) {
      // Reclamamos el envío pero no podemos mandarlo: liberar, o la orden queda
      // marcada como entregada sin haberlo estado.
      const { error: relErr } = await releaseAccesoEnvio(supabase, parsed.lsOrderId);
      if (relErr) {
        console.error(
          `[webhooks/lemonsqueezy] CRÍTICO · order ${parsed.lsOrderId} queda marcada como entregada sin haberlo estado (liberación fallida):`,
          relErr,
        );
      }
      console.warn('[webhooks/lemonsqueezy] email de acceso omitido · faltan ACCESS_TOKEN_SECRET/BREVO_API_KEY/BREVO_TEMPLATE_BUNDLE_PREVENTA');
    } else if (parsed.status === 'paid') {
      // No se obtuvo el candado. Puede ser lo normal (reintento de una entrega ya
      // hecha) o el rastro de una entrega perdida — un claim que se tomó y murió
      // antes de enviar. Sin esta línea el caso es completamente mudo: el webhook
      // devolvería 200 para siempre y nadie sabría que falta un enlace.
      console.warn(
        `[webhooks/lemonsqueezy] order ${parsed.lsOrderId} · sin candado de entrega (ya marcada o no 'paid') · si el comprador no recibió el enlace, revisar acceso_enviado_at`,
      );
    }
  }

  logWebhook('success', isFirstEffect ? 'processed' : 'duplicate');
  return json(200, { ok: true, order: parsed.lsOrderId, status: parsed.status, nivel, new: isFirstEffect });
};

export const ALL: APIRoute = () => json(405, { ok: false, error: 'method_not_allowed' });
