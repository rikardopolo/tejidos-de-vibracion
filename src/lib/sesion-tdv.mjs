/**
 * sesion-tdv.mjs · Sesión del libro (`__Host-tdv_sesion`) y estado del salto
 * (`__Host-tdv_state`). Plan v2 §7.4 y §7.5 · S-12, parte del libro.
 *
 * Formato (patrón purchase-token.mjs): `base64url(JSON).hmacHex`, HMAC-SHA256 y
 * comparación con timingSafeEqual. Dos familias con el MISMO secreto
 * (`TDV_SESSION_SECRET`), separadas por el discriminador `p`, que el verify EXIGE:
 *   - `sesion-tdv` · 30 días · {p, aud:'tdv', aid, ep, am, iat, exp, em?, ent?}
 *   - `tdv-state`  · 10 min  · {p, sh, next, iat, exp}
 * Tiempos en SEGUNDOS, como la sesión del portal (`token.ts`).
 *
 * `em` (añadido al payload del v2): el correo de la cuenta YA ENMASCARADO
 * (`r***@gmail.com`), para el aviso «Entraste como…» sin consultar la base en cada
 * página. Nunca el correo en claro. `ent` = `{n, hasta}` (S-13): marca firmada del
 * último nivel ≥ 2 que la base confirmó, `hasta` en segundos; solo se usa si la base
 * no responde (D4). La escribe `reemitirSesionTdv` conservando `exp`.
 *
 * Falla cerrado: sin secreto, o con menos de 32 caracteres, no firma (`null`) ni
 * acepta (`{ok:false}`). El secreto se lee en cada llamada (`process.env` dentro de
 * la función) salvo que el llamador lo pase en `opts.secret`: los endpoints y
 * `gating.ts` lo pasan leído con `readEnv`, para que el `.env` de `astro dev`
 * también valga. Pasar `secret: undefined` NO cae a `process.env`: falla cerrado.
 *
 * Lógica pura, testeable con `node --test`.
 */
import crypto from 'node:crypto';

export const SESION_COOKIE = '__Host-tdv_sesion';
export const STATE_COOKIE = '__Host-tdv_state';
export const SESION_TTL_S = 30 * 24 * 60 * 60; // 30 días absolutos (no se renueva al usarse)
export const STATE_TTL_S = 10 * 60; // 10 min para ir al portal y volver
export const SECRETO_MIN = 32;

/**
 * Cómo se entró en el portal (`am`). La MISMA lista que `MetodoAcceso` del portal
 * (`apps/portal/src/lib/token.ts`). Un valor fuera de ella se rechaza: si el portal
 * añade un método, hay que añadirlo aquí también.
 */
export const METODOS_ACCESO = Object.freeze(['enlace', 'codigo', 'contrasena', 'passkey', 'respaldo', 'google']);

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HEX64 = /^[0-9a-f]{64}$/;
const TOKEN_MAX = 4096; // tope de una cookie: nada más largo puede ser nuestro

/** El secreto recortado si vale (≥ 32 caracteres), o `null`. */
export function secretoValido(valor) {
  if (typeof valor !== 'string') return null;
  const s = valor.trim();
  return s.length >= SECRETO_MIN ? s : null;
}

/** `TDV_SESSION_SECRET` de `process.env`, leído en cada llamada. */
export function secretoSesionTdv() {
  const env = typeof process !== 'undefined' && process.env ? process.env : {};
  return secretoValido(env.TDV_SESSION_SECRET);
}

function resolverSecreto(opts) {
  return opts && Object.prototype.hasOwnProperty.call(opts, 'secret')
    ? secretoValido(opts.secret)
    : secretoSesionTdv();
}

/** Ahora en segundos. `opts.now` va en milisegundos (como `Date.now()`). */
function ahoraS(opts) {
  const ms = typeof opts?.now === 'number' ? opts.now : Date.now();
  return Math.floor(ms / 1000);
}

function firmar(payload, secret) {
  const body = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const sig = crypto.createHmac('sha256', secret).update(body).digest('hex');
  return `${body}.${sig}`;
}

/** Comprueba la firma y devuelve el payload, sin mirar todavía su contenido. */
function abrir(token, secret) {
  if (typeof token !== 'string' || token.length === 0 || token.length > TOKEN_MAX) {
    return { ok: false, reason: 'malformed' };
  }
  const dot = token.indexOf('.');
  if (dot <= 0 || token.indexOf('.', dot + 1) !== -1) return { ok: false, reason: 'malformed' };

  const body = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const esperada = crypto.createHmac('sha256', secret).update(body).digest('hex');
  const a = Buffer.from(sig, 'utf8');
  const b = Buffer.from(esperada, 'utf8');
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return { ok: false, reason: 'bad-signature' };

  let payload;
  try {
    payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
  } catch {
    return { ok: false, reason: 'malformed' };
  }
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return { ok: false, reason: 'malformed' };
  return { ok: true, payload };
}

