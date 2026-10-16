/**
 * Checks del salto portal → libro. Stdlib node:test, sin deps.
 * Correr: node --test src/lib/salto-tdv.test.mjs
 *
 * `resolverCallback` se prueba entero con un cliente de Supabase FALSO que honra la
 * semántica que importa: `update … where … returning` solo toca las filas que pasan
 * TODOS los filtros (así se ve el CAS de un solo uso) y `maybeSingle` devuelve la
 * primera o `null`.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {
  sha256Hex,
  nuevoState,
  hashesIguales,
  validarNext,
  urlAutorizar,
  enmascararCorreo,
  esMismoOrigen,
  resolverCallback,
} from './salto-tdv.mjs';
import { firmarStateTdv, verificarSesionTdv } from './sesion-tdv.mjs';

const ORIGEN = 'https://tejidosdevibracion.com';
const S = 'secreto-de-prueba-de-32-caracteres-o-mas';
const AID = '0b6f5a0e-3c1d-4e8a-9f2b-7d4c1e2a3b4c';
const T0 = Date.UTC(2026, 9, 7, 12, 0, 0);
const iso = (ms) => new Date(ms).toISOString();

// ── Cliente falso ────────────────────────────────────────────────────
function clienteFalso(tablas, { fallar = {}, lanzar = {} } = {}) {
  const llamadas = [];
  return {
    llamadas,
    tablas,
    from(tabla) {
      const st = { op: 'select', payload: null, cols: null, filtros: [] };
      const filas = () => tablas[tabla] ?? [];
      const pasa = (fila) =>
        st.filtros.every(([tipo, col, val]) => {
          if (tipo === 'eq') return fila[col] === val;
          if (tipo === 'is') return (fila[col] ?? null) === val;
          if (tipo === 'gt') return Date.parse(fila[col]) > Date.parse(val);
          return false;
        });
      const proyectar = (fila) => {
        if (!st.cols) return { ...fila };
        const out = {};
        for (const c of st.cols.split(',').map((x) => x.trim())) out[c] = fila[c];
        return out;
      };
      const b = {
        update(payload) {
          st.op = 'update';
          st.payload = payload;
          return b;
        },
        select(cols) {
          st.cols = cols;
          return b;
        },
        eq(col, val) {
          st.filtros.push(['eq', col, val]);
          return b;
        },
        is(col, val) {
          st.filtros.push(['is', col, val]);
          return b;
        },
        gt(col, val) {
          st.filtros.push(['gt', col, val]);
          return b;
        },
        abortSignal() {
          return b;
        },
        async maybeSingle() {
          llamadas.push({ tabla, op: st.op, filtros: st.filtros });
          if (lanzar[tabla]) throw new Error('AbortError');
          if (fallar[tabla]) return { data: null, error: { message: 'boom' } };
          const hit = filas().filter(pasa);
          if (st.op === 'update') for (const f of hit) Object.assign(f, st.payload);
          return { data: hit[0] ? proyectar(hit[0]) : null, error: null };
        },
      };
      return b;
    },
  };
}

/** Escenario estándar: el portal ya emitió un salto para (code, state). */
function escenario({ code = 'C'.repeat(43), state = nuevoState(), salto = {}, cuenta = {}, next = '/obertura/i' } = {}) {
  const tablas = {
    cuenta_saltos: [
      {
        code_hash: sha256Hex(code),
        account_id: AID,
        aud: 'tdv',
        state_hash: sha256Hex(state),
        session_epoch: 2,
        am: 'codigo',
        created_at: iso(T0 - 5_000),
        expires_at: iso(T0 + 55_000),
        used_at: null,
        ...salto,
      },
    ],
    cuentas: [{ account_id: AID, email: 'Ricardo@Gmail.com', session_epoch: 2, ...cuenta }],
  };
  const cookieState = firmarStateTdv({ sh: sha256Hex(state), next }, { secret: S, now: T0 - 5_000 });
  return { code, state, tablas, cookieState };
}

const llamar = (e, client, extra = {}) =>
  resolverCallback({
    code: e.code,
    state: e.state,
    cookieState: e.cookieState,
    origen: ORIGEN,
    client,
    secret: S,
    ahora: T0,
    ...extra,
  });

