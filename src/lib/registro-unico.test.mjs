import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as runtime from 'astro/runtime/server/index.js';
import { confirmarDoi } from './bienvenido.test-helper.mjs';
import * as sesion from './sesion-tdv.mjs';
import * as alta from './alta-libro.mjs';
import * as checkout from './checkout-suscripcion.mjs';
import * as gate from './gate-decision.mjs';
import * as zod from 'zod';
import { cargarModuloTs } from './endpoint.test-helper.mjs';
import { cargarAstro, renderAstro } from './astro.test-helper.mjs';

const SECRET = 'sesion-falsa-registro-unico-'.repeat(2);
const ROOT = new URL('../../', import.meta.url);
const modulo = (defaultExport) => ({ __esModule: true, default: defaultExport });
const Vacio = modulo(runtime.createComponent(() => runtime.render``));
const Layout = modulo(runtime.createComponent((_r, _p, slots) => runtime.render`${slots.default?.()}`));

async function piezas(activa, conSesion = false) {
  const env = { TDV_SESION_ENABLED: String(activa), TDV_SESSION_SECRET: SECRET, PORTAL_AUTORIZAR_URL: 'https://portal-preview.test/cuenta/autorizar' };
  const cuenta = cargarModuloTs(new URL('./cuenta-tdv.ts', import.meta.url), { './sesion-tdv.mjs': sesion }, { env });
  const deps = { '@/lib/cuenta-tdv': cuenta };
  const PuertaCuenta = await cargarAstro('src/components/book/PuertaCuenta.astro', deps, env);
  const Formulario = await cargarAstro('src/components/book/FormularioTejedor.astro', { ...deps,
    './PuertaCuenta.astro': PuertaCuenta, '@/lib/alta-libro.mjs': alta }, env);
  const CuentaTdv = await cargarAstro('src/components/book/CuentaTdv.astro', deps, env);
  const PuertaSuscripcion = await cargarAstro('src/components/book/PuertaSuscripcion.astro', deps, env);
  const Puerta = await cargarAstro('src/components/book/BloquePuerta.astro', { ...deps,
    './PuertaCuenta.astro': PuertaCuenta, './FormularioTejedor.astro': Formulario,
    './CuentaTdv.astro': CuentaTdv, './PuertaSuscripcion.astro': PuertaSuscripcion,
    '@/lib/checkout-suscripcion.mjs': checkout }, env);
  const render = (componente, ruta, props = {}, opciones = {}) => {
    const headers = {};
    if (conSesion) headers.Cookie = `${sesion.SESION_COOKIE}=${sesion.firmarSesionTdv({ aid: '11111111-2222-4333-8444-555555555555', ep: 0, am: 'codigo', em: 'a***@correo.test' }, { secret: SECRET })}`;
    return renderAstro(componente, ruta, props, { request: new Request(`https://libro-preview.test${ruta}?dato=no-debe-viajar`, { headers }), ...opciones });
  };
  return { env, cuenta, deps, PuertaCuenta, Formulario, Puerta, render };
}
function verificar(html, activa, ruta, conSesion = false) {
  if (!activa) { assert.match(html, /type="email"/); assert.doesNotMatch(html, /data-puerta-cuenta/); return; }
  assert.doesNotMatch(html, /type="email"|data-tejedor-form|O con una cuenta|Un nombre y un correo/);
  assert.match(html, /data-puerta-cuenta/);
  assert.match(html, /https:\/\/portal-preview.test\/cuenta#correos/);
  if (conSesion) assert.match(html, /Ya entraste con tu cuenta/);
  else {
    assert.match(html, /Entrar o crear mi cuenta/);
    const href = html.match(/href="(\/auth\/entrar\?next=[^"]+)"/)[1];
    assert.equal(new URL(href, 'https://libro.test').searchParams.get('next'), ruta);
  }
}

