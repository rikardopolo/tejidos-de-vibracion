// Tipos sidecar para lemonsqueezy-payload.mjs (lógica pura en JS testeable).
export interface CheckoutPayloadInput {
  storeId: string | number;
  variantId: string | number;
  email?: string;
  leadId?: string | number;
  productSlug?: string;
}

export interface CheckoutPayload {
  data: {
    type: 'checkouts';
    attributes: { checkout_data: { custom: Record<string, string>; email?: string } };
    relationships: {
      store: { data: { type: 'stores'; id: string } };
      variant: { data: { type: 'variants'; id: string } };
    };
  };
}

export function buildCheckoutPayload(input: CheckoutPayloadInput): CheckoutPayload;
export function extractCheckoutUrl(responseJson: unknown): string | null;
