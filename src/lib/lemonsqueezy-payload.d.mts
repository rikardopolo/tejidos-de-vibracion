// Tipos sidecar para lemonsqueezy-payload.mjs (lógica pura en JS testeable).
export interface CheckoutPayloadInput {
  storeId: string | number;
  variantId: string | number;
  email?: string;
  leadId?: string | number;
  productSlug?: string;
  /** Claves extra de `checkout_data.custom` (S-13: el custom firmado). Se convierten a string. */
  custom?: Record<string, string>;
  /** `expires_at` del checkout, ISO 8601. */
  expiresAt?: string;
}

export interface CheckoutPayload {
  data: {
    type: 'checkouts';
    attributes: { checkout_data: { custom: Record<string, string>; email?: string }; expires_at?: string };
    relationships: {
      store: { data: { type: 'stores'; id: string } };
      variant: { data: { type: 'variants'; id: string } };
    };
  };
}

export function buildCheckoutPayload(input: CheckoutPayloadInput): CheckoutPayload;
export function extractCheckoutUrl(responseJson: unknown): string | null;