function emValido(em) {
  return typeof em === 'string' && em.length > 0 && em.length <= 254 && !/[\u0000-\u001f\u007f]/.test(em);
}

function entValida(ent) {
  return (
    !!ent &&
    typeof ent === 'object' &&
    (ent.n === 1 || ent.n === 2 || ent.n === 3) &&
    typeof ent.hasta === 'number' &&
    Number.isFinite(ent.hasta)
  );
}

/**
 * Firma la sesión del libro. `null` si falta el secreto o algún claim no vale
 * (solo se firman valores conocidos, igual que la sesión del portal).
 * @param {{ aid: string, ep: number, am: string, em?: string, ent?: { n: 1|2|3, hasta: number } }} claims
 * @param {{ secret?: string|null, now?: number }} [opts]
 * @returns {string|null}
 */
export function firmarSesionTdv(claims, opts = {}) {
  const secret = resolverSecreto(opts);
  if (!secret || !claims) return null;
  if (typeof claims.aid !== 'string' || !UUID.test(claims.aid)) return null;
  if (!Number.isInteger(claims.ep) || claims.ep < 0) return null;
  if (!METODOS_ACCESO.includes(claims.am)) return null;

  const iat = ahoraS(opts);
  const payload = {
    p: 'sesion-tdv',
    aud: 'tdv',
    aid: claims.aid.toLowerCase(),
    ep: claims.ep,
    am: claims.am,
    iat,
    exp: iat + SESION_TTL_S,
  };
  if (claims.em !== undefined && claims.em !== null) {
    if (!emValido(claims.em)) return null;
    payload.em = claims.em;
  }
  if (claims.ent !== undefined && claims.ent !== null) {
    if (!entValida(claims.ent)) return null;
    payload.ent = { n: claims.ent.n, hasta: claims.ent.hasta };
  }
  return firmar(payload, secret);
}

/**
 * Vuelve a firmar una sesión YA VERIFICADA cambiando solo la marca `ent` (S-13,
 * plan v2 §7.7 y D4). Conserva `aid`, `ep`, `am`, `em`, `iat` y, sobre todo, `exp`:
 * reescribir la marca no alarga la sesión (30 días absolutos desde el canje).
 * `ent: null` la quita. `null` si falta el secreto, la sesión ya caducó o la marca
 * no vale. Quien la llama decide CUÁNDO (solo tras una consulta correcta a la
 * base: `acceso-cuenta.mjs`).
 * @param {{ aid: string, ep: number, am: string, iat: number, exp: number, em?: string|null }} sesion
 * @param {{ n: 1|2|3, hasta: number }|null} ent  `hasta` en segundos
 * @param {{ secret?: string|null, now?: number }} [opts]
 * @returns {string|null}
 */
export function reemitirSesionTdv(sesion, ent, opts = {}) {
  const secret = resolverSecreto(opts);
  if (!secret || !sesion) return null;
  if (typeof sesion.aid !== 'string' || !UUID.test(sesion.aid)) return null;
  if (!Number.isInteger(sesion.ep) || sesion.ep < 0) return null;
  if (!METODOS_ACCESO.includes(sesion.am)) return null;
  if (!Number.isInteger(sesion.iat) || !Number.isInteger(sesion.exp)) return null;
  if (ahoraS(opts) >= sesion.exp) return null;

  const payload = {
    p: 'sesion-tdv',
    aud: 'tdv',
    aid: sesion.aid.toLowerCase(),
    ep: sesion.ep,
    am: sesion.am,
    iat: sesion.iat,
    exp: sesion.exp,
  };
  if (sesion.em !== undefined && sesion.em !== null) {
    if (!emValido(sesion.em)) return null;
    payload.em = sesion.em;
  }
  if (ent !== undefined && ent !== null) {
    if (!entValida(ent)) return null;
    payload.ent = { n: ent.n, hasta: ent.hasta };
  }
  return firmar(payload, secret);
}

/**
 * Verifica la sesión del libro: firma, `p`, `aud`, campos y caducidad. Sin base.
 * @param {string|null|undefined} token
 * @param {{ secret?: string|null, now?: number }} [opts]
 */
