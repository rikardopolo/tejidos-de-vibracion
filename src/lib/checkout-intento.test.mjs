import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  construyeMetadata,
  registraIntento,
  DESENLACES_HUMANOS,
  TIPO_EVENTO,
  ORIGEN_EVENTO,
} from './checkout-intento.mjs';

/** Cliente de mentira que captura la fila insertada. */
function clienteEspia({ error = null, lanza = false } = {}) {
  const filas = [];
  return {
    filas,
    from(tabla) {
      return {
        async insert(row) {
          if (lanza) throw new Error('la base no responde');
          filas.push({ tabla, row });
          return { error };
        },
      };
    },
  };
}

// ── Lo que hace útil el registro ────────────────────────────────────────────

test('registra el intento en `events` con tipo y origen estables', async () => {
  const c = clienteEspia();
  const ok = await registraIntento(c, 'checkout_creado', { ms: 412 });
  assert.equal(ok, true);
  assert.equal(c.filas.length, 1);
  const { tabla, row } = c.filas[0];
  assert.equal(tabla, 'events');
  assert.equal(row.type, TIPO_EVENTO);
  assert.equal(row.source, ORIGEN_EVENTO);
  assert.equal(row.metadata.desenlace, 'checkout_creado');
  assert.equal(row.metadata.producto, 'bundle-preventa');
  assert.equal(row.metadata.ms, 412);
});

test('`lead_id` va en metadata, NUNCA en la columna', async () => {
  // La columna es una FK a `leads`. Un lead_id inventado en el cuerpo de la
  // petición haría fallar el INSERT entero y perderíamos el evento justo en el
  // caso raro — que es cuando más interesa tenerlo.
  const c = clienteEspia();
  await registraIntento(c, 'checkout_creado', { lead_id: 'no-soy-un-uuid' });
  const { row } = c.filas[0];
  assert.equal(row.lead_id, null, 'la columna FK debe ir a null');
  assert.equal(row.metadata.lead_id, 'no-soy-un-uuid', 'el valor se conserva como dato suelto');
});

// ── Lo que NO puede pasar ───────────────────────────────────────────────────

test('ningún dato personal llega a metadata, aunque se pase por error', async () => {
  // Un evento de analítica es justo el sitio donde un dato personal se queda
  // para siempre sin que nadie lo revise. La lista de prohibidas es una
  // allowlist invertida deliberada: si mañana alguien añade `{ correo }` a una
  // llamada, este test se pone rojo.
  const c = clienteEspia();
  await registraIntento(c, 'checkout_creado', {
    correo: 'alguien@ejemplo.com',
    email: 'otro@ejemplo.com',
    nombre: 'Nombre Apellido',
    ip: '203.0.113.7',
    telefono: '+34600000000',
    website: 'relleno-del-honeypot',
    con_correo: true, // este SÍ: es un booleano, no un dato
  });
  const meta = c.filas[0].row.metadata;
  const serializado = JSON.stringify(meta);
  for (const prohibida of ['alguien@ejemplo.com', 'otro@ejemplo.com', 'Nombre Apellido', '203.0.113.7', '+34600000000']) {
    assert.ok(!serializado.includes(prohibida), `se filtró «${prohibida}» a metadata`);
  }
  assert.equal(meta.con_correo, true, 'el booleano sí debe conservarse');
});

test('registrar NUNCA rompe la compra · si la base lanza, devuelve false sin propagar', async () => {
  // Es la garantía que sostiene todo lo demás: si esto lanzara, una caída de
  // Supabase dejaría de registrar Y de vender.
  const c = clienteEspia({ lanza: true });
  const ok = await registraIntento(c, 'checkout_creado');
  assert.equal(ok, false);
});

test('si la base devuelve error, tampoco lanza', async () => {
  const c = clienteEspia({ error: { message: 'permiso denegado' } });
  assert.equal(await registraIntento(c, 'checkout_creado'), false);
});

test('sin cliente configurado devuelve false y no lanza', async () => {
  assert.equal(await registraIntento(null, 'checkout_creado'), false);
});

// ── El contrato de la consulta que Ricardo va a hacer ───────────────────────

test('los desenlaces humanos excluyen al honeypot y a los formatos rotos', () => {
  // «Cuánta gente lo intentó» no debe inflarse con bots ni con peticiones
  // malformadas: son ruido, no intención de compra.
  assert.ok(!DESENLACES_HUMANOS.includes('honeypot'));
  assert.ok(!DESENLACES_HUMANOS.includes('rechazado_formato'));
  assert.ok(DESENLACES_HUMANOS.includes('checkout_creado'));
  assert.ok(DESENLACES_HUMANOS.includes('limitado_por_ritmo'));
});

test('construyeMetadata es pura y no muta lo que recibe', () => {
  const extra = { ms: 1 };
  const a = construyeMetadata('honeypot', extra);
  const b = construyeMetadata('honeypot', extra);
  assert.deepEqual(a, b);
  assert.deepEqual(extra, { ms: 1 }, 'no debe mutar el objeto de entrada');
});
