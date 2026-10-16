/**
 * sesion-ent.test.mjs · La marca `ent` dentro de `__Host-tdv_sesion` (S-13, D4).
 * Correr: node --test src/lib/sesion-ent.test.mjs
 *
 * `reemitirSesionTdv` cambia SOLO la marca: conserva identidad, epoch, método, `iat`
 * y, sobre todo, `exp` (reescribir la marca no alarga la sesión de 30 días).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { firmarSesionTdv, reemitirSesionTdv, verificarSesionTdv, SESION_TTL_S } from './sesion-tdv.mjs';

const SECRET = 'x'.repeat(40);
const AID = '11111111-2222-4333-8444-555555555555';
const T0 = Date.parse('2026-10-07T12:00:00Z');
const S = (ms) => Math.floor(ms / 1000);

function sesionValida(extra = {}) {
  const t = firmarSesionTdv({ aid: AID, ep: 2, am: 'codigo', em: 'a***@correo.com', ...extra }, { secret: SECRET, now: T0 });
  const v = verificarSesionTdv(t, { secret: SECRET, now: T0 });
  assert.equal(v.ok, true);
  return v;
}

test('añade la marca y conserva iat y exp (no alarga la sesión)', () => {
  const v = sesionValida();
  const luego = T0 + 10 * 24 * 3600 * 1000; // 10 días después
  const t = reemitirSesionTdv(v, { n: 2, hasta: S(luego) + 3600 }, { secret: SECRET, now: luego });
  const r = verificarSesionTdv(t, { secret: SECRET, now: luego });
  assert.equal(r.ok, true);
  assert.equal(r.iat, v.iat);
  assert.equal(r.exp, v.exp);
  assert.equal(r.exp, S(T0) + SESION_TTL_S);
  assert.deepEqual(r.ent, { n: 2, hasta: S(luego) + 3600 });
  assert.equal(r.aid, AID);
  assert.equal(r.ep, 2);
  assert.equal(r.am, 'codigo');
  assert.equal(r.em, 'a***@correo.com');
});

test('ent null quita la marca', () => {
  const con = verificarSesionTdv(
    reemitirSesionTdv(sesionValida(), { n: 2, hasta: S(T0) + 60 }, { secret: SECRET, now: T0 }),
    { secret: SECRET, now: T0 },
  );
  assert.deepEqual(con.ent, { n: 2, hasta: S(T0) + 60 });
  const sin = verificarSesionTdv(reemitirSesionTdv(con, null, { secret: SECRET, now: T0 }), { secret: SECRET, now: T0 });
  assert.equal(sin.ok, true);
  assert.equal(sin.ent, null);
});

test('sesión caducada, sin secreto o marca inválida → null', () => {
  const v = sesionValida();
  assert.equal(reemitirSesionTdv(v, { n: 2, hasta: 1 }, { secret: SECRET, now: (v.exp + 1) * 1000 }), null);
  assert.equal(reemitirSesionTdv(v, { n: 2, hasta: 1 }, { secret: undefined, now: T0 }), null);
  assert.equal(reemitirSesionTdv(v, { n: 2, hasta: 1 }, { secret: 'corto', now: T0 }), null);
  assert.equal(reemitirSesionTdv(v, { n: 7, hasta: 1 }, { secret: SECRET, now: T0 }), null);
  assert.equal(reemitirSesionTdv(v, { n: 2, hasta: Number.NaN }, { secret: SECRET, now: T0 }), null);
  assert.equal(reemitirSesionTdv({ ...v, aid: 'no-uuid' }, null, { secret: SECRET, now: T0 }), null);
});

test('una sesión firmada con una marca malformada no verifica (defensa en profundidad)', () => {
  // Solo nuestro firmador produce sesiones, y nunca firma una marca así; aun así, si
  // apareciera, no puede colarse un nivel raro ni un `hasta` que no es número.
  const v = sesionValida();
  const crudo = (ent) => {
    const payload = { p: 'sesion-tdv', aud: 'tdv', aid: AID, ep: 2, am: 'codigo', iat: v.iat, exp: v.exp, ent };
    const body = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
    return `${body}.${crypto.createHmac('sha256', SECRET).update(body).digest('hex')}`;
  };
  assert.equal(verificarSesionTdv(crudo({ n: 2, hasta: S(T0) + 60 }), { secret: SECRET, now: T0 }).ok, true, 'control');
  for (const ent of [{ n: 9, hasta: S(T0) + 60 }, { n: 2, hasta: 'mañana' }, { n: '2', hasta: S(T0) + 60 }, 'n2', null]) {
    assert.equal(verificarSesionTdv(crudo(ent), { secret: SECRET, now: T0 }).ok, false, JSON.stringify(ent));
  }
});

test('la marca no se puede fabricar sin el secreto', () => {
  const v = sesionValida();
  const otra = reemitirSesionTdv(v, { n: 3, hasta: S(T0) + 3600 }, { secret: 'y'.repeat(40), now: T0 });
  assert.equal(verificarSesionTdv(otra, { secret: SECRET, now: T0 }).ok, false);
});
