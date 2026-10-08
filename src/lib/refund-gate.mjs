/**
 * refund-gate.mjs · Decisión (PURA) de si un token de COMPRA sigue vigente.
 *
 * El token firmado (purchase-token.mjs) prueba que hubo compra, pero es un HMAC de
 * 1 año que no "sabe" de reembolsos. La fuente de verdad de la revocación es
 * `orders.status`, igual que en el portal.
 *
 * POLÍTICA (decidida 31-jul-2026, ajustada 7-oct-2026 en S-05 y en S-13):
 *
 *   - Error de CONSULTA (caída de Supabase, timeout de 2 s) → CERRADO desde S-13.
 *     Hasta S-12 se abría (fail-OPEN provisional). S-13 lo sustituye por la marca
 *     firmada `ent` de la sesión del libro (D4, 24 h como máximo, `acceso-cuenta.mjs`):
 *     quien paga y entra con su cuenta sigue leyendo durante la caída; un token
 *     suelto de `tejedor-access`, sin sesión, no tiene marca y cae a nivel 1 hasta
 *     que la base vuelva. Una caída no regala ya un año de acceso a un token
 *     reembolsado.
 *
 *   - CONFIGURACIÓN ROTA (sin cliente: faltan PUBLIC_SUPABASE_URL o
 *     SUPABASE_SECRET_KEY) → fail-CLOSED (C8). No es una caída pasajera sino un
 *     despliegue mal configurado: abrir ahí regalaba el nivel de pago a todo
 *     token —también a los reembolsados— mientras durase. El aviso a Sentry lo
 *     da quien llama (`gating.ts`), que es quien sabe que la config está rota.
 *
 *   - Fallo de DATO (sin orderId, orden ausente, o status != 'paid')
 *     → fail-CLOSED. Si se pudo mirar y el dato no respalda la compra, se revoca.
 *
 *   - Orden de PRUEBA (`orders.test_mode = true`) en PRODUCCIÓN → cerrado (S-13).
 *     Las órdenes de Test Mode no son compras: fuera de producción (Preview, local)
 *     sí cuentan, para poder probar el camino entero.
 *
 * El caso "sin orderId" se cierra porque no es verificable NUNCA, y el único
 * emisor de tokens (el webhook de Lemon Squeezy) siempre lo incluye: un token de
 * compra sin orderId es forjado o de un formato que ya no circula.
 *
 * REVOCAR = nivel 1, no 0 (corregido 18-sep-2026, F2). Un token de compra solo lo
 * tiene quien ya se registró: perder la compra no borra el registro, así que el
 * reembolsado conserva Obertura + Acto I. Devolver 0 lo expulsaba a visitante.
 *
 * Lógica pura, testeable con `node --test`.
 *
 * @param {{ nivel: 2|3, slugs: string[] }} granted  acceso que otorga el token firmado
 * @param {{ orderId: string|null, hasClient: boolean, queryError: boolean,
 *           order: { status: string, test_mode?: boolean|null }|null, produccion?: boolean }} ctx
 * @returns {{ nivel: 1|2|3, slugs: string[] }}
 */
export function resolveRefundGate(granted, ctx) {
  if (!ctx.orderId) return revocado();
  if (!ctx.hasClient) return revocado(); // configuración rota → cerrado (C8)
  // Error de consulta → cerrado (S-13): el paso durante una caída es la marca `ent`.
  if (ctx.queryError) return revocado();
  if (!ctx.order || ctx.order.status !== 'paid') return revocado();
  if (ctx.produccion === true && ctx.order.test_mode === true) return revocado();
  return granted;
}

// Objeto nuevo en cada llamada: devolver una constante compartida invita a que un
// caller la mute y contamine la siguiente decisión.
function revocado() {
  return { nivel: 1, slugs: [] };
}
