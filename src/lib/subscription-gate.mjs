/**
 * subscription-gate.mjs · Decisión (PURA) de si una fila de SUSCRIPCIÓN da el nivel 2.
 *
 * Hermano de refund-gate.mjs para el pivote a suscripción (F2, 18-sep-2026). Una
 * suscripción caduca, se impaga, se pausa o se cancela en cualquier momento, así que
 * la fuente de verdad es la fila de `subscriptions`, que el gate consulta en cada
 * petición por el `account_id` de la sesión del libro (S-13, `acceso-cuenta.mjs`;
 * ya no hay token de suscripción). Aquí vive solo la regla sobre esa fila; la
 * política ante caída de la base (la marca firmada `ent`, D4) y ante configuración
 * rota (cerrar) la aplica `acceso-cuenta.mjs` antes de llegar aquí.
 *
 * Agnóstico de proveedor: `status` es el conjunto normalizado de `subscriptions.status`
 * (active · on_trial · past_due · paused · cancelled · expired · unpaid), no el
 * vocabulario de Hotmart ni el de Lemon Squeezy. El adaptador (F3) traduce a estos.
 *
 * REGLA (Decisiones_Suscripcion_TDV_TDR_v1.md §3 y §6):
 *   - active / on_trial                              → nivel 2.
 *   - cancelled con ends_at > now                    → nivel 2 (pagó el periodo; el
 *                                                      corte real llega al expirar).
 *   - past_due con current_period_end + gracia > now → nivel 2 (7 días de gracia tras
 *                                                      impago, decididos por Ricardo).
 *   - paused con pause.mode === 'free'               → nivel 2 (LS: pausa sin cobro
 *                                                      que no corta el acceso).
 *   - todo lo demás (expired, unpaid, paused void, cancelled ya vencida, past_due
 *     fuera de gracia, fila ausente, status desconocido) → nivel 1.
 *
 * Niega a nivel 1, NUNCA 0: quien se suscribió está registrado y conserva Obertura +
 * Acto I (mismo criterio que la corrección de `revocado()` en refund-gate.mjs).
 *
 * Lógica pura, testeable con `node --test`.
 */
import { SLUG_NIVEL } from './product-slugs.mjs';

/** Gracia tras impago: 7 días más allá de `current_period_end`. Decisión §3. */
export const GRACIA_MS = 7 * 24 * 60 * 60 * 1000;

// Slug de la suscripción en el catálogo (product-slugs.mjs). El nivel sale de ahí
// para que no haya dos fuentes.
const SLUG_SUSCRIPCION = 'suscripcion-libro';

// Scope que abre la suscripción: TODO lo de nivel 2 del catálogo (Cap. 4 + Actos II
// y III mientras se publica · Decisión §6). El contenido declara `productoSlug:
// "acto-2"` y `puedeAcceder` exige ese slug en el scope: con solo 'suscripcion-libro'
// un suscriptor no abriría el Cap. 4. Se deriva del catálogo, no se lista a mano.
const SCOPE_SUSCRIPCION = Object.keys(SLUG_NIVEL).filter((s) => SLUG_NIVEL[s].nivel === 2);

/**
 * @param {{ status: string, ends_at?: string|Date|null, current_period_end?: string|Date|null, pause?: { mode?: string }|null }|null|undefined} sub
 *   fila de `subscriptions`, o null si no existe
 * @param {Date|number} now
 * @param {number} [graciaMs=GRACIA_MS]
 * @returns {{ nivel: 1|2, slugs: string[] }}
 */
export function resolveSubscriptionGate(sub, now, graciaMs = GRACIA_MS) {
  if (!sub) return denegado();
  const ahora = ms(now);
  switch (sub.status) {
    case 'active':
    case 'on_trial':
      return concedido();
    case 'cancelled':
      return ms(sub.ends_at) > ahora ? concedido() : denegado();
    case 'past_due':
      return ms(sub.current_period_end) + graciaMs > ahora ? concedido() : denegado();
    case 'paused':
      return sub.pause?.mode === 'free' ? concedido() : denegado();
    default:
      // expired, unpaid, o un status que no conocemos: si no sabemos qué es, no abre.
      return denegado();
  }
}

// null/undefined/fecha inválida → NaN, y NaN pierde toda comparación: una fecha que
// falta nunca concede. Ahorra un if por campo.
function ms(v) {
  return v == null ? NaN : new Date(v).getTime();
}

// Objeto nuevo en cada llamada (misma razón que en refund-gate.mjs).
function concedido() {
  return { nivel: SLUG_NIVEL[SLUG_SUSCRIPCION].nivel, slugs: SCOPE_SUSCRIPCION.slice() };
}

function denegado() {
  return { nivel: 1, slugs: [] };
}
