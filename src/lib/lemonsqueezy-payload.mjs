/**
 * lemonsqueezy-payload.mjs · Constructor PURO del payload JSON:API para crear
 * un checkout en Lemon Squeezy. Sin red, sin env, sin efectos — testeable con
 * `node --test` (stdlib, sin dependencias). El wrapper `lemonsqueezy.ts` lo
 * consume para el fetch real.
 *
 * Ref API LS clásico: POST https://api.lemonsqueezy.com/v1/checkouts
 *   - El "variant" es la unidad cobrable (equivalente al price).
 *   - `checkout_data.custom` viaja al webhook como `meta.custom_data`; sus
 *     valores DEBEN ser strings → coercionamos.
 *   - El modo test/live lo determina la API key, NO el payload.
 *
 * ponytail: lógica pura aislada aquí para dejar un check ejecutable sin montar
 * un runner de TS; el efecto (fetch) vive en el .ts.
 */

/**
 * @param {{ storeId: string|number, variantId: string|number, email?: string,
 *           leadId?: string|number, productSlug?: string }} input
 */
export function buildCheckoutPayload(input) {
  const { storeId, variantId, email, leadId, productSlug } = input;
  if (!storeId || !variantId) {
    throw new Error('buildCheckoutPayload: storeId y variantId son obligatorios');
  }

  const custom = {};
  if (productSlug) custom.product_slug = String(productSlug);
  if (leadId !== undefined && leadId !== null && String(leadId) !== '') {
    custom.lead_id = String(leadId);
  }

  const checkout_data = { custom };
  // email solo si viene no vacío: LS rechaza el prefill con email vacío.
  const cleanEmail = typeof email === 'string' ? email.trim() : '';
  if (cleanEmail) checkout_data.email = cleanEmail.toLowerCase();

  return {
    data: {
      type: 'checkouts',
      attributes: { checkout_data },
      relationships: {
        store: { data: { type: 'stores', id: String(storeId) } },
        variant: { data: { type: 'variants', id: String(variantId) } },
      },
    },
  };
}

/**
 * Extrae la URL de checkout de la respuesta JSON:API de LS.
 * @param {unknown} responseJson
 * @returns {string|null}
 */
export function extractCheckoutUrl(responseJson) {
  const url = responseJson?.data?.attributes?.url;
  return typeof url === 'string' && url ? url : null;
}
