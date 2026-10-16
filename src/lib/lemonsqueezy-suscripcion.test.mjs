/**
 * lemonsqueezy-suscripcion.test.mjs · Webhook `subscription_*` (S-13) con payloads
 * FIRMADOS y un cliente falso de Supabase.
 * Correr: node --test src/lib/lemonsqueezy-suscripcion.test.mjs
 *
 * Lista «Verificar» del bloque S-13:
 *  - created → updated → cancelled con el mismo custom → cancelled, account_id intacto,
 *    sin correo de vinculación;
 *  - reentrega → 200 sin duplicados;
 *  - custom de otra cuenta, o nonce usado con otro id → no vincula;
 *  - sin custom → pendiente y un solo correo;
 *  - Test Mode respeta la regla de S-05 (C13).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {
  aceptarTestMode,
  buildVariantMap,
  decidirEntrega,
  esEventoObsoleto,
  procesarSuscripcion,
} from './lemonsqueezy-webhook.mjs';
import { firmarCustom, nuevoNonce } from './custom-suscripcion.mjs';
import { clienteFalso } from './supabase-falso.test-helper.mjs';

const SECRET_WEBHOOK = 'test-signing-secret';
const SECRET_CUSTOM = 'c'.repeat(48);
const AID = '11111111-2222-4333-8444-555555555555';
const OTRA = '99999999-2222-4333-8444-555555555555';
const NOW = Date.parse('2026-10-07T12:00:00Z');
const NOW_S = Math.floor(NOW / 1000);
const VARIANTES = buildVariantMap({ LS_VARIANT_BUNDLE_PREVENTA: '111', LS_VARIANT_SUSCRIPCION_MENSUAL: '900', LS_VARIANT_SUSCRIPCION_ANUAL: '901' });
const sign = (raw) => crypto.createHmac('sha256', SECRET_WEBHOOK).update(raw, 'utf8').digest('hex');
const iso = (ms) => new Date(ms).toISOString();

const UNICOS = { subscriptions: [['provider', 'provider_subscription_id']], checkout_intentos: [['nonce']] };

/** Base con una cuenta, su intento de checkout y (opcional) otros intentos. */
function escenario({ intentos = [] } = {}) {
  const nonce = nuevoNonce();
  const tablas = {
    cuentas: [{ account_id: AID, session_epoch: 0 }, { account_id: OTRA, session_epoch: 0 }],
    checkout_intentos: [
      { nonce, account_id: AID, variant_id: '900', provider_subscription_id: null, used_at: null, expires_at: iso(NOW + 30 * 60e3) },
      ...intentos,
    ],
    subscriptions: [],
  };
  const custom = firmarCustom({ accountId: AID, nonce, iat: NOW_S - 60 }, SECRET_CUSTOM);
  return { client: clienteFalso(tablas, { unicos: UNICOS }), tablas, nonce, custom };
}

/** Payload `subscription_*` como lo manda LS. */
function evento(nombre, { id = 77, status = 'active', custom, variantId = 900, testMode = false, updatedAt = NOW, extra = {} } = {}) {
  return {
    meta: { event_name: nombre, test_mode: testMode, ...(custom === undefined ? {} : { custom_data: custom }) },
    data: {
      type: 'subscriptions',
      id,
      attributes: {
        store_id: 1,
        customer_id: 555,
        variant_id: variantId,
        user_name: 'Ana',
        user_email: 'Ana.Pago@Correo.com',
        status,
        cancelled: status === 'cancelled',
        pause: null,
        renews_at: iso(NOW + 30 * 864e5),
        ends_at: status === 'cancelled' || status === 'expired' ? iso(NOW + 30 * 864e5) : null,
        trial_ends_at: null,
        created_at: iso(NOW - 1000),
        updated_at: iso(updatedAt),
        test_mode: testMode,
        ...extra,
      },
    },
  };
}

