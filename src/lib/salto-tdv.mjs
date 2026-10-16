/**
 * salto-tdv.mjs · El «salto» portal → libro (plan v2 §7.5 · S-12, parte del libro).
 *
 * 1. `/auth/entrar` crea un `state` aleatorio, guarda su HASH y la ruta de vuelta en
 *    `__Host-tdv_state` y redirige a `PORTAL_AUTORIZAR_URL?aud=tdv&state=…`.
 * 2. El portal autentica, guarda en `cuenta_saltos` el hash de un código de 60 s
 *    (con `state_hash`, `session_epoch` y `am`) y vuelve a `/auth/callback?code&state`.
 * 3. `/auth/callback` (`resolverCallback`): compara el `state` con el de la cookie,
 *    canjea el código de forma atómica (CAS sobre `used_at`), comprueba que el epoch
 *    de la cuenta no ha cambiado y firma `__Host-tdv_sesion`.
 *
 * CONTRATO con el portal (`cuenta_saltos`, migración 20261007120100_cuentas_v2.sql):
 *   code_hash  = sha256 hex (minúsculas) del `code` TAL COMO viaja en la query.
 *   state_hash = sha256 hex (minúsculas) del `state` TAL COMO viaja en la query.
 *   aud = 'tdv' · am ∈ METODOS_ACCESO · expires_at = emisión + 60 s · used_at null.
 *
 * Lógica pura con dependencias inyectadas (cliente de Supabase, reloj): se prueba con
 * `node --test` y un cliente falso. Nada de esto lee el entorno.
 */
import crypto from 'node:crypto';
import { METODOS_ACCESO, firmarSesionTdv, verificarStateTdv } from './sesion-tdv.mjs';

/** Tiempo máximo de cada consulta del canje, reintentos de postgrest incluidos. */
export const SALTO_TIMEOUT_MS = 2000;
/** Tope de la ruta de vuelta: viaja dentro de una cookie firmada. */
export const NEXT_MAX = 512;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// `code` y `state` son base64url de 32 bytes (43 caracteres). Se admite un margen
// para no acoplar el libro a la longitud exacta que emita el portal.
const PARAM_SALTO = /^[A-Za-z0-9_-]{16,256}$/;

/** sha256 en hexadecimal minúsculo. */
export function sha256Hex(valor) {
  return crypto.createHash('sha256').update(String(valor), 'utf8').digest('hex');
}

/** `state` nuevo: 32 bytes aleatorios en base64url. */
export function nuevoState() {
  return crypto.randomBytes(32).toString('base64url');
}

