/**
 * payments.ts · Punto único de acoplamiento con la pasarela de pago.
 *
 * Proveedor decidido y definitivo: Lemon Squeezy clásico (Merchant of Record con
 * payout bancario a Colombia confirmado). Se descartó Stripe Managed Payments
 * porque Colombia no está entre sus ubicaciones de negocio soportadas.
 *
 * El endpoint de checkout y (Fase 3) el webhook importan SOLO desde aquí, nunca
 * desde lemonsqueezy.ts directamente — aislamiento de higiene, no indecisión de
 * proveedor: un único punto de cambio si algún día hubiera que migrar.
 *
 * ponytail: no definimos una interfaz especulativa con una sola implementación;
 * centralizamos el import.
 */
export type { CheckoutResult } from './lemonsqueezy';
export { createCheckout } from './lemonsqueezy';
