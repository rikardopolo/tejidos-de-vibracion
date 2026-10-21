/**
 * gating.ts · Nivel de acceso desde la cookie tejedor-access.
 *
 * Niveles (Guía Estratégica · escalera de compromiso):
 *   0 = visitante          → fragmento 20-30% + BloqueRegistro
 *   1 = tejedor registrado → Obertura + Acto I (token de registro · token.ts,
 *                            o sesión del libro `__Host-tdv_sesion` · S-12). Solo
 *                            firma, SIN base.
 *   2 = comprador          → + Cap. 4 + Acto II/III: token de compra (purchase-token.mjs)
 *                            cruzado con `orders`, o la CUENTA de la sesión (S-13):
 *                            suscripción u orden pagada por `account_id`, con epoch.
 *   3 = libro completo     → + objeto terminado / acceso permanente
 */
import type { AstroCookies } from 'astro';
import * as Sentry from '@sentry/astro';
import { verifyAccessToken } from './token';
import { verifyPurchaseToken, looksLikePurchaseToken } from './purchase-token.mjs';
import { resolveRefundGate } from './refund-gate.mjs';
import { getServerClient } from './supabase';
import { leerSesionTdv, secretoTdv, sesionTdvActiva, opcionesCookie, OPCIONES_BORRADO } from './cuenta-tdv';
import { conSesionTdv } from './gate-decision.mjs';
import { SESION_COOKIE, reemitirSesionTdv, secretoValido, type SesionTdvValida } from './sesion-tdv.mjs';
import {
  TIMEOUT_ACCESO_MS,
  clasificarFallo,
  combinarAccesos,
  esProduccion,
  resolverAccesoCuenta,
  type DecisionCuenta,
} from './acceso-cuenta.mjs';

export type Nivel = 0 | 1 | 2 | 3;

/**
 * Lee una variable de entorno respetando runtime PRIMERO, build-time como fallback.
 * `process.env[key]` (bracket-notation) no es estáticamente analizable por Vite y
 * se evalúa en runtime en Vercel → el dashboard es la fuente de verdad sin rebuild.
 */
function readEnv(key: string): string | undefined {
  if (typeof process !== 'undefined' && process.env) {
    const fromProc = process.env[key];
    if (fromProc !== undefined && fromProc !== '') return fromProc;
  }
  const fromMeta = (import.meta.env as Record<string, string | undefined>)[key];
  if (fromMeta !== undefined && fromMeta !== '') return fromMeta;
  return undefined;
}

/**
 * Nivel + scope (slugs comprados) leídos y verificados desde las cookies.
 *
 * Nivel 1: con `TDV_SESION_ENABLED`, solo una `__Host-tdv_sesion` válida.
 * Apagado, se conserva el token de registro `tejedor-access` (reversión).
 * La sesión se comprueba por firma y caducidad, SIN consultar la
 * base ni el epoch: tras «cerrar en todos» una sesión ya emitida sigue dando el
 * nivel 1 hasta caducar (riesgo aceptado, ver `leerSesionTdv`). El nivel 2 por
 * sesión (S-13) vive en `getAccesoVerificado`, y ese sí compara el epoch.
 */
export function getAcceso(cookies: AstroCookies): { nivel: Nivel; slugs: string[] } {
  const porToken = accesoPorToken(cookies);
  // Con nivel ≥ 1 por el token, la sesión no añade nada: ni se verifica.
  if (porToken.nivel >= 1) return porToken;
  // Con el interruptor apagado `leerSesionTdv` devuelve null: nada cambia.
  return conSesionTdv(porToken, leerSesionTdv(cookies) !== null);
}

/** Nivel + scope desde `tejedor-access` (token de registro o de compra). */
function accesoPorToken(cookies: AstroCookies): { nivel: Nivel; slugs: string[] } {
  const secret = readEnv('ACCESS_TOKEN_SECRET');
  if (!secret) return { nivel: 0, slugs: [] };

  const value = cookies.get('tejedor-access')?.value;
  if (!value) return { nivel: 0, slugs: [] };

  // Token de COMPRA (nivel 2/3 + scope) · formato body.sig (un punto).
  if (looksLikePurchaseToken(value)) {
    const r = verifyPurchaseToken(value, secret);
    return r.valid ? { nivel: r.nivel, slugs: r.slugs } : { nivel: 0, slugs: [] };
  }

  // Puerta única: con cuentas, el nivel 1 viene de la sesión. Las compras conservan su token.
  if (sesionTdvActiva()) return { nivel: 0, slugs: [] };
  // Token de REGISTRO (nivel 1) · formato legacy (un único blob base64url, sin puntos).
  return verifyAccessToken(value, secret).valid ? { nivel: 1, slugs: [] } : { nivel: 0, slugs: [] };
}

export function getNivel(cookies: AstroCookies): Nivel {
  return getAcceso(cookies).nivel;
}