export function verificarSesionTdv(token, opts = {}) {
  const secret = resolverSecreto(opts);
  if (!secret) return { ok: false, reason: 'sin-secreto' };
  if (!token) return { ok: false, reason: 'sin-cookie' };

  const r = abrir(token, secret);
  if (!r.ok) return r;
  const p = r.payload;

  if (p.p !== 'sesion-tdv') return { ok: false, reason: 'wrong-purpose' };
  if (p.aud !== 'tdv') return { ok: false, reason: 'wrong-aud' };
  if (
    typeof p.aid !== 'string' ||
    !UUID.test(p.aid) ||
    !Number.isInteger(p.ep) ||
    p.ep < 0 ||
    typeof p.iat !== 'number' ||
    typeof p.exp !== 'number'
  ) {
    return { ok: false, reason: 'missing-fields' };
  }
  if (!METODOS_ACCESO.includes(p.am)) return { ok: false, reason: 'bad-am' };
  if (p.em !== undefined && !emValido(p.em)) return { ok: false, reason: 'malformed' };
  if (p.ent !== undefined && !entValida(p.ent)) return { ok: false, reason: 'malformed' };
  if (ahoraS(opts) >= p.exp) return { ok: false, reason: 'expired' };

  return {
    ok: true,
    aid: p.aid,
    ep: p.ep,
    am: p.am,
    iat: p.iat,
    exp: p.exp,
    em: p.em ?? null,
    ent: p.ent ? { n: p.ent.n, hasta: p.ent.hasta } : null,
  };
}

/**
 * Sesión del libro a partir del valor crudo de la cookie, o `null`. Con el
 * interruptor apagado (`activa: false`) siempre `null`, aunque la cookie sea válida:
 * es la reversión. `secret` se pasa SIEMPRE (aunque sea `undefined`): así nunca cae
 * a `process.env` y sin secreto falla cerrado.
 * @param {string|null|undefined} valor
 * @param {{ activa: boolean, secret: string|null|undefined, now?: number }} opts
 */
export function sesionTdvDeCookie(valor, { activa, secret, now } = { activa: false, secret: undefined }) {
  if (activa !== true || !valor) return null;
  const r = verificarSesionTdv(valor, now === undefined ? { secret } : { secret, now });
  return r.ok ? r : null;
}

/**
 * Opciones de las dos cookies `__Host-`: el prefijo EXIGE `Secure`, `Path=/` y sin
 * `Domain` (si falta algo, el navegador descarta la cookie). `HttpOnly` y `Lax`, para
 * que viajen en la vuelta del portal (navegación de primer nivel con GET) y no en
 * peticiones de terceros.
 * @param {number} maxAge  segundos
 */
export function opcionesCookieTdv(maxAge) {
  return { path: '/', httpOnly: true, secure: true, sameSite: /** @type {const} */ ('lax'), maxAge };
}

/**
 * Borrado de una cookie `__Host-`. Lleva `Secure` a propósito: el navegador IGNORA
 * un `Set-Cookie` de una `__Host-` sin `Secure`, así que un borrado sin él no borra.
 */
export const OPCIONES_BORRADO_TDV = Object.freeze({
  path: '/',
  httpOnly: true,
  secure: true,
  sameSite: /** @type {const} */ ('lax'),
});

/**
 * Firma el estado del salto: el HASH del `state` (nunca el `state` en claro) y la
 * ruta de vuelta, ya validada por quien llama (`validarNext`).
 * @param {{ sh: string, next: string }} claims
 * @param {{ secret?: string|null, now?: number }} [opts]
 * @returns {string|null}
 */
export function firmarStateTdv(claims, opts = {}) {
  const secret = resolverSecreto(opts);
  if (!secret || !claims) return null;
  if (typeof claims.sh !== 'string' || !HEX64.test(claims.sh)) return null;
  if (typeof claims.next !== 'string' || claims.next[0] !== '/') return null;
  const iat = ahoraS(opts);
  return firmar({ p: 'tdv-state', sh: claims.sh, next: claims.next, iat, exp: iat + STATE_TTL_S }, secret);
}

/**
 * @param {string|null|undefined} token
 * @param {{ secret?: string|null, now?: number }} [opts]
 */
export function verificarStateTdv(token, opts = {}) {
  const secret = resolverSecreto(opts);
  if (!secret) return { ok: false, reason: 'sin-secreto' };
  if (!token) return { ok: false, reason: 'sin-cookie' };

  const r = abrir(token, secret);
  if (!r.ok) return r;
  const p = r.payload;

  if (p.p !== 'tdv-state') return { ok: false, reason: 'wrong-purpose' };
  if (typeof p.sh !== 'string' || !HEX64.test(p.sh) || typeof p.next !== 'string' || typeof p.exp !== 'number') {
    return { ok: false, reason: 'missing-fields' };
  }
  if (ahoraS(opts) >= p.exp) return { ok: false, reason: 'expired' };
  return { ok: true, sh: p.sh, next: p.next };
}
