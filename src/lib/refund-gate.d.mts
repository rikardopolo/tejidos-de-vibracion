export type AccesoOtorgado = { nivel: 2 | 3; slugs: string[] };
// Revocar baja a 1 (registro), nunca a 0: ver refund-gate.mjs.
export type AccesoResuelto = { nivel: 1 | 2 | 3; slugs: string[] };

export type RefundGateCtx = {
  orderId: string | null;
  hasClient: boolean;
  queryError: boolean;
  order: { status: string } | null;
};

export function resolveRefundGate(granted: AccesoOtorgado, ctx: RefundGateCtx): AccesoResuelto;