/**
 * Acceso para las páginas que gatean contenido PAGADO (capítulos con nivel 2+).
 *
 * Dos fuentes, que se UNEN (nivel mayor, unión de slugs):
 *  1. `tejedor-access` · token de compra cruzado con `orders.status` (un reembolso
 *     corta el acceso; `refund-gate.mjs`). Un token de registro da el nivel 1.
 *  2. `__Host-tdv_sesion` (S-13) · la CUENTA: epoch, suscripciones y órdenes pagadas
 *     por `account_id`, con 2 s de tope y la marca firmada `ent` para las caídas
 *     (`acceso-cuenta.mjs`, D4). Aquí solo la E/S: leer y reescribir la cookie y
 *     avisar a Sentry.
 *
 * Por qué existe aparte y no dentro de `getAcceso`: solo el nivel ≥ 2 necesita la
 * base. Dejar `getAcceso` síncrona evita volver async —y tocar— las superficies de
 * nivel 1 (Obertura, /recibir, LecturaLarga) y una consulta por cada lector.
 *
 * Configuración rota (sin cliente de Supabase, sin `TDV_SESSION_SECRET` con el
 * interruptor encendido, o PostgREST 401/403 / 4xx) → cerrado y aviso a Sentry.
 */
export async function getAccesoVerificado(
  cookies: AstroCookies,
): Promise<{ nivel: Nivel; slugs: string[] }> {
  const sesion = leerSesionTdv(cookies);
  // Las dos fuentes en paralelo: cada una con su tope de 2 s, la página espera 2 s como mucho.
  const [porToken, r] = await Promise.all([
    accesoPorTokenVerificado(cookies),
    sesion
      ? resolverAccesoCuenta({
          client: getServerClient(),
          sesion,
          nowMs: Date.now(),
          produccion: esProduccion(),
          timeoutMs: TIMEOUT_ACCESO_MS,
        })
      : Promise.resolve(null),
  ]);

  if (!sesion || !r) {
    if (sesionSinSecreto(cookies)) {
      await avisarConfigRota('sesion_sin_secreto', 'TDV_SESION_ENABLED encendido sin TDV_SESSION_SECRET válido');
    }
    return porToken;
  }

  aplicarDecisionSesion(cookies, sesion, r);

  if (r.aviso === 'config') {
    if (r.motivo === 'sin_cliente') {
      await avisarConfigRota('sin_cliente', 'Supabase sin configurar (faltan PUBLIC_SUPABASE_URL / SUPABASE_SECRET_KEY)');
    } else {
      await avisarConfigRota('cuenta_rechazada', 'la base rechazó la consulta del nivel 2 (clave revocada o esquema)');
    }
  } else if (r.aviso === 'caida') {
    console.warn(`[gating] base sin respuesta en el nivel 2 por cuenta · ${r.motivo === 'ent' ? 'marca ent vigente' : 'sin marca: nivel 1'}`);
  }

  return combinarAccesos(porToken, r.acceso) as { nivel: Nivel; slugs: string[] };
}

/**
 * Ejecuta lo que decidió `resolverAccesoCuenta` sobre la cookie:
 * - sesión revocada (epoch distinto o cuenta borrada) → se borra;
 * - marca nueva → se reescribe la sesión CONSERVANDO `exp` (no se alarga);
 * - marca negada por una consulta correcta → se reescribe sin `ent`.
 */
function aplicarDecisionSesion(cookies: AstroCookies, sesion: SesionTdvValida, r: DecisionCuenta): void {
  if (r.revocada) {
    cookies.delete(SESION_COOKIE, OPCIONES_BORRADO);
    return;
  }
  if (r.ent.accion === 'mantener') return;
  const nueva = reemitirSesionTdv(sesion, r.ent.accion === 'escribir' ? r.ent.ent : null, { secret: secretoTdv() });
  const maxAge = sesion.exp - Math.floor(Date.now() / 1000);
  if (!nueva || maxAge <= 0) return;
  cookies.set(SESION_COOKIE, nueva, opcionesCookie(maxAge));
}

/** ¿Hay cookie de sesión e interruptor encendido, pero el secreto falta o es corto? */
function sesionSinSecreto(cookies: AstroCookies): boolean {
  return sesionTdvActiva() && Boolean(cookies.get(SESION_COOKIE)?.value) && !secretoValido(secretoTdv());
}

/**
 * Token de `tejedor-access` cruzado con `orders.status` (la política vive en
 * `refund-gate.mjs`). Desde S-13 una caída de la base CIERRA este camino: el paso
 * durante la caída es la marca `ent` de la sesión, no el token.
 */
