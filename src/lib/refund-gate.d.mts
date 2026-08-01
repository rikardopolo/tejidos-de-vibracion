export type AccesoOtorgado = { nivel: 2 | 3; slugs: string[] };
export type AccesoResuelto = { nivel: 0 | 2 | 3; slugs: string[] };

export type RefundGateCtx = {
  orderId: string | null;
  hasClient: boolean;
  queryError: boolean;
  order: { status: string } | null;
};

export function resolveRefundGate(granted: AccesoOtorgado, ctx: RefundGateCtx): AccesoResuelto;
