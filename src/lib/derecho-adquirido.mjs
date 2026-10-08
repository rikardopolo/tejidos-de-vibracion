/**
 * derecho-adquirido.mjs · Regla (PURA) del derecho al PDF completo del suscriptor.
 *
 * Decisión de Ricardo, 18-sep-2026 (Decisiones_Suscripcion_TDV_TDR_v1.md §1, opción
 * b): el derecho se gana por MESES CUBIERTOS pagados y no reembolsados antes del
 * cierre del libro, aunque el suscriptor haya cancelado. No por «estar activo el
 * día del cierre» — eso premiaría al que entra la última semana y castigaría al
 * que sostuvo diez meses. Precedente en el canon §3: «los beneficios se ganan por
 * haber pagado el proceso».
 *
 * Se ACUMULA POR COMPRADOR (email / identidad del proveedor), no por suscripción:
 * quien pagó 3 meses, canceló y volvió por 2 más, llega a 5. Por eso el llamador
 * pasa TODAS las facturas del email, de todas sus suscripciones.
 *
 * `pdf_derecho` se recalcula por job con esta función, no en el webhook.
 *
 * Lógica pura, testeable con `node --test`.
 */

// PROVISIONAL, la fija Ricardo con el cronograma de entregas (Decisión §5).
// Versionada a propósito: define un derecho de terceros y no puede cambiarse desde
// un dashboard sin dejar rastro. NUNCA a una variable de entorno.
export const LIBRO_COMPLETADO_AT = new Date('2027-06-30T23:59:59-05:00');

// A USD 9/mes, 5 meses igualan el neto del libro completo (USD 39): por debajo el
// PDF gratis sería pérdida frente a vender el libro (F0.6 del plan). Una factura
// mensual cubre 1; una anual, 12 — el anual califica desde su primer cobro.
export const MESES_MINIMOS = 5;

/**
 * @param {Array<{ paid_at?: string|Date|null, refunded_at?: string|Date|null, meses_cubiertos?: number|null }>} invoices
 *   filas de `subscription_invoices` del comprador (todas sus suscripciones)
 * @param {{ ahora?: Date|number, cierre?: Date|number }} [opts]
 *   `cierre` = LIBRO_COMPLETADO_AT salvo en tests; `ahora` acota facturas con
 *   `paid_at` futuro (reloj del proveedor o dato corrupto): no cuentan todavía.
 * @returns {boolean}
 */
export function tieneDerechoPdf(invoices, { ahora = new Date(), cierre = LIBRO_COMPLETADO_AT } = {}) {
  const ahoraMs = ms(ahora);
  const cierreMs = ms(cierre);
  let meses = 0;
  for (const inv of invoices ?? []) {
    if (inv.refunded_at) continue; // reembolsada: no cuenta aunque se haya pagado
    const pagada = ms(inv.paid_at);
    // Sin paid_at → NaN → no pasa. Pagada después del cierre o en el futuro, tampoco.
    if (!(pagada < cierreMs && pagada <= ahoraMs)) continue;
    // Sin meses_cubiertos no se adivina (0): el ledger debe decirlo desde el primer cobro.
    meses += Number(inv.meses_cubiertos) || 0;
  }
  return meses >= MESES_MINIMOS;
}

function ms(v) {
  return v == null ? NaN : new Date(v).getTime();
}
