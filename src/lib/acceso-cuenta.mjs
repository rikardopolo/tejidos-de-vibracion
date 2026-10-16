/**
 * acceso-cuenta.mjs · Nivel 2 por la CUENTA de la sesión del libro (S-13).
 * Plan v2 §7.4, §7.7 y D4; plan de implementación, bloque S-13 (punto 2).
 *
 * La sesión firmada (`__Host-tdv_sesion`, `sesion-tdv.mjs`) da el nivel 1 sin tocar la
 * base. El nivel 2 SÍ consulta la base, por `account_id`, en cada página de pago:
 *   1. `cuentas.session_epoch` debe ser igual al `ep` de la sesión. Si «Cerrar sesión
 *      en todos los dispositivos» lo subió, o la cuenta ya no existe, la sesión está
 *      REVOCADA: no da nada y quien llama borra la cookie.
 *   2. `subscriptions` de la cuenta → `resolveSubscriptionGate` (el alcance sale del
 *      catálogo en el servidor, nunca de la cookie).
 *   3. `orders` pagadas de la cuenta → nivel y slug del catálogo (`SLUG_NIVEL`).
 *   Las tres van en paralelo bajo UN mismo límite de 2 s (`AbortSignal.timeout`).
 *
 * En PRODUCCIÓN (`VERCEL_ENV=production`) no cuentan las filas de Test Mode
 * (`test_mode = true`), ni órdenes ni suscripciones: Preview escribe en la MISMA base
 * (Supabase compartido) y una suscripción de prueba no puede abrir el libro real.
 *
 * Marca `ent` (D4) = `{n, hasta}`, firmada dentro de la sesión:
 *   - se ESCRIBE solo tras una consulta correcta que concede nivel ≥ 2, con
 *     `hasta = min(ahora + 24 h, fin del derecho)` (fin del periodo pagado, `ends_at`
 *     de una cancelada, fin de la gracia de un impago; una compra única no caduca);
 *   - se BORRA si una consulta correcta niega el nivel 2;
 *   - se USA únicamente si la base no responde (red, timeout, 5xx): nunca sobrevive
 *     a su `hasta`, así que no estira el acceso más allá del periodo pagado.
 * Configuración rota (sin cliente, PostgREST 401/403 = clave revocada, o cualquier
 * otro 4xx = esquema o consulta rotos) → CERRADO (nivel 1) y aviso; la marca no se
 * usa ni se toca.
 *
 * Sin red propia: el cliente de Supabase entra por parámetro (testeable con un
 * cliente falso en `node --test`).
 */
import { resolveSubscriptionGate, GRACIA_MS } from './subscription-gate.mjs';
import { SLUG_NIVEL, SUBSCRIPTION_SLUGS } from './product-slugs.mjs';

/** Tope de la consulta entera (las tres a la vez), igual que el resto del gating. */
export const TIMEOUT_ACCESO_MS = 2000;
/** La marca `ent` dura como mucho 24 h (D4). */
export const ENT_MAX_S = 24 * 60 * 60;
/** Una marca vigente solo se reescribe si la nueva alarga su `hasta` al menos 1 h (evita un Set-Cookie por página). */
export const ENT_REFRESCO_S = 60 * 60;
// Holgura de reloj al aceptar una marca: una `hasta` más lejana que 24 h + esto no es nuestra.
const ENT_HOLGURA_S = 5 * 60;

/** ¿Despliegue de producción? Se lee en cada llamada. */
export function esProduccion(env = typeof process !== 'undefined' && process.env ? process.env : {}) {
  return String(env?.VERCEL_ENV ?? '').trim() === 'production';
}

/**
 * Alcance (slugs) que da un nivel, calculado desde el catálogo. Lo usa la marca `ent`,
 * que solo guarda el nivel: con `n = 2`, todo lo de nivel 2 (el mismo alcance que la
 * suscripción); con `n = 3`, además lo de nivel 3.
 * @param {number} n
 * @returns {string[]}
 */
export function alcanceDeNivel(n) {
  if (!(n >= 2)) return [];
  return Object.keys(SLUG_NIVEL).filter((s) => SLUG_NIVEL[s].nivel <= n);
}

/**
 * Une dos accesos: el nivel mayor y la unión de slugs. Objeto nuevo.
 * @param {{ nivel: number, slugs: string[] }} a
 * @param {{ nivel: number, slugs: string[] }} b
 */
export function combinarAccesos(a, b) {
  return {
    nivel: /** @type {0|1|2|3} */ (Math.max(a.nivel, b.nivel)),
    slugs: [...new Set([...(a.slugs ?? []), ...(b.slugs ?? [])])],
  };
}

function ms(v) {
  return v == null ? NaN : new Date(v).getTime();
}

