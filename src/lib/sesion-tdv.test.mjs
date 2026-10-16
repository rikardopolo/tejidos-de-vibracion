/**
 * Checks de la sesión del libro y del estado del salto. Stdlib node:test, sin deps.
 * Correr: node --test src/lib/sesion-tdv.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {
  SESION_COOKIE,
  STATE_COOKIE,
  SESION_TTL_S,
  STATE_TTL_S,
  OPCIONES_BORRADO_TDV,
  firmarSesionTdv,
  verificarSesionTdv,
  firmarStateTdv,
  verificarStateTdv,
  secretoSesionTdv,
  secretoValido,
  sesionTdvDeCookie,
  opcionesCookieTdv,
} from './sesion-tdv.mjs';
import { generatePurchaseToken, verifyPurchaseToken } from './purchase-token.mjs';

const S = 'secreto-de-prueba-de-32-caracteres-o-mas';
const OTRO = 'otro-secreto-de-prueba-de-32-caracteres!!';
const AID = '0b6f5a0e-3c1d-4e8a-9f2b-7d4c1e2a3b4c';
const T0 = Date.UTC(2026, 9, 7, 12, 0, 0); // ms
const SH = 'a'.repeat(64);
const claims = { aid: AID, ep: 3, am: 'codigo', em: 'r***@gmail.com' };

/** Firma un payload arbitrario con el mismo formato (para probar p/aud distintos). */
function firmarCrudo(payload, secret = S) {
  const body = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  return `${body}.${crypto.createHmac('sha256', secret).update(body).digest('hex')}`;
}

// ── Sesión ───────────────────────────────────────────────────────────
test('round-trip: firma y verifica con todos los campos', () => {
  const t = firmarSesionTdv(claims, { secret: S, now: T0 });
  const r = verificarSesionTdv(t, { secret: S, now: T0 + 1000 });
  assert.equal(r.ok, true);
  assert.equal(r.aid, AID);
  assert.equal(r.ep, 3);
  assert.equal(r.am, 'codigo');
  assert.equal(r.em, 'r***@gmail.com');
  assert.equal(r.ent, null);
  assert.equal(r.exp - r.iat, SESION_TTL_S);
  assert.equal(r.iat, Math.floor(T0 / 1000));
});

test('el payload lleva p y aud fijos y nunca el correo en claro', () => {
  const t = firmarSesionTdv(claims, { secret: S, now: T0 });
  const payload = JSON.parse(Buffer.from(t.split('.')[0], 'base64url').toString('utf8'));
  assert.equal(payload.p, 'sesion-tdv');
  assert.equal(payload.aud, 'tdv');
  assert.deepEqual(Object.keys(payload).sort(), ['aid', 'am', 'aud', 'em', 'ep', 'exp', 'iat', 'p']);
});

test('caduca a los 30 días exactos', () => {
  const t = firmarSesionTdv(claims, { secret: S, now: T0 });
  assert.equal(verificarSesionTdv(t, { secret: S, now: T0 + (SESION_TTL_S - 1) * 1000 }).ok, true);
  const r = verificarSesionTdv(t, { secret: S, now: T0 + SESION_TTL_S * 1000 });
  assert.deepEqual(r, { ok: false, reason: 'expired' });
});

test('otro secreto → bad-signature', () => {
  const t = firmarSesionTdv(claims, { secret: S, now: T0 });
  assert.equal(verificarSesionTdv(t, { secret: OTRO, now: T0 }).reason, 'bad-signature');
});

test('manipulación del cuerpo o de la firma → rechazo', () => {
  const t = firmarSesionTdv(claims, { secret: S, now: T0 });
  const [body, sig] = t.split('.');
  // Cambiar el epoch dentro del cuerpo sin volver a firmar.
  const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
  payload.ep = 99;
  const body2 = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  assert.equal(verificarSesionTdv(`${body2}.${sig}`, { secret: S, now: T0 }).reason, 'bad-signature');
  const sig2 = sig.slice(0, -1) + (sig.endsWith('0') ? '1' : '0');
  assert.equal(verificarSesionTdv(`${body}.${sig2}`, { secret: S, now: T0 }).reason, 'bad-signature');
  assert.equal(verificarSesionTdv(`${body}.${sig}.x`, { secret: S, now: T0 }).reason, 'malformed');
  assert.equal(verificarSesionTdv('basura', { secret: S, now: T0 }).reason, 'malformed');
});