test('registro único: formulario reutilizable apagado/encendido, con y sin sesión', async () => {
  for (const activa of [false, true]) for (const conSesion of [false, true]) {
    const p = await piezas(activa, conSesion);
    verificar(await p.render(p.Formulario, '/recibir'), activa, '/recibir', conSesion);
  }
});
for (const tipo of ['obertura', 'obertura-pieza', 'cap-bloqueado']) {
  test(`registro único: ${tipo}, dos estados y next de la pieza`, async () => {
    for (const activa of [false, true]) for (const conSesion of [false, true]) {
      const p = await piezas(activa, conSesion);
      verificar(await p.render(p.Puerta, '/obertura/02-meta-observador', { tipo }), activa, '/obertura/02-meta-observador', conSesion);
    }
  });
}
test('registro único: espera no promete correos sin elección; BloqueRegistro usa la misma puerta', async () => {
  for (const activa of [false, true]) {
    const p = await piezas(activa);
    const espera = await p.render(p.Puerta, '/capitulo/cap-4/01-umbral', { tipo: 'cap-espera' });
    assert.match(espera, activa ? /puedes elegir las Cartas/ : /Estás en la lista/);
    assert.doesNotMatch(espera, /type="email"/);
    const Registro = await cargarAstro('src/components/book/BloqueRegistro.astro', {
      ...p.deps, './FormularioTejedor.astro': p.Formulario }, p.env);
    verificar(await p.render(Registro, '/obertura'), activa, '/obertura');
  }
});
for (const [archivo, ruta] of [['comunidad', '/comunidad'], ['sobre-el-libro', '/sobre-el-libro'], ['recibir', '/recibir'], ['obertura/index', '/obertura']]) {
  test(`registro único: página ${ruta}, formulario anterior o cuenta`, async () => {
    for (const activa of [false, true]) {
      const p = await piezas(activa);
      const Pagina = await cargarAstro(`src/pages/${archivo}.astro`, { ...p.deps,
        '@/layouts/LecturaLarga.astro': Layout, '@/layouts/OberturaLayout.astro': Layout,
        '@/components/book/BloquePuerta.astro': p.Puerta, '@/components/book/LitLink.astro': Vacio,
        '@/lib/gating': { getNivel: () => 0, getAcceso: () => ({ nivel: 0, slugs: [] }), gatingActivo: () => true },
        '@/lib/seo': { SITE: 'https://libro.test', breadcrumb: () => ({}), wrapGraph: (x) => x },
        'astro:content': { getCollection: async () => [] },
      }, p.env);
      verificar(await p.render(Pagina, ruta), activa, ruta);
    }
  });
}
for (const slug of ['01-anclaje', '02-meta-observador']) {
  test(`registro único: pieza ${slug}, captura final o bloqueo`, async () => {
    for (const activa of [false, true]) {
      const p = await piezas(activa);
      const Pagina = await cargarAstro('src/pages/obertura/[slug].astro', { ...p.deps,
        '@/layouts/OberturaLayout.astro': Layout, '@/components/book/BloquePuerta.astro': p.Puerta,
        '@/components/book/FormularioTejedor.astro': p.Formulario,
        '@/lib/gating': { getAcceso: () => ({ nivel: 0, slugs: [] }), gatingActivo: () => true, puedeAcceder: gate.puedeAcceder },
        '@/lib/seo': { SITE: 'https://libro.test', breadcrumb: () => ({}), wrapGraph: (x) => x },
        'astro:content': { getEntry: async () => ({ data: { title: 'Pieza', authors: ['Ricardo Polo'], kind: 'capitulo' } }),
          getCollection: async () => [], render: async () => ({ Content: Vacio.default }) },
      }, p.env);
      verificar(await p.render(Pagina, `/obertura/${slug}`, {}, { params: { slug } }), activa, `/obertura/${slug}`);
    }
  });
}
test('registro único: nivel 1 solo de sesión al encender; token anterior intacto al apagar', async () => {
  for (const activa of [false, true]) {
    const p = await piezas(activa);
    const gating = cargarModuloTs(new URL('./gating.ts', import.meta.url), {
      './token': { verifyAccessToken: () => ({ valid: true }) },
      './purchase-token.mjs': { looksLikePurchaseToken: () => false },
      './refund-gate.mjs': {}, './supabase': { getServerClient: () => null },
      './cuenta-tdv': p.cuenta, './gate-decision.mjs': gate, './sesion-tdv.mjs': sesion,
      './acceso-cuenta.mjs': {}, '@sentry/astro': {},
    }, { env: { ...p.env, ACCESS_TOKEN_SECRET: 'falso' } });
    assert.equal(gating.getNivel({ get: (k) => k === 'tejedor-access' ? { value: 'token-antiguo' } : undefined }), activa ? 0 : 1);
    const token = sesion.firmarSesionTdv({ aid: '11111111-2222-4333-8444-555555555555', ep: 0, am: 'codigo' }, { secret: SECRET });
    assert.equal(gating.getNivel({ get: (k) => k === sesion.SESION_COOKIE ? { value: token } : undefined }), activa ? 1 : 0);
  }
});
test('registro único: navegación y contacto apuntan a la cuenta con next', async () => {
  for (const activa of [false, true]) {
    const p = await piezas(activa);
    const Header = await cargarAstro('src/components/BookHeader.astro', p.deps, p.env);
    const html = await p.render(Header, '/obertura/02-meta-observador');
    assert.match(html, activa ? /\/auth\/entrar\?next=%2Fobertura%2F02-meta-observador/ : /href="\/recibir"/);
    const Contacto = await cargarAstro('src/pages/contacto.astro', { ...p.deps, '@/layouts/LecturaLarga.astro': Layout, '@/lib/seo': { SITE: 'https://libro.test' } }, p.env);
    assert.match(await p.render(Contacto, '/contacto'), activa ? /\/auth\/entrar\?next=%2Fcontacto/ : /un nombre y un correo/);
  }
});
test('registro único: POST antiguos rechazan capturas con sesión activada', async () => {
  for (const activa of [false, true]) {
    const p = await piezas(activa);
    for (const archivo of ['leads/libro', 'preventa']) {
      const api = cargarModuloTs(new URL(`src/pages/api/${archivo}.ts`, ROOT), {
        ...p.deps, zod, '@/lib/brevo': {}, '@/lib/token': {}, '@/lib/supabase': {}, '@/lib/geo': {},
        '@/lib/utm.mjs': {}, '@/lib/alta-libro.mjs': alta,
      }, { env: p.env });
      const res = await api.POST({ request: new Request(`https://libro.test/api/${archivo}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{' }) });
      assert.equal(res.status, activa ? 409 : 400);
    }
  }
});
test('registro único: barra de sesión lleva a las preferencias del portal de preview', async () => {
  for (const activa of [false, true]) for (const conSesion of [false, true]) {
    const p = await piezas(activa, conSesion);
    const Barra = await cargarAstro('src/components/book/CuentaTdv.astro', p.deps, p.env);
    const html = await p.render(Barra, '/obertura', { variante: 'barra' });
    if (activa && conSesion) assert.match(html, /href="https:\/\/portal-preview.test\/cuenta#correos">Mi cuenta/);
    else assert.doesNotMatch(html, />Mi cuenta/);
  }
});


test('registro único: DOI antiguo conserva Cartas, sin emitir token de lectura al encender', async () => {
  for (const activa of [false, true]) {
    const r = await confirmarDoi({ activa });
    assert.equal(r.contactos.length, 1); assert.equal(r.contactos[0].listId, 9);
    if (activa) { assert.doesNotMatch(r.cookie, /tejedor-access=/); assert.match(r.html, /\/auth\/entrar\?next=%2Fobertura/); }
    else assert.match(r.cookie, /tejedor-access=/);
  }
});
test('registro único: DOI antiguo no revierte una baja posterior de las preferencias', async () => {
  const r = await confirmarDoi({ activa: true, retirada: true });
  assert.equal(r.contactos.length, 0); assert.doesNotMatch(r.cookie, /tejedor-access=/);
  for (const activa of [false, true]) {
    const get = await confirmarDoi({ activa, post: false });
    assert.equal(get.contactos.length, 0); assert.equal(get.cookie, '');
  }
});
