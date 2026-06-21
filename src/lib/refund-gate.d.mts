// Tipos sidecar para refund-gate.mjs (lógica pura en JS testeable).
export interface RefundGateGrant {
  nivel: 2 | 3;
  slugs: string[];
}

export interface RefundGateCtx {
  orderId: string | null;
  hasClient: boolean;
  queryError: boolean;
  order: { status: string } | null;
}

export function resolveRefundGate(
  granted: RefundGateGrant,
  ctx: RefundGateCtx,
): { nivel: 0 | 2 | 3; slugs: string[] };
