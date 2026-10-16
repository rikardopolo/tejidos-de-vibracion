/**
 * acceso-cuenta.test.mjs · Nivel 2 por la cuenta de la sesión (S-13) con un cliente
 * FALSO de Supabase. Correr: node --test src/lib/acceso-cuenta.test.mjs
 *
 * Lista «Verificar» del bloque S-13: nivel 2 con sesión y suscripción activa abre el
 * Cap. 4; «cerrar en todos» (epoch distinto) lo rechaza; con la base caída vale la
 * marca `ent`, que no sobrevive al fin del periodo; configuración rota → cerrado;
 * una orden de Test Mode no cuenta en producción.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ENT_MAX_S,
  ENT_REFRESCO_S,
  alcanceDeNivel,
  clasificarFallo,
  combinarAccesos,
  decidirMarcaEnt,
  entVigente,
  esProduccion,
  finDelDerecho,
  resolverAccesoCuenta,
} from './acceso-cuenta.mjs';
import { puedeAcceder } from './gate-decision.mjs';
import { GRACIA_MS } from './subscription-gate.mjs';
import { clienteFalso } from './supabase-falso.test-helper.mjs';

const AID = '11111111-2222-4333-8444-555555555555';
const OTRA = '99999999-2222-4333-8444-555555555555';
const H = 60 * 60 * 1000;
const NOW = Date.parse('2026-10-07T12:00:00Z');
const NOW_S = Math.floor(NOW / 1000);
const iso = (ms) => new Date(ms).toISOString();

const sesion = (extra = {}) => ({ aid: AID, ep: 3, ent: null, ...extra });

function base({ epoch = 3, subs = [], ordenes = [] } = {}) {
  return {
    cuentas: [{ account_id: AID, session_epoch: epoch, email: 'ana@correo.com' }],
    subscriptions: subs.map((s) => ({ account_id: AID, test_mode: false, pause: null, ...s })),
    orders: ordenes.map((o) => ({ account_id: AID, test_mode: false, status: 'paid', ...o })),
  };
}

const resolver = (client, extra = {}) =>
  resolverAccesoCuenta({ client, sesion: sesion(extra.sesion), nowMs: extra.nowMs ?? NOW, produccion: extra.produccion ?? true, timeoutMs: extra.timeoutMs });

// Cap. 4: `nivelRequerido: 2` + `productoSlug: 'acto-2'` (contenido real).
const abreCap4 = (acceso) => puedeAcceder(acceso, 2, 'acto-2');

// ─── Nivel 2 con sesión ─────────────────────────────────────────────────────

test('sesión + suscripción activa → nivel 2, abre el Cap. 4 y escribe la marca ent', async () => {
  const fin = NOW + 10 * 24 * H;
  const client = clienteFalso(base({ subs: [{ status: 'active', current_period_end: iso(fin) }] }));
  const r = await resolver(client);
  assert.equal(r.acceso.nivel, 2);
  assert.ok(abreCap4(r.acceso));
  assert.equal(r.revocada, false);
  assert.equal(r.aviso, null);
  // hasta = min(ahora + 24 h, fin del periodo) → aquí manda el tope de 24 h.
  assert.deepEqual(r.ent, { accion: 'escribir', ent: { n: 2, hasta: NOW_S + ENT_MAX_S } });
});

test('el alcance sale del catálogo en el servidor y las consultas van por el account_id de la sesión', async () => {
  const client = clienteFalso(base({ subs: [{ status: 'active', current_period_end: iso(NOW + H) }] }));
  const r = await resolver(client);
  assert.deepEqual(r.acceso.slugs.sort(), alcanceDeNivel(2).sort());
  for (const tabla of ['cuentas', 'subscriptions', 'orders']) {
    const ll = client.llamadas.find((l) => l.tabla === tabla);
    assert.ok(ll, `consulta ${tabla}`);
    assert.ok(ll.filtros.some(([t, c, v]) => t === 'eq' && c === 'account_id' && v === AID), `${tabla} por account_id`);
  }
  const ord = client.llamadas.find((l) => l.tabla === 'orders');
  assert.ok(ord.filtros.some(([t, c, v]) => t === 'eq' && c === 'status' && v === 'paid'), 'solo órdenes pagadas');
});

test('la marca no pasa del fin del periodo: hasta = current_period_end si llega antes de 24 h', async () => {
  const fin = NOW + 2 * H;
  const r = await resolver(clienteFalso(base({ subs: [{ status: 'active', current_period_end: iso(fin) }] })));
  assert.deepEqual(r.ent, { accion: 'escribir', ent: { n: 2, hasta: Math.floor(fin / 1000) } });
});

test('cancelada con ends_at futuro → nivel 2 y la marca acaba en ends_at', async () => {
  const fin = NOW + 3 * H;
  const r = await resolver(clienteFalso(base({ subs: [{ status: 'cancelled', ends_at: iso(fin), current_period_end: iso(fin) }] })));
  assert.equal(r.acceso.nivel, 2);
  assert.equal(r.ent.ent.hasta, Math.floor(fin / 1000));
});

test('suscripción de otra cuenta no abre (la consulta es por account_id)', async () => {
  const t = base();
  t.subscriptions.push({ account_id: OTRA, status: 'active', current_period_end: iso(NOW + H), test_mode: false });
  const r = await resolver(clienteFalso(t));
  assert.equal(r.acceso.nivel, 1);
  assert.equal(abreCap4(r.acceso), false);
});

test('sesión sin suscripción ni compras → nivel 1, y una marca previa se BORRA (consulta correcta que niega)', async () => {
  const r = await resolver(clienteFalso(base({ subs: [{ status: 'expired' }] })), {
    sesion: { ent: { n: 2, hasta: NOW_S + 3600 } },
  });
  assert.deepEqual(r.acceso, { nivel: 1, slugs: [] });
  assert.deepEqual(r.ent, { accion: 'borrar' });
});

test('orden pagada de la cuenta (bundle) → nivel 2 con su slug; la marca dura 24 h', async () => {
  const r = await resolver(clienteFalso(base({ ordenes: [{ product_slug: 'bundle-preventa' }] })));
  assert.deepEqual(r.acceso, { nivel: 2, slugs: ['bundle-preventa'] });
  assert.deepEqual(r.ent.ent, { n: 2, hasta: NOW_S + ENT_MAX_S });
});

test('orden con slug de suscripción o desconocido no da nivel (la suscripción va por su tabla)', async () => {
  const r = await resolver(clienteFalso(base({ ordenes: [{ product_slug: 'suscripcion-libro' }, { product_slug: 'inventado' }] })));
  assert.equal(r.acceso.nivel, 1);
});

test('orden reembolsada no cuenta aunque la consulta la devolviera', async () => {
  const t = base();
  t.orders.push({ account_id: AID, product_slug: 'libro-completo', status: 'refunded', test_mode: false });
  t.orders.push({ account_id: AID, product_slug: 'bundle-preventa', status: 'disputed', test_mode: false });
  // Cliente que IGNORA el filtro `status = paid` de `orders`: la consulta devuelve la
  // reembolsada y la disputada, y aun así la decisión no puede contarlas.
  const falso = clienteFalso(t);
  const client = {
    ...falso,
    from(tabla) {
      const b = falso.from(tabla);
      if (tabla !== 'orders') return b;
      const eq = b.eq;
      b.eq = (col, val) => (col === 'status' ? b : eq(col, val));
      return b;
    },
  };
  const r = await resolver(client);
  assert.equal(r.acceso.nivel, 1);
  assert.deepEqual(r.acceso.slugs, []);
});

// ─── Test Mode ──────────────────────────────────────────────────────────────

test('orden de Test Mode NO cuenta en producción', async () => {
  const client = clienteFalso(base({ ordenes: [{ product_slug: 'libro-completo', test_mode: true }] }));
  const r = await resolver(client, { produccion: true });
  assert.equal(r.acceso.nivel, 1);
});

test('orden de Test Mode SÍ cuenta fuera de producción (Preview)', async () => {
  const client = clienteFalso(base({ ordenes: [{ product_slug: 'libro-completo', test_mode: true }] }));
  const r = await resolver(client, { produccion: false });
  assert.equal(r.acceso.nivel, 3);
});

test('suscripción de Test Mode tampoco cuenta en producción (Preview escribe en la misma base)', async () => {
  const client = clienteFalso(base({ subs: [{ status: 'active', current_period_end: iso(NOW + H), test_mode: true }] }));
  assert.equal((await resolver(client, { produccion: true })).acceso.nivel, 1);
  assert.equal((await resolver(client, { produccion: false })).acceso.nivel, 2);
});

test('esProduccion: solo VERCEL_ENV=production', () => {
  assert.equal(esProduccion({ VERCEL_ENV: 'production' }), true);
  assert.equal(esProduccion({ VERCEL_ENV: ' production ' }), true);
  assert.equal(esProduccion({ VERCEL_ENV: 'preview' }), false);
  assert.equal(esProduccion({}), false);
});

// ─── Cerrar en todos los dispositivos ───────────────────────────────────────

test('«cerrar en todos» (epoch distinto) → nivel 2 rechazado y la sesión queda revocada', async () => {
  const client = clienteFalso(base({ epoch: 4, subs: [{ status: 'active', current_period_end: iso(NOW + 24 * H) }] }));
  const r = await resolver(client, { sesion: { ent: { n: 2, hasta: NOW_S + 3600 } } });
  assert.equal(r.revocada, true);
  assert.equal(r.motivo, 'epoch');
  assert.equal(r.acceso.nivel, 0);
  assert.equal(abreCap4(r.acceso), false);
});

test('cuenta borrada → revocada', async () => {
  const t = base({ subs: [{ status: 'active' }] });
  t.cuentas = [];
  const r = await resolver(clienteFalso(t));
  assert.equal(r.revocada, true);
  assert.equal(r.motivo, 'cuenta');
});

// ─── Base caída: la marca ent (D4) ──────────────────────────────────────────

test('base caída (timeout) con marca vigente → nivel 2 hasta la marca, sin tocarla', async () => {
  const client = clienteFalso(base(), { colgar: { cuentas: true, subscriptions: true, orders: true } });
  const inicio = Date.now();
  const r = await resolver(client, { timeoutMs: 50, sesion: { ent: { n: 2, hasta: NOW_S + 3600 } } });
  assert.ok(Date.now() - inicio < 1500, 'el límite corta la consulta');
  assert.equal(r.acceso.nivel, 2);
  assert.ok(abreCap4(r.acceso));
  assert.equal(r.aviso, 'caida');
  assert.equal(r.motivo, 'ent');
  assert.deepEqual(r.ent, { accion: 'mantener' });
});

test('base caída sin marca → nivel 1 (cerrado)', async () => {
  const client = clienteFalso(base(), { fallar: { subscriptions: { status: 0, message: 'FetchError: fetch failed' } } });
  const r = await resolver(client);
  assert.deepEqual(r.acceso, { nivel: 1, slugs: [] });
  assert.equal(r.motivo, 'caida_sin_ent');
});

test('5xx de PostgREST cuenta como caída (usa la marca)', async () => {
  const client = clienteFalso(base(), { fallar: { orders: { status: 503 } } });
  const r = await resolver(client, { sesion: { ent: { n: 2, hasta: NOW_S + 60 } } });
  assert.equal(r.acceso.nivel, 2);
});

test('base caída → la marca NO sobrevive al fin del periodo', async () => {
  // 1) Con la base sana, a 2 h del fin del periodo: la marca queda en el fin del periodo.
  const fin = NOW + 2 * H;
  const sana = clienteFalso(base({ subs: [{ status: 'active', current_period_end: iso(fin) }] }));
  const r1 = await resolver(sana);
  assert.equal(r1.ent.accion, 'escribir');
  const ent = r1.ent.ent;
  assert.equal(ent.hasta, Math.floor(fin / 1000));

  const caida = clienteFalso(base(), { fallar: { cuentas: { status: 0 } } });
  // 2) Caída 1 h después: dentro del periodo, la marca abre.
  const r2 = await resolver(caida, { nowMs: NOW + 1 * H, sesion: { ent } });
  assert.equal(r2.acceso.nivel, 2);
  // 3) Caída 3 h después: el periodo terminó y la marca ya no vale.
  const r3 = await resolver(caida, { nowMs: NOW + 3 * H, sesion: { ent } });
  assert.deepEqual(r3.acceso, { nivel: 1, slugs: [] });
  assert.equal(r3.motivo, 'caida_sin_ent');
});

test('una marca que dice durar más de 24 h no se cree', () => {
  assert.equal(entVigente({ n: 2, hasta: NOW_S + ENT_MAX_S }, NOW_S), true);
  assert.equal(entVigente({ n: 2, hasta: NOW_S + 3 * ENT_MAX_S }, NOW_S), false);
  assert.equal(entVigente({ n: 1, hasta: NOW_S + 60 }, NOW_S), false);
  assert.equal(entVigente({ n: 2, hasta: NOW_S }, NOW_S), false);
  assert.equal(entVigente(null, NOW_S), false);
});

// ─── Configuración rota → cerrado ───────────────────────────────────────────

test('sin cliente de Supabase → cerrado (nivel 1) y aviso de configuración, aunque haya marca', async () => {
  const r = await resolverAccesoCuenta({ client: null, sesion: sesion({ ent: { n: 2, hasta: NOW_S + 60 } }), nowMs: NOW, produccion: true });
  assert.deepEqual(r.acceso, { nivel: 1, slugs: [] });
  assert.equal(r.aviso, 'config');
  assert.deepEqual(r.ent, { accion: 'mantener' });
});

for (const status of [401, 403]) {
  test(`PostgREST ${status} (clave revocada) → cerrado, aviso y la marca NO se usa`, async () => {
    const client = clienteFalso(base({ subs: [{ status: 'active' }] }), { fallar: { cuentas: { status } } });
    const r = await resolver(client, { sesion: { ent: { n: 2, hasta: NOW_S + 3600 } } });
    assert.deepEqual(r.acceso, { nivel: 1, slugs: [] });
    assert.equal(r.aviso, 'config');
    assert.deepEqual(r.ent, { accion: 'mantener' });
  });
}

test('tabla que no existe (404 de PostgREST) → configuración, no caída', async () => {
  const client = clienteFalso(base(), { fallar: { subscriptions: { status: 404, code: 'PGRST205' } } });
  const r = await resolver(client, { sesion: { ent: { n: 2, hasta: NOW_S + 3600 } } });
  assert.equal(r.acceso.nivel, 1);
  assert.equal(r.aviso, 'config');
});

test('si una consulta cae y otra dice 401, manda la configuración', async () => {
  const client = clienteFalso(base(), { fallar: { orders: { status: 0 }, subscriptions: { status: 401 } } });
  const r = await resolver(client, { sesion: { ent: { n: 2, hasta: NOW_S + 3600 } } });
  assert.equal(r.aviso, 'config');
  assert.equal(r.acceso.nivel, 1);
});

test('clasificarFallo', () => {
  for (const st of [0, null, undefined, 408, 429, 500, 502, 503, 504, 520]) assert.equal(clasificarFallo({ status: st }), 'caida', String(st));
  for (const st of [400, 401, 403, 404, 406]) assert.equal(clasificarFallo({ status: st }), 'config', String(st));
});

// ─── La marca: cuándo se reescribe ──────────────────────────────────────────

test('decidirMarcaEnt: sin cambios relevantes no reescribe (un Set-Cookie por hora como mucho)', () => {
  const a = { n: 2, hasta: 1000 };
  assert.equal(decidirMarcaEnt(null, a), 'escribir');
  assert.equal(decidirMarcaEnt(a, null), 'borrar');
  assert.equal(decidirMarcaEnt(null, null), 'mantener');
  assert.equal(decidirMarcaEnt(a, { n: 2, hasta: 1000 + ENT_REFRESCO_S - 1 }), 'mantener');
  assert.equal(decidirMarcaEnt(a, { n: 2, hasta: 1000 + ENT_REFRESCO_S }), 'escribir');
  assert.equal(decidirMarcaEnt(a, { n: 2, hasta: 999 }), 'escribir', 'acortar se escribe siempre');
  assert.equal(decidirMarcaEnt(a, { n: 3, hasta: 1000 }), 'escribir');
});

test('marca vigente parecida → mantener (no reemite la cookie en cada página)', async () => {
  const fin = NOW + 2 * H;
  const client = clienteFalso(base({ subs: [{ status: 'active', current_period_end: iso(fin) }] }));
  const r = await resolver(client, { sesion: { ent: { n: 2, hasta: Math.floor(fin / 1000) } } });
  assert.equal(r.acceso.nivel, 2);
  assert.deepEqual(r.ent, { accion: 'mantener' });
});

// ─── Piezas puras ───────────────────────────────────────────────────────────

test('finDelDerecho por estado', () => {
  const t = NOW + 5 * H;
  assert.equal(finDelDerecho({ status: 'active', current_period_end: iso(t) }), t);
  assert.equal(finDelDerecho({ status: 'on_trial', current_period_end: iso(t) }), t);
  assert.equal(finDelDerecho({ status: 'cancelled', ends_at: iso(t) }), t);
  assert.equal(finDelDerecho({ status: 'past_due', current_period_end: iso(t) }), t + GRACIA_MS);
  assert.equal(finDelDerecho({ status: 'paused', pause: { mode: 'free' } }), Infinity);
  assert.equal(finDelDerecho({ status: 'active', current_period_end: null }), Infinity);
});

test('combinarAccesos: nivel mayor y unión de slugs, sin mutar', () => {
  const a = { nivel: 2, slugs: ['bundle-preventa'] };
  const b = { nivel: 3, slugs: ['libro-completo', 'bundle-preventa'] };
  assert.deepEqual(combinarAccesos(a, b), { nivel: 3, slugs: ['bundle-preventa', 'libro-completo'] });
  assert.deepEqual(a, { nivel: 2, slugs: ['bundle-preventa'] });
});

test('alcanceDeNivel: 2 = todo lo de nivel 2 (incluye acto-2); 3 añade lo de nivel 3', () => {
  assert.ok(alcanceDeNivel(2).includes('acto-2'));
  assert.ok(!alcanceDeNivel(2).includes('libro-completo'));
  assert.ok(alcanceDeNivel(3).includes('libro-completo'));
  assert.deepEqual(alcanceDeNivel(1), []);
});