/** Firma, decide y procesa: el mismo camino que el handler. */
async function entregar(client, body, { aceptar = false, correos = [], fallarCorreo = false, secretCustom = SECRET_CUSTOM, variantes = VARIANTES, nowMs = NOW } = {}) {
  const raw = JSON.stringify(body);
  const d = decidirEntrega({ raw, signature: sign(raw), secret: SECRET_WEBHOOK, eventName: null, variantes, aceptarTestMode: aceptar });
  if (d.accion !== 'suscripcion') return { decision: d };
  const r = await procesarSuscripcion(client, d.sub, {
    body: d.body,
    secretCustom,
    variantesSuscripcion: variantes.suscripcion,
    nowMs,
    enviarCorreoVincular: async (x) => {
      correos.push(x);
      return { ok: !fallarCorreo };
    },
  });
  return { decision: d, ...r };
}

// ─── Ciclo completo con custom válido ───────────────────────────────────────

test('created → updated → cancelled con el mismo custom → cancelled, account_id intacto, sin correo', async () => {
  const { client, tablas, nonce, custom } = escenario();
  const correos = [];

  const a = await entregar(client, evento('subscription_created', { custom, updatedAt: NOW }), { correos });
  assert.equal(a.http, 200);
  assert.equal(a.resultado, 'vinculada');

  const b = await entregar(client, evento('subscription_updated', { custom, updatedAt: NOW + 1000 }), { correos });
  assert.equal(b.resultado, 'actualizada');

  const c = await entregar(client, evento('subscription_cancelled', { custom, status: 'cancelled', updatedAt: NOW + 2000 }), { correos });
  assert.equal(c.http, 200);
  assert.equal(c.resultado, 'actualizada');

  assert.equal(tablas.subscriptions.length, 1);
  const fila = tablas.subscriptions[0];
  assert.equal(fila.status, 'cancelled');
  assert.equal(fila.account_id, AID);
  assert.equal(fila.vinculo, 'cuenta');
  assert.equal(fila.cancel_at_period_end, true);
  assert.ok(fila.ends_at);
  assert.equal(fila.provider, 'lemonsqueezy');
  assert.equal(fila.provider_subscription_id, '77');
  assert.equal(fila.product_slug, 'suscripcion-libro');
  assert.equal(fila.email, 'ana.pago@correo.com', 'el correo del PAGO, no el de la cuenta');
  assert.equal(fila.current_period_end, iso(NOW + 30 * 864e5));
  assert.equal(correos.length, 0, 'sin correo de vinculación');

  const intento = tablas.checkout_intentos.find((i) => i.nonce === nonce);
  assert.ok(intento.used_at, 'nonce consumido');
  assert.equal(intento.provider_subscription_id, '77');
});

test('los eventos siguientes NUNCA tocan account_id ni vinculo', async () => {
  const { client, custom } = escenario();
  await entregar(client, evento('subscription_created', { custom }));
  await entregar(client, evento('subscription_paused', { custom, status: 'paused', updatedAt: NOW + 5, extra: { pause: { mode: 'free', resumes_at: null } } }));
  const updates = client.llamadas.filter((l) => l.tabla === 'subscriptions' && l.op === 'update');
  assert.ok(updates.length >= 1);
  for (const u of updates) {
    assert.deepEqual(Object.keys(u.payload).sort(), ['cancel_at_period_end', 'current_period_end', 'ends_at', 'pause', 'raw', 'status']);
  }
  assert.deepEqual(client.tablas.subscriptions[0].pause, { mode: 'free', resumes_at: null });
});

test('el primer evento puede ser updated (el orden no está garantizado) y vincula igual', async () => {
  const { client, tablas, custom } = escenario();
  const r = await entregar(client, evento('subscription_updated', { custom }));
  assert.equal(r.resultado, 'vinculada');
  assert.equal(tablas.subscriptions[0].account_id, AID);
});

// ─── Reentregas ─────────────────────────────────────────────────────────────

test('reentrega del mismo evento → 200, sin duplicados ni efectos', async () => {
  const { client, tablas, custom } = escenario();
  const correos = [];
  const body = evento('subscription_created', { custom });
  const a = await entregar(client, body, { correos });
  const b = await entregar(client, body, { correos });
  assert.equal(a.http, 200);
  assert.equal(b.http, 200);
  assert.equal(b.resultado, 'actualizada');
  assert.equal(tablas.subscriptions.length, 1);
  assert.equal(tablas.subscriptions[0].account_id, AID);
  assert.equal(correos.length, 0);
});

