// Tipos sidecar para derecho-adquirido.mjs (regla pura del derecho al PDF completo).

/** PROVISIONAL, la fija Ricardo con el cronograma. Versionada a propósito: nunca env. */
export const LIBRO_COMPLETADO_AT: Date;

/** Meses cubiertos (mensual = 1, anual = 12) pagados y no reembolsados que otorgan el PDF. */
export const MESES_MINIMOS: number;

export type SubscriptionInvoiceRow = {
  paid_at?: string | Date | null;
  refunded_at?: string | Date | null;
  meses_cubiertos?: number | null;
};

/** Se acumula por comprador: pasar TODAS las facturas del email, de todas sus suscripciones. */
export function tieneDerechoPdf(
  invoices: SubscriptionInvoiceRow[],
  opts?: { ahora?: Date | number; cierre?: Date | number },
): boolean;