async function accesoPorTokenVerificado(cookies: AstroCookies): Promise<{ nivel: Nivel; slugs: string[] }> {
  const granted = accesoPorToken(cookies);
  if (granted.nivel < 2) return granted;

  const otorgado = { nivel: granted.nivel as 2 | 3, slugs: granted.slugs };
  const orderId = orderIdDeCookie(cookies);
  const produccion = esProduccion();

  // Sin orderId no hay nada que consultar: la política decide (hoy, revocar).
  if (!orderId) {
    return resolveRefundGate(otorgado, { orderId: null, hasClient: false, queryError: false, order: null, produccion });
  }

  const client = getServerClient();
  if (!client) {
    // Configuración rota (faltan PUBLIC_SUPABASE_URL / SUPABASE_SECRET_KEY): la
    // política CIERRA (C8) y aquí se avisa, porque un despliegue así deja a todos
    // los compradores sin el Cap. 4 hasta que alguien lo note.
    await avisarConfigRota('sin_cliente', 'Supabase sin configurar (faltan PUBLIC_SUPABASE_URL / SUPABASE_SECRET_KEY)');
    return resolveRefundGate(otorgado, { orderId, hasClient: false, queryError: false, order: null, produccion });
  }

  const { data, error, status } = await client
    .from('orders')
    .select('status, test_mode')
    .eq('ls_order_id', orderId)
    // Acota la consulta ENTERA, reintentos de postgrest incluidos: un Supabase LENTO
    // no devuelve error, se cuelga y agota la función SSR. El abort vuelve como
    // `error` con status 0 (caída), que aquí cierra.
    .abortSignal(AbortSignal.timeout(TIMEOUT_ACCESO_MS))
    .maybeSingle();

  if (error && clasificarFallo({ status }) === 'config') {
    await avisarConfigRota('orders_rechazada', 'la base rechazó la consulta de orders (clave revocada o esquema)');
  }

  return resolveRefundGate(otorgado, {
    orderId,
    hasClient: true,
    queryError: Boolean(error),
    order: data ? { status: String(data.status), test_mode: data.test_mode === true } : null,
    produccion,
  });
}

// Un aviso a Sentry por instancia y motivo: con la config rota, CADA página de pago
// pasaría por aquí, y Sentry no necesita mil copias del mismo fallo para abrir la
// incidencia. El console.error sí sale siempre (queda en los logs de Vercel).
const configRotaAvisada = new Set<string>();

async function avisarConfigRota(motivo: string, detalle: string): Promise<void> {
  console.error(`[gating] configuración rota (${motivo}): ${detalle} · acceso de pago CERRADO`);
  if (configRotaAvisada.has(motivo)) return;
  configRotaAvisada.add(motivo);
  try {
    Sentry.captureMessage(`gating: configuración rota (${motivo}) · acceso de pago cerrado`, 'error');
    // La función serverless puede congelarse al responder: vaciar la cola antes.
    // Sin DSN (local) es un no-op inmediato.
    await Sentry.flush(2000);
  } catch {
    /* el aviso nunca debe romper la página */
  }
}

/** `ls_order_id` que viaja dentro del token de compra, o null si no lo lleva. */
function orderIdDeCookie(cookies: AstroCookies): string | null {
  const secret = readEnv('ACCESS_TOKEN_SECRET');
  const value = cookies.get('tejedor-access')?.value;
  if (!secret || !value || !looksLikePurchaseToken(value)) return null;
  const r = verifyPurchaseToken(value, secret);
  return r.valid ? (r.orderId ?? null) : null;
}

/**
 * Cabeceras de toda página con control de acceso (plan v2 §7.4): la respuesta
 * depende de las cookies del lector, así que ninguna caché compartida puede
 * guardarla ni servírsela a otro.
 */
export const CACHE_PAGINA_GATEADA = 'private, no-store';

// Decisión PURA de acceso (nivel + scope de producto). Vive en gate-decision.mjs
// para ser testeable con `node --test` sin deps; se re-exporta aquí para que las
// páginas la consuman desde un único punto. Ver gate-decision.mjs para la regla.
export { puedeAcceder } from './gate-decision.mjs';

/**
 * `true` SOLO en un deploy de Vercel de rama distinta de `main`.
 *
 * Sirve para que el revisor interno lea en preview lo que todavía no está
 * publicado, sin tocar el `status` del contenido — que es el interruptor de
 * visibilidad PÚBLICA y no debe moverse para una revisión.
 *
 * Es seguro por construcción: en producción `VERCEL_GIT_COMMIT_REF === 'main'`,
 * así que esta función devuelve `false` ahí SIEMPRE. A diferencia de
 * `gatingActivo()`, no depende de ninguna variable de entorno que pueda estar
 * mal puesta: si la rama es `main`, o si no hay rama (build local), es `false`.
 */
export function esPreview(): boolean {
  if (typeof process === 'undefined' || !process.env) return false;
  const branch = process.env.VERCEL_GIT_COMMIT_REF ?? '';
  return branch !== '' && branch !== 'main';
}

export function gatingActivo(): boolean {
  // En cualquier rama Vercel distinta de `main` se desactiva el gating por
  // completo para que el revisor interno vea el contenido sin pasar por la puerta.
  // main NUNCA toma este camino (VERCEL_GIT_COMMIT_REF=main en producción).
  if (typeof process !== 'undefined' && process.env) {
    const branch = process.env.VERCEL_GIT_COMMIT_REF ?? '';
    if (branch && branch !== 'main') return false;
  }
  return readEnv('GATING_ACTIVO') === 'true';
}

export function suscripcionActiva(): boolean {
  return readEnv('SUSCRIPCION_ACTIVA') === 'true';
}