/**
 * Hasta cuándo dura el derecho que da una fila de `subscriptions` que HOY concede, en
 * milisegundos. `Infinity` si no tiene fin conocido (la marca queda entonces en 24 h).
 *   - active / on_trial → `current_period_end` (fin del periodo pagado o de la prueba)
 *   - cancelled         → `ends_at`
 *   - past_due          → `current_period_end` + gracia
 *   - paused (free)     → sin fin (la pausa gratuita no corta el acceso)
 * @param {{ status: string, ends_at?: any, current_period_end?: any }} sub
 * @param {number} [graciaMs]
 */
export function finDelDerecho(sub, graciaMs = GRACIA_MS) {
  let fin = NaN;
  if (sub.status === 'active' || sub.status === 'on_trial') fin = ms(sub.current_period_end);
  else if (sub.status === 'cancelled') fin = ms(sub.ends_at);
  else if (sub.status === 'past_due') fin = ms(sub.current_period_end) + graciaMs;
  return Number.isFinite(fin) ? fin : Infinity;
}

/**
 * Clasifica una respuesta fallida de supabase-js por su `status` HTTP:
 *   - 0 (red, DNS, `AbortError` del timeout), 408, 429 y 5xx → `caida`: la base no
 *     respondió; aquí, y solo aquí, vale la marca `ent`.
 *   - 401 / 403 → `config`: clave revocada o sin permiso. No pasa sola.
 *   - cualquier otro 4xx → `config`: tabla o columna que no existen, consulta mal
 *     formada. Tampoco es una caída: la base respondió y dijo que no.
 * @param {{ status?: number|null }|null|undefined} res
 * @returns {'caida'|'config'}
 */
export function clasificarFallo(res) {
  const st = Number(res?.status ?? 0);
  if (!Number.isFinite(st) || st === 0 || st === 408 || st === 429 || st >= 500) return 'caida';
  return 'config';
}

/**
 * Las tres consultas del nivel 2, en paralelo y con UN límite común.
 * @param {any} client  cliente de supabase-js con la clave de servidor
 * @param {string} aid  `account_id` de la sesión
 * @param {{ timeoutMs?: number }} [opts]
 * @returns {Promise<{ ok: true, cuenta: { session_epoch: number }|null, subs: any[], ordenes: any[] }
 *   | { ok: false, tipo: 'caida'|'config', status: number }>}
 */
export async function consultarCuenta(client, aid, { timeoutMs = TIMEOUT_ACCESO_MS } = {}) {
  const signal = AbortSignal.timeout(timeoutMs);
  const consultas = Promise.all([
    client.from('cuentas').select('session_epoch').eq('account_id', aid).abortSignal(signal).maybeSingle(),
    client
      .from('subscriptions')
      .select('status, ends_at, current_period_end, pause, test_mode')
      .eq('account_id', aid)
      .abortSignal(signal),
    client
      .from('orders')
      .select('product_slug, status, test_mode')
      .eq('account_id', aid)
      .eq('status', 'paid')
      .abortSignal(signal),
  ]);

  // Red de seguridad: si algo no respetara la señal, el límite se cumple igual.
  let timer;
  const limite = new Promise((resolve) => {
    timer = setTimeout(() => resolve('timeout'), timeoutMs + 250);
    timer.unref?.();
  });

  let resultado;
  try {
    resultado = await Promise.race([consultas, limite]);
  } catch {
    // supabase-js no lanza (devuelve `error`), pero un cliente roto sí podría.
    return { ok: false, tipo: 'caida', status: 0 };
  } finally {
    clearTimeout(timer);
  }
  if (resultado === 'timeout') return { ok: false, tipo: 'caida', status: 0 };

  const fallidas = resultado.filter((r) => r?.error);
  if (fallidas.length > 0) {
    // Si alguna dice «configuración», manda: una clave revocada no se arregla esperando.
    const config = fallidas.find((r) => clasificarFallo(r) === 'config');
    const peor = config ?? fallidas[0];
    return { ok: false, tipo: config ? 'config' : 'caida', status: Number(peor?.status ?? 0) || 0 };
  }

  const [c, s, o] = resultado;
  return {
    ok: true,
    cuenta: c.data ?? null,
    subs: Array.isArray(s.data) ? s.data : [],
    ordenes: Array.isArray(o.data) ? o.data : [],
  };
}

/**
 * ¿Hay que reescribir la marca? Evita un `Set-Cookie` en cada página: se reescribe si
 * no había, si cambia el nivel, si la nueva ACORTA el plazo (el periodo terminó antes,
 * p. ej. una cancelación) o si lo alarga al menos `ENT_REFRESCO_S`.
 * @param {{ n: number, hasta: number }|null} actual
 * @param {{ n: number, hasta: number }|null} nueva
 * @returns {'mantener'|'escribir'|'borrar'}
 */
export function decidirMarcaEnt(actual, nueva, refrescoS = ENT_REFRESCO_S) {
  if (!nueva) return actual ? 'borrar' : 'mantener';
  if (!actual) return 'escribir';
  if (actual.n !== nueva.n) return 'escribir';
  if (nueva.hasta < actual.hasta) return 'escribir';
  if (nueva.hasta - actual.hasta >= refrescoS) return 'escribir';
  return 'mantener';
}

