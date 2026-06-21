/**
 * Check del builder de payload de Lemon Squeezy. Stdlib node:test, sin deps.
 * Correr: node --test src/lib/lemonsqueezy-payload.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildCheckoutPayload, extractCheckoutUrl } from './lemonsqueezy-payload.mjs';

test('estructura JSON:API con store y variant', () => {
  const p = buildCheckoutPayload({ storeId: '12345', variantId: '67890', productSlug: 'bundle-preventa' });
  assert.equal(p.data.type, 'checkouts');
  assert.equal(p.data.relationships.store.data.type, 'stores');
  assert.equal(p.data.relationships.store.data.id, '12345');
  assert.equal(p.data.relationships.variant.data.type, 'variants');
  assert.equal(p.data.relationships.variant.data.id, '67890');
  assert.equal(p.data.attributes.checkout_data.custom.product_slug, 'bundle-preventa');
});

test('email se normaliza (trim + minúsculas) y se omite si vacío', () => {
  const withEmail = buildCheckoutPayload({ storeId: '1', variantId: '2', email: '  Foo@Bar.COM ' });
  assert.equal(withEmail.data.attributes.checkout_data.email, 'foo@bar.com');
  const noEmail = buildCheckoutPayload({ storeId: '1', variantId: '2', email: '   ' });
  assert.equal('email' in noEmail.data.attributes.checkout_data, false);
});

test('lead_id viaja en custom siempre como string', () => {
  const p = buildCheckoutPayload({ storeId: '1', variantId: '2', leadId: 42 });
  assert.equal(p.data.attributes.checkout_data.custom.lead_id, '42');
  assert.equal(typeof p.data.attributes.checkout_data.custom.lead_id, 'string');
});

test('ids numéricos se coercionan a string', () => {
  const p = buildCheckoutPayload({ storeId: 12345, variantId: 67890 });
  assert.equal(typeof p.data.relationships.store.data.id, 'string');
  assert.equal(p.data.relationships.variant.data.id, '67890');
});

test('falla sin storeId o variantId', () => {
  assert.throws(() => buildCheckoutPayload({ storeId: '', variantId: '2' }));
  assert.throws(() => buildCheckoutPayload({ storeId: '1' }));
});

test('extractCheckoutUrl saca la url o devuelve null', () => {
  assert.equal(
    extractCheckoutUrl({ data: { attributes: { url: 'https://x.lemonsqueezy.com/checkout/abc' } } }),
    'https://x.lemonsqueezy.com/checkout/abc',
  );
  assert.equal(extractCheckoutUrl({}), null);
  assert.equal(extractCheckoutUrl(null), null);
});