test('un created reintentado DESPUÉS del cancelled no devuelve la fila a active (evento obsoleto)', async () => {
  const { client, tablas, custom } = escenario();
  const viejo = evento('subscription_created', { custom, updatedAt: NOW });
  await entregar(client, evento('subscription_cancelled', { custom, status: 'cancelled', updatedAt: NOW + 60e3 }));
  const r = await entregar(client, viejo);
  assert.equal(r.http, 200);
  assert.equal(r.resultado, 'obsoleto');
  assert.equal(tablas.subscriptions[0].status, 'cancelled');
});

test('dos primeras entregas a la vez con custom válido → una fila, vinculada', async () => {
  const { client, tablas, custom } = escenario();
  const [a, b] = await Promise.all([
    entregar(client, evento('subscription_created', { custom })),
    entregar(client, evento('subscription_updated', { custom, updatedAt: NOW + 1 })),
  ]);
  assert.equal(a.http, 200);
  assert.equal(b.http, 200);
  assert.equal(tablas.subscriptions.length, 1);
  assert.equal(tablas.subscriptions[0].account_id, AID);
  assert.equal(tablas.subscriptions[0].vinculo, 'cuenta');
});

test('el CAS es idempotente: si el insert falla tras consumir el nonce, el reintento de LS vincula (ni pendiente ni correo)', async () => {
  const { tablas, nonce, custom } = escenario();
  const fallar = { subscriptions: { status: 503, op: 'upsert' } };
  const client = clienteFalso(tablas, { unicos: UNICOS, fallar });
  const correos = [];
  const body = evento('subscription_created', { custom });

  const a = await entregar(client, body, { correos });
  assert.equal(a.http, 500, 'el insert falló: LS reintenta');
  assert.equal(tablas.subscriptions.length, 0);
  const intento = tablas.checkout_intentos.find((i) => i.nonce === nonce);
  assert.ok(intento.used_at, 'el nonce ya quedó consumido por este id');
  assert.equal(intento.provider_subscription_id, '77');

  delete fallar.subscriptions; // la base vuelve
  const b = await entregar(client, body, { correos });
  assert.equal(b.http, 200);
  assert.equal(b.resultado, 'vinculada', 'el mismo id vuelve a ganar el CAS');
  assert.equal(tablas.subscriptions[0].account_id, AID);
  assert.equal(tablas.subscriptions[0].vinculo, 'cuenta');
  assert.equal(correos.length, 0);
});

// ─── No vincula ─────────────────────────────────────────────────────────────

test('custom bien firmado pero con un nonce de OTRA cuenta → no vincula (pendiente)', async () => {
  const nonceAjeno = nuevoNonce();
  const { client, tablas } = escenario({
    intentos: [{ nonce: nonceAjeno, account_id: OTRA, variant_id: '900', provider_subscription_id: null, used_at: null }],
  });
  // Firmado de verdad (alguien con el secreto, o un custom reutilizado) para AID con el nonce de OTRA.
  const custom = firmarCustom({ accountId: AID, nonce: nonceAjeno, iat: NOW_S }, SECRET_CUSTOM);
  const correos = [];
  const r = await entregar(client, evento('subscription_created', { custom }), { correos });
  assert.equal(r.resultado, 'pendiente');
  assert.equal(r.motivo, 'nonce');
  assert.equal(tablas.subscriptions[0].account_id, null);
  assert.equal(tablas.subscriptions[0].vinculo, 'pendiente');
  assert.equal(tablas.checkout_intentos.find((i) => i.nonce === nonceAjeno).used_at, null, 'el nonce ajeno no se consume');
  assert.equal(correos.length, 1);
});

test('nonce ya usado con OTRA suscripción → no vincula', async () => {
  const { client, tablas, nonce, custom } = escenario();
  const intento = tablas.checkout_intentos.find((i) => i.nonce === nonce);
  intento.used_at = iso(NOW - 1000);
  intento.provider_subscription_id = '999';
  const r = await entregar(client, evento('subscription_created', { custom, id: 77 }));
  assert.equal(r.resultado, 'pendiente');
  assert.equal(tablas.subscriptions[0].account_id, null);
  assert.equal(intento.provider_subscription_id, '999', 'el intento sigue atado a la primera');
});