/** ¿La marca de la sesión vale AHORA para cubrir una caída? */
export function entVigente(ent, nowS) {
  return (
    !!ent &&
    (ent.n === 2 || ent.n === 3) &&
    Number.isFinite(ent.hasta) &&
    nowS < ent.hasta &&
    ent.hasta - nowS <= ENT_MAX_S + ENT_HOLGURA_S
  );
}

/**
 * Decisión PURA del nivel por cuenta a partir del resultado de `consultarCuenta`.
 *
 * @param {{ sesion: { ep: number, ent?: { n: number, hasta: number }|null },
 *           consulta: Awaited<ReturnType<typeof consultarCuenta>>,
 *           nowMs: number, produccion: boolean }} ctx
 * @returns {{ acceso: { nivel: 0|1|2|3, slugs: string[] }, revocada: boolean,
 *             ent: { accion: 'mantener' } | { accion: 'borrar' } | { accion: 'escribir', ent: { n: 2|3, hasta: number } },
 *             aviso: null|'caida'|'config', motivo: string }}
 */
export function decidirAccesoCuenta({ sesion, consulta, nowMs, produccion }) {
  const nowS = Math.floor(nowMs / 1000);
  const base = () => ({ nivel: /** @type {1} */ (1), slugs: [] });
  const actual = sesion.ent ?? null;

  if (!consulta.ok) {
    if (consulta.tipo === 'caida' && entVigente(actual, nowS)) {
      const n = /** @type {2|3} */ (actual.n);
      return { acceso: { nivel: n, slugs: alcanceDeNivel(n) }, revocada: false, ent: { accion: 'mantener' }, aviso: 'caida', motivo: 'ent' };
    }
    return {
      acceso: base(),
      revocada: false,
      ent: { accion: 'mantener' },
      aviso: consulta.tipo === 'config' ? 'config' : 'caida',
      motivo: consulta.tipo === 'config' ? 'config' : 'caida_sin_ent',
    };
  }

  // Cuenta borrada o «cerrar en todos»: la sesión ya no vale para nada.
  if (!consulta.cuenta || consulta.cuenta.session_epoch !== sesion.ep) {
    return {
      acceso: { nivel: 0, slugs: [] },
      revocada: true,
      ent: { accion: 'mantener' },
      aviso: null,
      motivo: consulta.cuenta ? 'epoch' : 'cuenta',
    };
  }

  const cuenta = (fila) => !(produccion && fila?.test_mode === true);
  let acceso = base();
  let fin = -Infinity;

  for (const sub of consulta.subs.filter(cuenta)) {
    const r = resolveSubscriptionGate(sub, nowMs);
    if (r.nivel >= 2) {
      acceso = combinarAccesos(acceso, r);
      fin = Math.max(fin, finDelDerecho(sub));
    }
  }
  for (const orden of consulta.ordenes.filter(cuenta)) {
    if (orden?.status !== 'paid') continue;
    const slug = typeof orden.product_slug === 'string' ? orden.product_slug : '';
    const info = slug && !SUBSCRIPTION_SLUGS.includes(slug) ? SLUG_NIVEL[slug] : undefined;
    if (!info) continue;
    acceso = combinarAccesos(acceso, { nivel: info.nivel, slugs: [slug] });
    fin = Infinity; // una compra única no caduca: la marca queda en 24 h
  }

  if (acceso.nivel < 2) {
    const accion = decidirMarcaEnt(actual, null);
    return { acceso, revocada: false, ent: { accion }, aviso: null, motivo: 'sin_derecho' };
  }

  const n = /** @type {2|3} */ (acceso.nivel);
  const hasta = Math.floor(Math.min(nowS + ENT_MAX_S, fin / 1000));
  const nueva = { n, hasta };
  const accion = decidirMarcaEnt(actual, nueva);
  return {
    acceso,
    revocada: false,
    ent: accion === 'escribir' ? { accion, ent: nueva } : { accion: 'mantener' },
    aviso: null,
    motivo: 'concede',
  };
}

/**
 * Todo junto: cliente → consulta → decisión. Sin cliente (faltan
 * `PUBLIC_SUPABASE_URL` o `SUPABASE_SECRET_KEY`) es configuración rota: cerrado.
 * @param {{ client: any, sesion: { aid: string, ep: number, ent?: any }, nowMs?: number,
 *           produccion?: boolean, timeoutMs?: number }} ctx
 */
export async function resolverAccesoCuenta({ client, sesion, nowMs = Date.now(), produccion = esProduccion(), timeoutMs }) {
  if (!client) {
    return {
      acceso: { nivel: 1, slugs: [] },
      revocada: false,
      ent: { accion: 'mantener' },
      aviso: 'config',
      motivo: 'sin_cliente',
    };
  }
  const consulta = await consultarCuenta(client, sesion.aid, timeoutMs === undefined ? {} : { timeoutMs });
  return decidirAccesoCuenta({ sesion, consulta, nowMs, produccion });
}