// ── Camino feliz ─────────────────────────────────────────────────────
test('callback correcto: canjea, firma la sesión con el am del salto y vuelve a next', async () => {
  const e = escenario();
  const db = clienteFalso(e.tablas);
  const r = await llamar(e, db);
  assert.equal(r.ok, true);
  assert.equal(r.next, '/obertura/i');
  const s = verificarSesionTdv(r.sesion, { secret: S, now: T0 });
  assert.equal(s.ok, true);
  assert.equal(s.aid, AID);
  assert.equal(s.ep, 2);
  assert.equal(s.am, 'codigo');
  assert.equal(s.em, 'r***@gmail.com');
  // El código queda gastado en la base.
  assert.equal(e.tablas.cuenta_saltos[0].used_at, iso(T0));
  // El CAS filtra por code_hash, aud, state_hash, used_at null y expires_at.
  const cas = db.llamadas[0];
  assert.equal(cas.tabla, 'cuenta_saltos');
  assert.equal(cas.op, 'update');
  assert.deepEqual(
    cas.filtros.map(([t, c]) => `${t}:${c}`),
    ['eq:code_hash', 'eq:aud', 'eq:state_hash', 'is:used_at', 'gt:expires_at'],
  );
});

// ── Rechazos ─────────────────────────────────────────────────────────
test('código reutilizado → el segundo canje falla (CAS)', async () => {
  const e = escenario();
  const db = clienteFalso(e.tablas);
  assert.equal((await llamar(e, db)).ok, true);
  const r2 = await llamar(e, db);
  assert.deepEqual(r2, { ok: false, next: '/obertura/i', motivo: 'canje' });
});

test('dos canjes simultáneos del mismo código → solo uno gana', async () => {
  const e = escenario();
  const db = clienteFalso(e.tablas);
  const [a, b] = await Promise.all([llamar(e, db), llamar(e, db)]);
  assert.equal([a, b].filter((r) => r.ok).length, 1);
});

test('código de más de 60 s (expires_at pasado) → canje', async () => {
  const e = escenario({ salto: { expires_at: iso(T0 - 1) } });
  const r = await llamar(e, clienteFalso(e.tablas));
  assert.equal(r.motivo, 'canje');
  assert.equal(e.tablas.cuenta_saltos[0].used_at, null);
});

test('aud cambiado en la fila → canje', async () => {
  const e = escenario({ salto: { aud: 'tdr' } });
  assert.equal((await llamar(e, clienteFalso(e.tablas))).motivo, 'canje');
});

test('sin cookie de state → state, sin tocar la base', async () => {
  const e = escenario();
  const db = clienteFalso(e.tablas);
  const r = await llamar(e, db, { cookieState: undefined });
  assert.deepEqual(r, { ok: false, next: '/', motivo: 'state' });
  assert.equal(db.llamadas.length, 0);
});

test('sin state en la query, o con otro state → rechazo antes del canje', async () => {
  const e = escenario();
  const db = clienteFalso(e.tablas);
  assert.equal((await llamar(e, db, { state: null })).motivo, 'parametros');
  assert.equal((await llamar(e, db, { state: nuevoState() })).motivo, 'state');
  assert.equal(db.llamadas.length, 0);
  assert.equal(e.tablas.cuenta_saltos[0].used_at, null);
});

test('state de OTRO navegador (CSRF de login): su cookie no casa con la fila', async () => {
  // El atacante obtiene un (code, state) suyo y se lo hace abrir a la víctima,
  // que tiene su propia cookie de state.
  const atacante = escenario();
  const victima = escenario({ next: '/' });
  const db = clienteFalso(atacante.tablas);
  const r = await llamar({ ...atacante, cookieState: victima.cookieState }, db);
  assert.equal(r.ok, false);
  assert.equal(r.motivo, 'state');
  assert.equal(atacante.tablas.cuenta_saltos[0].used_at, null);
});

test('cookie de state caducada (más de 10 min) → state', async () => {
  const e = escenario();
  const r = await llamar(e, clienteFalso(e.tablas), { ahora: T0 + 11 * 60_000 });
  assert.equal(r.motivo, 'state');
});

test('epoch cambiado entre emisión y canje («cerrar todo») → epoch', async () => {
  const e = escenario({ cuenta: { session_epoch: 3 } });
  assert.equal((await llamar(e, clienteFalso(e.tablas))).motivo, 'epoch');
});

test('cuenta borrada → cuenta', async () => {
  const e = escenario();
  e.tablas.cuentas = [];
  assert.equal((await llamar(e, clienteFalso(e.tablas))).motivo, 'cuenta');
});

test('am desconocido en el salto → am (falla cerrado)', async () => {
  const e = escenario({ salto: { am: 'magia' } });
  assert.equal((await llamar(e, clienteFalso(e.tablas))).motivo, 'am');
});

test('sin cliente de Supabase → config (cerrado)', async () => {
  const e = escenario();
  assert.deepEqual(await llamar(e, null), { ok: false, next: '/obertura/i', motivo: 'config' });
});

test('sin secreto → config, aunque todo lo demás valga', async () => {
  const e = escenario();
  const db = clienteFalso(e.tablas);
  assert.equal((await llamar(e, db, { secret: undefined })).motivo, 'config');
  assert.equal(db.llamadas.length, 0);
});