test('p distinto (un state firmado con el mismo secreto) no vale como sesión', () => {
  const state = firmarStateTdv({ sh: SH, next: '/' }, { secret: S, now: T0 });
  assert.equal(verificarSesionTdv(state, { secret: S, now: T0 }).reason, 'wrong-purpose');
  // …ni una sesión como state.
  const ses = firmarSesionTdv(claims, { secret: S, now: T0 });
  assert.equal(verificarStateTdv(ses, { secret: S, now: T0 }).reason, 'wrong-purpose');
});

test('aud distinto → wrong-aud', () => {
  const iat = Math.floor(T0 / 1000);
  const t = firmarCrudo({ p: 'sesion-tdv', aud: 'tdr', aid: AID, ep: 0, am: 'codigo', iat, exp: iat + 60 });
  assert.equal(verificarSesionTdv(t, { secret: S, now: T0 }).reason, 'wrong-aud');
});

test('am fuera de la lista del portal → bad-am (falla cerrado)', () => {
  const iat = Math.floor(T0 / 1000);
  const t = firmarCrudo({ p: 'sesion-tdv', aud: 'tdv', aid: AID, ep: 0, am: 'magia', iat, exp: iat + 60 });
  assert.equal(verificarSesionTdv(t, { secret: S, now: T0 }).reason, 'bad-am');
  assert.equal(firmarSesionTdv({ ...claims, am: 'magia' }, { secret: S, now: T0 }), null);
});

test('no firma claims inválidos', () => {
  assert.equal(firmarSesionTdv({ ...claims, aid: 'no-es-uuid' }, { secret: S }), null);
  assert.equal(firmarSesionTdv({ ...claims, ep: -1 }, { secret: S }), null);
  assert.equal(firmarSesionTdv({ ...claims, ep: 1.5 }, { secret: S }), null);
  assert.equal(firmarSesionTdv({ ...claims, ent: { n: 7, hasta: 1 } }, { secret: S }), null);
});

test('ent (S-13) viaja firmado si es válido', () => {
  const t = firmarSesionTdv({ ...claims, ent: { n: 2, hasta: 1_900_000_000 } }, { secret: S, now: T0 });
  assert.deepEqual(verificarSesionTdv(t, { secret: S, now: T0 }).ent, { n: 2, hasta: 1_900_000_000 });
});

// ── Sin secreto: falla cerrado ───────────────────────────────────────
test('sin secreto, o con uno corto, no firma ni acepta', () => {
  assert.equal(firmarSesionTdv(claims, { secret: undefined }), null);
  assert.equal(firmarSesionTdv(claims, { secret: 'corto' }), null);
  const t = firmarSesionTdv(claims, { secret: S, now: T0 });
  assert.deepEqual(verificarSesionTdv(t, { secret: undefined, now: T0 }), { ok: false, reason: 'sin-secreto' });
  assert.deepEqual(verificarSesionTdv(t, { secret: '   ', now: T0 }), { ok: false, reason: 'sin-secreto' });
  assert.equal(firmarStateTdv({ sh: SH, next: '/' }, { secret: null }), null);
  assert.equal(verificarStateTdv('x.y', { secret: null }).reason, 'sin-secreto');
});

test('sin opts.secret lee TDV_SESSION_SECRET de process.env en cada llamada', () => {
  const previo = process.env.TDV_SESSION_SECRET;
  try {
    delete process.env.TDV_SESSION_SECRET;
    assert.equal(secretoSesionTdv(), null);
    assert.equal(firmarSesionTdv(claims), null);

    process.env.TDV_SESSION_SECRET = S;
    const t = firmarSesionTdv(claims);
    assert.equal(verificarSesionTdv(t).ok, true);

    // Se apaga el secreto: la misma cookie deja de valer al momento.
    delete process.env.TDV_SESSION_SECRET;
    assert.equal(verificarSesionTdv(t).reason, 'sin-secreto');
  } finally {
    if (previo === undefined) delete process.env.TDV_SESSION_SECRET;
    else process.env.TDV_SESSION_SECRET = previo;
  }
});

test('secretoValido recorta y exige 32 caracteres', () => {
  assert.equal(secretoValido(`  ${S}  `), S);
  assert.equal(secretoValido('x'.repeat(31)), null);
  assert.equal(secretoValido(123), null);
});

// ── Interruptor y lectura desde la cookie ────────────────────────────
test('sesionTdvDeCookie: con el interruptor apagado ignora una sesión válida', () => {
  const t = firmarSesionTdv(claims, { secret: S, now: T0 });
  assert.equal(sesionTdvDeCookie(t, { activa: false, secret: S, now: T0 }), null);
  assert.equal(sesionTdvDeCookie(t, { activa: 'true', secret: S, now: T0 }), null); // solo el booleano
  assert.equal(sesionTdvDeCookie(t, { activa: true, secret: S, now: T0 }).aid, AID);
});

