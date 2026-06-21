// Tipos sidecar para lemonsqueezy-webhook.mjs (lógica pura en JS testeable).
export function verifyLemonSignature(
  rawBody: string,
  signatureHeader: string | null | undefined,
  secret: string,
): boolean;

export function mapProductToNivel(
  productSlug: string | undefined | null,
): { nivel: 2 | 3; expira: string | null } | null;

export interface ParsedOrderEvent {
  lsOrderId: string;
  lsOrderIdentifier: string | null;
  email: string | null;
  leadId: string | null;
  productSlug: string | null;
  amountCents: number | null;
  currency: string;
  status: 'paid' | 'refunded';
  testMode: boolean;
  eventName: string;
}

export function parseOrderEvent(
  body: unknown,
  eventName: string | undefined,
): ParsedOrderEvent | null;
