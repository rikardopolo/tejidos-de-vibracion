import { test } from 'node:test';
import assert from 'node:assert/strict';
import { esUrlDePago, HOSTS_TIENDA } from './url-pago.mjs';

// ── La regresión que costó todas las ventas ─────────────────────────────────

test('acepta el checkout REAL que emite Lemon Squeezy para esta tienda', () => {
  // URL literal capturada de producción el 5-ago-2026. La comprobación anterior
  // (`/^https:\/\/[a-z0-9-]+\.lemonsqueezy\.com\//`) la RECHAZABA: el botón
  // enseñaba «No se pudo abrir el pago» a todo el mundo. Si este test se pone
  // rojo, nadie puede comprar.
  assert.equal(
    esUrlDePago(
      'https://tejidosdevibracion.store/checkout/custom/e1aa1048-18ea-4c45-ab3b-5e7df89622fd?signature=f447b4ca5d6666bf141b2eb212d3dfd04234bd0d56e02eb9f1d84f9bda3948ae',
    ),
    true,
  );
});

test('sigue aceptando el dominio genérico de Lemon Squeezy', () => {
  // La tienda puede volver a emitir por ahí; aceptar ambos es el punto.
  assert.equal(esUrlDePago('https://tejidosdevibracion.lemonsqueezy.com/checkout/abc'), true);
  assert.equal(esUrlDePago('https://lemonsqueezy.com/checkout/abc'), true);
});

// ── Lo que la comprobación existe para impedir ──────────────────────────────

test('rechaza cualquier host ajeno, incluidos los que lo imitan', () => {
  for (const malo of [
    'https://evil.com/checkout',
    'https://lemonsqueezy.com.evil.com/checkout', // sufijo falso
    'https://notlemonsqueezy.com/checkout', // sin el punto separador
    'https://tejidosdevibracion.store.evil.com/checkout',
    'https://evil.com/?x=https://tejidosdevibracion.store/', // el host real en el query
  ]) {
    assert.equal(esUrlDePago(malo), false, `debería rechazar ${malo}`);
  }
});

test('rechaza esquemas que no son https', () => {
  assert.equal(esUrlDePago('http://tejidosdevibracion.store/checkout'), false);
  assert.equal(esUrlDePago('javascript:alert(1)'), false);
  assert.equal(esUrlDePago('data:text/html,<script>alert(1)</script>'), false);
  assert.equal(esUrlDePago('//tejidosdevibracion.store/checkout'), false);
});

test('rechaza lo que no es una URL, sin lanzar', () => {
  for (const nada of [undefined, null, '', 'no soy una url', 42, {}, ['https://tejidosdevibracion.store/']]) {
    assert.equal(esUrlDePago(nada), false);
  }
});

test('el dominio de la tienda está en la lista y no como subcadena suelta', () => {
  // Guarda contra «arreglarlo» con un `includes()` sobre la cadena entera, que
  // volvería a aceptar `evil.com/?tejidosdevibracion.store`.
  assert.ok(HOSTS_TIENDA.includes('tejidosdevibracion.store'));
  assert.equal(esUrlDePago('https://x.com/tejidosdevibracion.store'), false);
});