test('sesionTdvDeCookie: sin secreto falla cerrado y NO cae a process.env', () => {
  const t = firmarSesionTdv(claims, { secret: S, now: T0 });
  const previo = process.env.TDV_SESSION_SECRET;
  try {
    process.env.TDV_SESSION_SECRET = S; // aunque el entorno lo tenga
    assert.equal(sesionTdvDeCookie(t, { activa: true, secret: undefined, now: T0 }), null);
    assert.equal(sesionTdvDeCookie(t, { activa: true, secret: 'corto', now: T0 }), null);
  } finally {
    if (previo === undefined) delete process.env.TDV_SESSION_SECRET;
    else process.env.TDV_SESSION_SECRET = previo;
  }
});

test('sesionTdvDeCookie: cookie vacía, manipulada o caducada → null', () => {
  const t = firmarSesionTdv(claims, { secret: S, now: T0 });
  assert.equal(sesionTdvDeCookie(undefined, { activa: true, secret: S, now: T0 }), null);
  assert.equal(sesionTdvDeCookie(t + '0', { activa: true, secret: S, now: T0 }), null);
  assert.equal(sesionTdvDeCookie(t, { activa: true, secret: S, now: T0 + SESION_TTL_S * 1000 }), null);
});

// ── Cookies __Host- ──────────────────────────────────────────────────
test('las dos cookies llevan el prefijo __Host-', () => {
  assert.ok(SESION_COOKIE.startsWith('__Host-'));
  assert.ok(STATE_COOKIE.startsWith('__Host-'));
});

test('opciones de cookie: Secure, HttpOnly, Path=/, Lax y SIN Domain (exigencias de __Host-)', () => {
  const o = opcionesCookieTdv(SESION_TTL_S);
  assert.deepEqual(o, { path: '/', httpOnly: true, secure: true, sameSite: 'lax', maxAge: SESION_TTL_S });
  assert.equal('domain' in o, false);
});

test('el borrado lleva Secure y Path=/ (sin ellos el navegador ignora el borrado de una __Host-)', () => {
  assert.equal(OPCIONES_BORRADO_TDV.secure, true);
  assert.equal(OPCIONES_BORRADO_TDV.path, '/');
  assert.equal('domain' in OPCIONES_BORRADO_TDV, false);
  assert.equal('maxAge' in OPCIONES_BORRADO_TDV, false);
});

// ── Familias distintas aunque compartan secreto (configuración errónea) ──
test('con el MISMO secreto, un token de compra no vale como sesión ni una sesión como compra', () => {
  const compra = generatePurchaseToken({ email: 'a@b.co', nivel: 3, slugs: ['libro'], orderId: '1' }, S);
  assert.equal(verificarSesionTdv(compra, { secret: S, now: Date.now() }).ok, false);
  assert.equal(verificarStateTdv(compra, { secret: S, now: Date.now() }).ok, false);
  const ses = firmarSesionTdv(claims, { secret: S });
  assert.equal(verifyPurchaseToken(ses, S).valid, false);
  const st = firmarStateTdv({ sh: SH, next: '/' }, { secret: S });
  assert.equal(verifyPurchaseToken(st, S).valid, false);
});

// ── State del salto ──────────────────────────────────────────────────
test('state: round-trip y caducidad a los 10 min', () => {
  const t = firmarStateTdv({ sh: SH, next: '/capitulo/cap-1' }, { secret: S, now: T0 });
  assert.deepEqual(verificarStateTdv(t, { secret: S, now: T0 + 1000 }), { ok: true, sh: SH, next: '/capitulo/cap-1' });
  assert.equal(verificarStateTdv(t, { secret: S, now: T0 + STATE_TTL_S * 1000 }).reason, 'expired');
});

test('state: no firma un hash que no es sha256 hex ni una ruta relativa', () => {
  assert.equal(firmarStateTdv({ sh: 'xyz', next: '/' }, { secret: S }), null);
  assert.equal(firmarStateTdv({ sh: SH, next: 'https://evil.com' }, { secret: S }), null);
});

test('state: guarda el hash, nunca el state en claro', () => {
  const t = firmarStateTdv({ sh: SH, next: '/' }, { secret: S, now: T0 });
  const payload = JSON.parse(Buffer.from(t.split('.')[0], 'base64url').toString('utf8'));
  assert.deepEqual(Object.keys(payload).sort(), ['exp', 'iat', 'next', 'p', 'sh']);
  assert.equal(payload.p, 'tdv-state');
});
