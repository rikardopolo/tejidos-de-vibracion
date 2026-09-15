import { test } from 'node:test';
import assert from 'node:assert/strict';
import { utmsSaneadas, MAX_LARGO_UTM } from './utm.mjs';

// Lo que este fichero existe para impedir:
//
// 1. QUE ENTRE CUALQUIER COSA. `metadata` es jsonb: acepta objetos anidados, arrays y
//    cadenas de cualquier longitud. Lo que llega aquí lo pone el navegador del visitante.
// 2. QUE `null` Y `{}` SE CONFUNDAN. `null` significa «llegó sin atribución»; un objeto
//    vacío significaría «guardamos algo y está vacío». La diferencia es la que llevamos
//    cinco meses sin poder hacer.

test('extrae las UTMs reconocidas', () => {
  assert.deepEqual(
    utmsSaneadas({
      utm_source: 'tdr-ig',
      utm_medium: 'reel',
      utm_campaign: 'agosto-a07',
      utm_content: 'a07-do-re-mi',
    }),
    { utm_source: 'tdr-ig', utm_medium: 'reel', utm_campaign: 'agosto-a07', utm_content: 'a07-do-re-mi' },
  );
});

test('descarta claves que no son UTMs', () => {
  const r = utmsSaneadas({ utm_source: 'tdr-ig', correo: 'x@y.com', password: 'hunter2', __proto__: {} });
  assert.deepEqual(r, { utm_source: 'tdr-ig' });
});

test('descarta valores que no son cadenas', () => {
  // 🔴 Sin esto, un objeto anidado entraría entero en la columna jsonb.
  const r = utmsSaneadas({
    utm_source: { $ne: null },
    utm_medium: ['a', 'b'],
    utm_campaign: 42,
    utm_content: 'a07-do-re-mi',
  });
  assert.deepEqual(r, { utm_content: 'a07-do-re-mi' });
});

test('recorta los valores largos', () => {
  const r = utmsSaneadas({ utm_campaign: 'x'.repeat(5000) });
  assert.equal(r.utm_campaign.length, MAX_LARGO_UTM);
});

test('poda los espacios y descarta lo que queda vacío', () => {
  assert.deepEqual(utmsSaneadas({ utm_source: '  tdr-ig  ', utm_medium: '   ' }), { utm_source: 'tdr-ig' });
});

test('sin UTMs válidas devuelve null, no un objeto vacío', () => {
  // Control negativo: si esto devolviera {}, «vino sin atribución» y «vino con
  // atribución vacía» quedarían indistinguibles en la base.
  assert.equal(utmsSaneadas({ utm_medium: '' }), null);
  assert.equal(utmsSaneadas({ pepe: 'x' }), null);
  assert.equal(utmsSaneadas({}), null);
});

test('no se cae con entradas que no son objetos', () => {
  for (const basura of [null, undefined, 'utm_source=x', 42, true, ['utm_source']]) {
    assert.equal(utmsSaneadas(basura), null);
  }
});