test('el mismo custom en una SEGUNDA suscripción → la segunda queda pendiente', async () => {
  const { client, tablas, custom } = escenario();
  await entregar(client, evento('subscription_created', { custom, id: 77 }));
  const r = await entregar(client, evento('subscription_created', { custom, id: 78 }));
  assert.equal(r.resultado, 'pendiente');
  assert.equal(tablas.subscriptions.find((s) => s.provider_subscription_id === '77').account_id, AID);
  assert.equal(tablas.subscriptions.find((s) => s.provider_subscription_id === '78').account_id, null);
});

test('custom manipulado (otro account_id con la firma original) → firma, pendiente', async () => {
  const { client, tablas, custom } = escenario();
  const r = await entregar(client, evento('subscription_created', { custom: { ...custom, account_id: OTRA } }));
  assert.equal(r.resultado, 'pendiente');
  assert.equal(r.motivo, 'firma');
  assert.equal(tablas.subscriptions[0].account_id, null);
});

test('custom de más de 7 días → caducado, pendiente', async () => {
  const { client, nonce } = escenario();
  const viejo = firmarCustom({ accountId: AID, nonce, iat: NOW_S - 8 * 86400 }, SECRET_CUSTOM);
  const r = await entregar(client, evento('subscription_created', { custom: viejo }));
  assert.equal(r.resultado, 'pendiente');
  assert.equal(r.motivo, 'caducado');
});

// ─── Sin custom → pendiente y UN correo ─────────────────────────────────────

test('sin custom → pendiente y un solo correo, al del pago; los siguientes eventos no escriben más', async () => {
  const { client, tablas } = escenario();
  const correos = [];
  const a = await entregar(client, evento('subscription_created', { updatedAt: NOW }), { correos });
  assert.equal(a.http, 200);
  assert.equal(a.resultado, 'pendiente');
  assert.equal(a.motivo, 'sin_custom');
  assert.equal(a.correo, 'enviado');
  await entregar(client, evento('subscription_created', { updatedAt: NOW }), { correos }); // reentrega
  await entregar(client, evento('subscription_updated', { updatedAt: NOW + 1 }), { correos });
  await entregar(client, evento('subscription_cancelled', { status: 'cancelled', updatedAt: NOW + 2 }), { correos });
  assert.equal(tablas.subscriptions.length, 1);
  assert.equal(tablas.subscriptions[0].vinculo, 'pendiente');
  assert.equal(tablas.subscriptions[0].account_id, null);
  assert.equal(tablas.subscriptions[0].status, 'cancelled');
  assert.equal(correos.length, 1);
  assert.deepEqual(correos[0], { email: 'ana.pago@correo.com', nombre: 'Ana' });
});

test('dos primeras entregas a la vez sin custom → una fila y un solo correo', async () => {
  const { client, tablas } = escenario();
  const correos = [];
  await Promise.all([
    entregar(client, evento('subscription_created'), { correos }),
    entregar(client, evento('subscription_updated', { updatedAt: NOW + 1 }), { correos }),
  ]);
  assert.equal(tablas.subscriptions.length, 1);
  assert.equal(correos.length, 1);
});

test('si el correo falla, la fila pendiente queda y responde 200 (correo: fallido); no se reenvía', async () => {
  const { client, tablas } = escenario();
  const correos = [];
  const a = await entregar(client, evento('subscription_created'), { correos, fallarCorreo: true });
  assert.equal(a.http, 200);
  assert.equal(a.correo, 'fallido');
  await entregar(client, evento('subscription_updated', { updatedAt: NOW + 1 }), { correos });
  assert.equal(tablas.subscriptions.length, 1);
  assert.equal(correos.length, 1);
});

// ─── Variante, configuración y fallos ───────────────────────────────────────

test('variante que no es de la suscripción del libro → 200 sin fila (otro producto de la tienda)', async () => {
  const { client, tablas, custom } = escenario();
  const r = await entregar(client, evento('subscription_created', { custom, variantId: 4444 }));
  assert.equal(r.http, 200);
  assert.equal(r.resultado, 'variante_ajena');
  assert.equal(tablas.subscriptions.length, 0);
});

