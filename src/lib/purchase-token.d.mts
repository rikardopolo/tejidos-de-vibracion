// Tipos sidecar para purchase-token.mjs (lógica pura en JS testeable).
export interface PurchaseClaims {
  email: string;
  nivel: 2 | 3;
  slugs: string[];
  orderId?: string | null;
}

export type PurchaseVerifyResult =
  | { valid: true; email: string; nivel: 2 | 3; slugs: string[]; orderId: string | null; issuedAt: number }
  | { valid: false; reason: 'malformed' | 'bad_signature' | 'expired' };

export function generatePurchaseToken(claims: PurchaseClaims, secret: string): string;
export function verifyPurchaseToken(token: string, secret: string): PurchaseVerifyResult;
export function looksLikePurchaseToken(token: string): boolean;