test('error o timeout de la base → consulta (cerrado)', async () => {
  const e1 = escenario();
  assert.equal((await llamar(e1, clienteFalso(e1.tablas, { fallar: { cuenta_saltos: true } }))).motivo, 'consulta');
  const e2 = escenario();
  assert.equal((await llamar(e2, clienteFalso(e2.tablas, { lanzar: { cuenta_saltos: true } }))).motivo, 'consulta');
  const e3 = escenario();
  assert.equal((await llamar(e3, clienteFalso(e3.tablas, { fallar: { cuentas: true } }))).motivo, 'consulta');
});

test('un next manipulado dentro de una cookie firmada se revalida al volver', async () => {
  for (const malo of ['/\\evil.com', '/x/..//evil.com', '/%2F%2Fevil.com']) {
    const e = escenario({ next: malo });
    const r = await llamar(e, clienteFalso(e.tablas));
    assert.equal(r.ok, true);
    assert.equal(r.next, '/', `debería descartar ${JSON.stringify(malo)}`);
  }
});

test('código emitido para OTRO state, aunque se conozca el state de la víctima → canje', async () => {
  // El atacante consigue (por una fuga) el state de la víctima y la lleva a su
  // callback con SU código: cookie y query casan, pero la fila del código está atada
  // a otro state_hash. Sin `state_hash` en el CAS, la víctima entraría con la cuenta
  // del atacante.
  const atacante = escenario();
  const victima = escenario({ next: '/' });
  const db = clienteFalso(atacante.tablas);
  const r = await llamar({ code: atacante.code, state: victima.state, cookieState: victima.cookieState }, db);
  assert.deepEqual(r, { ok: false, next: '/', motivo: 'canje' });
  assert.equal(atacante.tablas.cuenta_saltos[0].used_at, null);
});

test('state y firmas se comparan con timingSafeEqual (tiempo constante)', async () => {
  const original = crypto.timingSafeEqual;
  let llamadas = 0;
  crypto.timingSafeEqual = (a, b) => {
    llamadas += 1;
    return original(a, b);
  };
  try {
    assert.equal(hashesIguales(sha256Hex('a'), sha256Hex('a')), true);
    assert.equal(llamadas, 1, 'hashesIguales debe pasar por timingSafeEqual');
    llamadas = 0;
    const e = escenario();
    assert.equal((await llamar(e, clienteFalso(e.tablas))).ok, true);
    // firma de la cookie de state + comparación del state.
    assert.ok(llamadas >= 2, `el callback compara en tiempo constante (llamadas: ${llamadas})`);
  } finally {
    crypto.timingSafeEqual = original;
  }
});

// ── validarNext ──────────────────────────────────────────────────────
test('validarNext acepta rutas del mismo origen y conserva query y hash', () => {
  assert.equal(validarNext('/', ORIGEN), '/');
  assert.equal(validarNext('/capitulo/cap-1/i', ORIGEN), '/capitulo/cap-1/i');
  assert.equal(validarNext('/indice?x=1#y', ORIGEN), '/indice?x=1#y');
  assert.equal(validarNext('/a/../b', ORIGEN), '/b');
});

test('validarNext rechaza redirecciones abiertas y esquemas', () => {
  for (const malo of [
    '/\\evil.com',
    '//evil.com',
    '\\\\evil.com',
    '/\t/evil.com',
    '/\n/evil.com',
    'https://evil.com',
    'http://tejidosdevibracion.com/',
    'javascript:alert(1)',
    'data:text/html,x',
    'evil.com',
    ' /indice',
    '/ruta con espacio',
    '',
    null,
    undefined,
    42,
    '/' + 'a'.repeat(600),
  ]) {
    assert.equal(validarNext(malo, ORIGEN), null, `debería rechazar ${JSON.stringify(malo)}`);
  }
});

test('validarNext valida la SALIDA: la normalización de . y .. no fabrica //host', () => {
  for (const malo of [
    '/x/..//evil.com',
    '/.//evil.com',
    '/..//evil.com',
    '/x/%2e%2e//evil.com',
    '/a/.%2E//evil.com',
  ]) {
    assert.equal(validarNext(malo, ORIGEN), null, `debería rechazar ${JSON.stringify(malo)}`);
  }
});

test('validarNext rechaza barras codificadas en la ruta (%2F, %5C)', () => {
  for (const malo of ['/%2F%2Fevil.com', '/%2fevil.com/', '/libro/%2F%2Fevil.com', '/%5Cevil.com', '/./%5cevil.com']) {
    assert.equal(validarNext(malo, ORIGEN), null, `debería rechazar ${JSON.stringify(malo)}`);
  }
  // En la query o el hash no estorban: no son ruta.
  assert.equal(validarNext('/indice?x=%2F#%2F', ORIGEN), '/indice?x=%2F#%2F');
});