/** Compara dos hashes en tiempo constante (longitudes distintas → false, sin lanzar). */
export function hashesIguales(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const x = Buffer.from(a, 'utf8');
  const y = Buffer.from(b, 'utf8');
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

/** ¿Tiene `code`/`state` la forma de un parámetro del salto? */
export function esParamSalto(valor) {
  return typeof valor === 'string' && PARAM_SALTO.test(valor);
}

/**
 * Ruta de vuelta segura, o `null`. Solo rutas absolutas del MISMO origen:
 * `new URL(next, origen).origin === origen`, y antes de eso se rechaza lo que un
 * navegador podría leer como otro host (`//x`, `/\x`, `\`, espacios y controles: el
 * parser de URL quita tabuladores y saltos de línea, y `\` equivale a `/`). Nunca
 * vuelve a `/auth/*` (evita bucles de entrar/salir).
 *
 * La SALIDA también se valida: la normalización de `.` y `..` puede FABRICAR un
 * `//host` que la entrada no tenía (`/x/..//evil.com`, `/.//evil.com` y
 * `/x/%2e%2e//evil.com` dan `//evil.com`, que en un `Location` o un `href` es otro
 * dominio). Y fuera las barras codificadas (`%2F`, `%5C`) en la ruta: ninguna ruta
 * del libro las usa, y un redirect de Vercel que las decodificara (`/:path+/`,
 * `/libro/:path*` en vercel.json) las convertiría en `//host`.
 * @param {unknown} next
 * @param {string} origen  p. ej. `https://tejidosdevibracion.com`
 * @returns {string|null}  ruta normalizada (pathname + search + hash)
 */
export function validarNext(next, origen) {
  if (typeof next !== 'string' || next.length === 0 || next.length > NEXT_MAX) return null;
  if (next[0] !== '/' || next[1] === '/' || next[1] === '\\') return null;
  if (/[\\\s\u0000-\u001f\u007f]/.test(next)) return null;
  let base;
  let u;
  try {
    base = new URL(origen);
    u = new URL(next, base);
  } catch {
    return null;
  }
  if (u.origin !== base.origin) return null;
  if (!u.pathname.startsWith('/') || u.pathname.startsWith('//')) return null;
  if (/%(2f|5c)/i.test(u.pathname)) return null;
  if (u.pathname === '/auth' || u.pathname.startsWith('/auth/')) return null;
  return u.pathname + u.search + u.hash;
}

/**
 * URL del portal para autorizar el salto, o `null` si la base no vale: tiene que ser
 * https (http solo en localhost, para probar en local) y sin credenciales.
 * @param {string|null|undefined} base  `PORTAL_AUTORIZAR_URL`
 * @param {string} state
 * @returns {string|null}
 */
export function urlAutorizar(base, state) {
  if (typeof base !== 'string' || !esParamSalto(state)) return null;
  let u;
  try {
    u = new URL(base.trim());
  } catch {
    return null;
  }
  const local = u.hostname === 'localhost' || u.hostname === '127.0.0.1' || u.hostname === '[::1]';
  if (u.protocol !== 'https:' && !(u.protocol === 'http:' && local)) return null;
  if (u.username || u.password) return null;
  u.hash = '';
  u.searchParams.set('aud', 'tdv');
  u.searchParams.set('state', state);
  return u.toString();
}

/**
 * `ricardo@gmail.com` → `r***@gmail.com`. Solo la primera letra y el dominio.
 * @param {unknown} email
 * @returns {string|null}
 */
export function enmascararCorreo(email) {
  if (typeof email !== 'string') return null;
  const e = email.trim().toLowerCase();
  if (/[\u0000-\u001f\u007f]/.test(e)) return null;
  const at = e.lastIndexOf('@');
  if (at <= 0 || at === e.length - 1) return null;
  const primera = Array.from(e.slice(0, at))[0];
  const enmascarado = `${primera}***@${e.slice(at + 1)}`;
  return enmascarado.length <= 254 ? enmascarado : null;
}

/**
 * ¿La petición viene del mismo origen? Para el POST de `/auth/salir` (Astro ya
 * comprueba el origen de los formularios; esto es la segunda capa, y la que vale
 * si alguien lo llama con otro content-type). Sin ninguna de las dos cabeceras,
 * falla cerrado.
 * @param {{ get(name: string): string|null }} headers
 * @param {string} origen
 */
export function esMismoOrigen(headers, origen) {
  const sfs = headers.get('sec-fetch-site');
  if (sfs && sfs !== 'same-origin') return false;
  const o = headers.get('origin');
  if (o) {
    try {
      return new URL(o).origin === new URL(origen).origin;
    } catch {
      return false;
    }
  }
  return sfs === 'same-origin';
}

/**
 * Canje atómico del código en `cuenta_saltos` + comprobación del epoch.
 *
 * CAS: `update cuenta_saltos set used_at = ahora where code_hash = $1 and aud = 'tdv'
 * and state_hash = $2 and used_at is null and expires_at > ahora returning …`. Gana
 * quien obtiene la fila; los demás reciben `null` (código usado, caducado, de otro
 * `state` o de otro `aud`: no se distingue, y no se le dice a nadie).
 *
 * @param {any} client  cliente de supabase-js con la clave de servidor
 * @param {{ codeHash: string, stateHash: string, ahora: number, timeoutMs?: number }} args
 * @returns {Promise<{ok:true, aid:string, ep:number, am:string, em:string|null} | {ok:false, motivo:string}>}
 */
export async function canjearSalto(client, { codeHash, stateHash, ahora, timeoutMs = SALTO_TIMEOUT_MS }) {
  const ahoraIso = new Date(ahora).toISOString();

  let salto;
  try {
    const { data, error } = await client
      .from('cuenta_saltos')
      .update({ used_at: ahoraIso })
      .eq('code_hash', codeHash)
      .eq('aud', 'tdv')
      .eq('state_hash', stateHash)
      .is('used_at', null)
      .gt('expires_at', ahoraIso)
      .select('account_id, session_epoch, am')
      .abortSignal(AbortSignal.timeout(timeoutMs))
      .maybeSingle();
    if (error) return { ok: false, motivo: 'consulta' };
    if (!data) return { ok: false, motivo: 'canje' };
    salto = data;
  } catch {
    return { ok: false, motivo: 'consulta' };
  }

  const aid = typeof salto.account_id === 'string' ? salto.account_id : '';
  const ep = salto.session_epoch;
  if (!UUID.test(aid) || !Number.isInteger(ep) || ep < 0) return { ok: false, motivo: 'salto-invalido' };
  if (!METODOS_ACCESO.includes(salto.am)) return { ok: false, motivo: 'am' };

  // «Cerrar en todos los dispositivos» entre la emisión y el canje sube el epoch:
  // un código emitido antes no debe abrir una sesión nueva.
  let cuenta;
  try {
    const { data, error } = await client
      .from('cuentas')
      .select('session_epoch, email')
      .eq('account_id', aid)
      .abortSignal(AbortSignal.timeout(timeoutMs))
      .maybeSingle();
    if (error) return { ok: false, motivo: 'consulta' };
    if (!data) return { ok: false, motivo: 'cuenta' };
    cuenta = data;
  } catch {
    return { ok: false, motivo: 'consulta' };
  }
  if (cuenta.session_epoch !== ep) return { ok: false, motivo: 'epoch' };

  return { ok: true, aid, ep, am: salto.am, em: enmascararCorreo(cuenta.email) };
}

/**
 * Decisión completa de `/auth/callback`. El endpoint solo hace la E/S (leer y borrar
 * la cookie, fijar la sesión y responder).
 *
 * `motivo` es para los registros del servidor; al visitante nunca se le dice cuál
 * fue. `next` sale de la cookie de estado (revalidado) o es `/`.
 *
 * @param {{
 *   code: string|null, state: string|null,
 *   cookieState: string|null|undefined,
 *   origen: string,
 *   client: any|null,
 *   secret: string|null|undefined,
 *   ahora?: number,
 *   timeoutMs?: number,
 * }} ctx
 * @returns {Promise<{ok:true, next:string, sesion:string} | {ok:false, next:string, motivo:string}>}
 */
export async function resolverCallback(ctx) {
  const ahora = typeof ctx.ahora === 'number' ? ctx.ahora : Date.now();
  const st = verificarStateTdv(ctx.cookieState, { secret: ctx.secret, now: ahora });
  const next = (st.ok && validarNext(st.next, ctx.origen)) || '/';
  const fallo = (motivo) => ({ ok: false, next, motivo });

  if (!st.ok) return fallo(st.reason === 'sin-secreto' ? 'config' : 'state');
  if (!esParamSalto(ctx.state) || !esParamSalto(ctx.code)) return fallo('parametros');
  if (!hashesIguales(sha256Hex(ctx.state), st.sh)) return fallo('state');
  // Sin cliente (faltan PUBLIC_SUPABASE_URL / SUPABASE_SECRET_KEY) no hay canje: cerrado.
  if (!ctx.client) return fallo('config');

  const canje = await canjearSalto(ctx.client, {
    codeHash: sha256Hex(ctx.code),
    stateHash: st.sh,
    ahora,
    timeoutMs: ctx.timeoutMs,
  });
  if (!canje.ok) return fallo(canje.motivo);

  const sesion = firmarSesionTdv(
    { aid: canje.aid, ep: canje.ep, am: canje.am, em: canje.em },
    { secret: ctx.secret, now: ahora },
  );
  if (!sesion) return fallo('config');
  return { ok: true, next, sesion };
}