test('sin LS_VARIANT_SUSCRIPCION* configuradas → 500 para que LS reintente, y aviso de configuración', async () => {
  const { client, tablas, custom } = escenario();
  const r = await entregar(client, evento('subscription_created', { custom }), { variantes: buildVariantMap({}) });
  assert.equal(r.http, 500);
  assert.equal(r.aviso, 'config');
  assert.equal(tablas.subscriptions.length, 0);
});

test('sin LS_CUSTOM_SECRET → 500 y aviso (no deja la suscripción pendiente por un fallo nuestro)', async () => {
  const { client, tablas, custom } = escenario();
  const r = await entregar(client, evento('subscription_created', { custom }), { secretCustom: null });
  assert.equal(r.http, 500);
  assert.equal(r.aviso, 'config');
  assert.equal(tablas.subscriptions.length, 0);
});

test('error de la base al buscar la fila → 500 (LS reintenta)', async () => {
  const { custom } = escenario();
  const client = clienteFalso({ subscriptions: [], checkout_intentos: [] }, { fallar: { subscriptions: { status: 503 } } });
  const r = await entregar(client, evento('subscription_created', { custom }));
  assert.equal(r.http, 500);
});

test('error en el CAS del nonce → 500 y sin fila', async () => {
  const { tablas, custom } = escenario();
  const client = clienteFalso(tablas, { unicos: UNICOS, fallar: { checkout_intentos: { status: 0, op: 'update' } } });
  const r = await entregar(client, evento('subscription_created', { custom }));
  assert.equal(r.http, 500);
  assert.equal(tablas.subscriptions.length, 0);
});

test('sin correo del pago → 400 (subscriptions.email es NOT NULL)', async () => {
  const { client, custom } = escenario();
  const r = await entregar(client, evento('subscription_created', { custom, extra: { user_email: '' } }));
  assert.equal(r.http, 400);
});

// ─── Test Mode (C13, regla de S-05) ─────────────────────────────────────────

test('Test Mode sin LS_ACEPTAR_TEST_MODE → test_mode_ignorado: ni fila ni correo', async () => {
  const { client, tablas } = escenario();
  const correos = [];
  const r = await entregar(client, evento('subscription_created', { testMode: true }), { correos });
  assert.equal(r.decision.accion, 'test_mode_ignorado');
  assert.equal(tablas.subscriptions.length, 0);
  assert.equal(correos.length, 0);
});

test('Test Mode aceptado (Preview) → se procesa y la fila sale test_mode', async () => {
  const { client, tablas, custom } = escenario();
  const r = await entregar(client, evento('subscription_created', { custom, testMode: true }), { aceptar: true });
  assert.equal(r.resultado, 'vinculada');
  assert.equal(tablas.subscriptions[0].test_mode, true);
});

test('en producción LS_ACEPTAR_TEST_MODE no cuenta', () => {
  assert.equal(aceptarTestMode({ VERCEL_ENV: 'production', LS_ACEPTAR_TEST_MODE: 'true' }), false);
  assert.equal(aceptarTestMode({ VERCEL_ENV: 'preview', LS_ACEPTAR_TEST_MODE: 'true' }), true);
});

// ─── Piezas ─────────────────────────────────────────────────────────────────

test('esEventoObsoleto: solo con las dos fechas y la entrante anterior', () => {
  const raw = { data: { attributes: { updated_at: iso(NOW) } } };
  assert.equal(esEventoObsoleto(raw, { updatedAt: iso(NOW - 1) }), true);
  assert.equal(esEventoObsoleto(raw, { updatedAt: iso(NOW) }), false);
  assert.equal(esEventoObsoleto(raw, { updatedAt: null }), false);
  assert.equal(esEventoObsoleto(null, { updatedAt: iso(NOW) }), false);
});

test('un id de suscripción con caracteres que romperían el filtro or() → evento ilegible', () => {
  const body = evento('subscription_created', { id: '77,used_at.is.null' });
  const raw = JSON.stringify(body);
  const d = decidirEntrega({ raw, signature: sign(raw), secret: SECRET_WEBHOOK, variantes: VARIANTES, aceptarTestMode: false });
  assert.equal(d.accion, 'suscripcion_invalida');
});