test('validarNext es idempotente: lo que acepta, lo vuelve a aceptar igual', () => {
  for (const bueno of ['/', '/capitulo/cap-1/i', '/indice?x=1#y', '/a/../b', '/x/..', '/%2e%2e', '/ñandú']) {
    const una = validarNext(bueno, ORIGEN);
    assert.notEqual(una, null, `debería aceptar ${JSON.stringify(bueno)}`);
    assert.equal(validarNext(una, ORIGEN), una, `no idempotente: ${JSON.stringify(bueno)}`);
    assert.ok(!una.startsWith('//'));
  }
});

test('validarNext no vuelve a /auth/* (sin bucles)', () => {
  assert.equal(validarNext('/auth/salir', ORIGEN), null);
  assert.equal(validarNext('/auth/entrar?next=/', ORIGEN), null);
  assert.equal(validarNext('/auth', ORIGEN), null);
  assert.equal(validarNext('/autor', ORIGEN), '/autor');
});

// ── Resto de piezas puras ────────────────────────────────────────────
test('sha256Hex y hashesIguales', () => {
  assert.equal(sha256Hex('abc'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  assert.equal(hashesIguales(sha256Hex('a'), sha256Hex('a')), true);
  assert.equal(hashesIguales(sha256Hex('a'), sha256Hex('b')), false);
  assert.equal(hashesIguales('abc', 'abcd'), false); // longitudes distintas: false, sin lanzar
  assert.equal(hashesIguales(undefined, 'x'), false);
});

test('nuevoState: 32 bytes en base64url, distinto cada vez', () => {
  const a = nuevoState();
  assert.match(a, /^[A-Za-z0-9_-]{43}$/);
  assert.notEqual(a, nuevoState());
});

test('urlAutorizar: añade aud y state; exige https salvo en localhost', () => {
  const st = nuevoState();
  const u = new URL(urlAutorizar('https://tejidosderealidad.com/cuenta/autorizar', st));
  assert.equal(u.origin, 'https://tejidosderealidad.com');
  assert.equal(u.pathname, '/cuenta/autorizar');
  assert.equal(u.searchParams.get('aud'), 'tdv');
  assert.equal(u.searchParams.get('state'), st);
  assert.ok(urlAutorizar('http://localhost:4321/cuenta/autorizar', st));
  assert.equal(urlAutorizar('http://tejidosderealidad.com/cuenta/autorizar', st), null);
  assert.equal(urlAutorizar('https://u:p@tejidosderealidad.com/x', st), null);
  assert.equal(urlAutorizar('no es url', st), null);
  assert.equal(urlAutorizar(undefined, st), null);
  assert.equal(urlAutorizar('https://tejidosderealidad.com/cuenta/autorizar', 'corto'), null);
});

test('enmascararCorreo', () => {
  assert.equal(enmascararCorreo('Ricardo@Gmail.com'), 'r***@gmail.com');
  assert.equal(enmascararCorreo('a@b.co'), 'a***@b.co');
  assert.equal(enmascararCorreo('ñandú@x.org'), 'ñ***@x.org');
  assert.equal(enmascararCorreo('sin-arroba'), null);
  assert.equal(enmascararCorreo('@x.org'), null);
  assert.equal(enmascararCorreo(null), null);
  assert.equal(enmascararCorreo('a\n@x.org'), null);
});

test('cuenta con un correo raro: entra igual, sin correo en el aviso', async () => {
  const e = escenario({ cuenta: { email: 'sin-arroba' } });
  const r = await llamar(e, clienteFalso(e.tablas));
  assert.equal(r.ok, true);
  assert.equal(verificarSesionTdv(r.sesion, { secret: S, now: T0 }).em, null);
});

test('esMismoOrigen: Origin igual o Sec-Fetch-Site same-origin; si no, cerrado', () => {
  const h = (o) => new Headers(o);
  assert.equal(esMismoOrigen(h({ origin: ORIGEN }), ORIGEN), true);
  assert.equal(esMismoOrigen(h({ 'sec-fetch-site': 'same-origin' }), ORIGEN), true);
  assert.equal(esMismoOrigen(h({ origin: ORIGEN, 'sec-fetch-site': 'same-origin' }), ORIGEN), true);
  assert.equal(esMismoOrigen(h({ origin: 'https://evil.com' }), ORIGEN), false);
  assert.equal(esMismoOrigen(h({ origin: ORIGEN, 'sec-fetch-site': 'cross-site' }), ORIGEN), false);
  assert.equal(esMismoOrigen(h({ origin: 'null' }), ORIGEN), false);
  assert.equal(esMismoOrigen(h({}), ORIGEN), false);
});
