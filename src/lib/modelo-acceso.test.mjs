import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as runtime from 'astro/runtime/server/index.js';
import { cargarAstro, renderAstro } from './astro.test-helper.mjs';
import { cargarModuloTs } from './endpoint.test-helper.mjs';
import * as sesion from './sesion-tdv.mjs';
import * as checkout from './checkout-suscripcion.mjs';

const modulo = (defaultExport) => ({ __esModule: true, default: defaultExport });
const Layout = modulo(runtime.createComponent((_r, _p, slots) => runtime.render`${slots.default?.()}`));

test('modelo de acceso: índice real distingue cuenta y suscripción sin prometer meses pasados', async () => {
  const Toc = await cargarAstro('src/components/book/TocEntry.astro', {});
  for (const estado of ['fragmento-permanente', 'published']) {
    const entradas = [1, 2, 3, 4].map((n) => ({ data: { kind: 'capitulo', chapter: n, title: `Capítulo ${n}`, status: n === 1 ? 'published' : estado, nivelRequerido: n < 4 ? 1 : 2 } }));
    const Pagina = await cargarAstro('src/pages/indice.astro', {
      'astro:content': { getCollection: async (_tipo, filtro) => entradas.filter(filtro) },
      '@/layouts/LecturaLarga.astro': Layout, '@/components/book/TocEntry.astro': Toc,
      '@/components/book/LitLink.astro': Layout,
    });
    const html = await renderAstro(Pagina, '/indice');
    assert.equal((html.match(/class="toc-entry__access">Libre con tu cuenta/g) ?? []).length, 4);
    assert.equal((html.match(/class="toc-entry__access">Con la suscripción/g) ?? []).length, 7);
    assert.doesNotMatch(html, /Tu correo es la entrada|abre en |requiere compra|requiere registro/);
    if (estado !== 'published') assert.match(html, /Libre con tu cuenta · En preparación/);
    else assert.match(html, /href="\/capitulo\/cap-4-biologia-campo-coherente"/);
  }
});

test('modelo de acceso: puertas libres y de suscripción, con interruptores encendidos y apagados', async () => {
  for (const activa of [false, true]) for (const pago of [false, true]) {
    const env = { TDV_SESION_ENABLED: String(activa), SUSCRIPCION_CHECKOUT_ENABLED: String(pago) };
    const cuenta = cargarModuloTs(new URL('./cuenta-tdv.ts', import.meta.url), { './sesion-tdv.mjs': sesion }, { env });
    const deps = { '@/lib/cuenta-tdv': cuenta };
    const PuertaCuenta = await cargarAstro('src/components/book/PuertaCuenta.astro', deps, env);
    const Oferta = await cargarAstro('src/components/book/PuertaSuscripcion.astro', deps, env);
    const Puerta = await cargarAstro('src/components/book/BloquePuerta.astro', { ...deps,
      './FormularioTejedor.astro': Layout, './CuentaTdv.astro': Layout, './PuertaCuenta.astro': PuertaCuenta,
      './PuertaSuscripcion.astro': Oferta, '@/lib/checkout-suscripcion.mjs': checkout }, env);
    const libre = await renderAstro(Puerta, '/obertura/02-meta-observador', { tipo: 'obertura-pieza' });
    assert.match(libre, /con tu cuenta/);
    assert.doesNotMatch(libre, /Un nombre y un correo|Con la suscripción/);
    const premium = await renderAstro(Puerta, '/capitulo/cap-4/01-umbral', { tipo: 'cap-bloqueado', suscripcion: true });
    assert.match(premium, /Con la suscripción/);
    assert.equal(premium.includes('data-suscripcion-checkout'), pago);
  }
});

