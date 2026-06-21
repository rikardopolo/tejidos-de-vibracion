/**
 * refund-gate.mjs · Decisión de acceso de un token de COMPRA tras el chequeo de reembolso.
 *
 * El token firmado (purchase-token.mjs) YA prueba la compra. Este chequeo consulta
 * `orders` SOLO para REVOCAR cuando hay evidencia clara de reembolso/disputa. Es
 * best-effort: cualquier fallo de infraestructura (sin orderId, sin cliente Supabase,
 * error de consulta) hace fail-OPEN al nivel del token — un outage no debe tumbar
 * acceso legítimo. Lógica pura, testeable con `node --test`.
 *
 * Revocamos (nivel 0) solo cuando la consulta tuvo éxito y la orden está ausente o
 * con status != 'paid'.
 *
 * @param {{ nivel: 2|3, slugs: string[] }} granted  acceso que otorga el token firmado
 * @param {{ orderId: string|null, hasClient: boolean, queryError: boolean, order: { status: string }|null }} ctx
 * @returns {{ nivel: 0|2|3, slugs: string[] }}
 */
export function resolveRefundGate(granted, ctx) {
  // No se pudo verificar (token sin orderId, Supabase caído, o error de consulta) → fail-open.
  if (!ctx.orderId || !ctx.hasClient || ctx.queryError) return granted;
  // Consulta OK: la orden debe existir y estar 'paid'. Ausente o refunded/disputed → revocar.
  return ctx.order && ctx.order.status === 'paid' ? granted : { nivel: 0, slugs: [] };
}
