#!/usr/bin/env node
/**
 * agentic-canary · comprueba contra un despliegue REAL que la campaña de
 * agentic readiness sigue en pie. Node puro, sin dependencias.
 *
 *   node scripts/agentic-canary.mjs --base=https://tejidosdevibracion.com
 *   node scripts/agentic-canary.mjs --base=<preview> --cookie=<cookies.txt>
 *
 * Por qué existe y por qué está commiteado: en el portal hermano el canary
 * vivió como un bloque de curl en el cuerpo del PR. Verificó cabeceras y
 * negociación —y se le escapó una regresión de canonicals que llegó a
 * producción, porque un canary de cabeceras NO verifica SEO—. Aquí el
 * canary es un fichero del repo, incluye los canonicals, y se puede volver
 * a correr dentro de un año sin arqueología.
 *
 * Las rutas y el mapa del 404 se importan de su fuente única (el manifiesto
 * del parche y agent-md): si alguien añade una página y olvida el canary,
 * el canary ya la está comprobando.
 *
 * Se exporta `runCanary({ base, fetchImpl })` para poder ejercitarlo contra
 * respuestas sintéticas —incluidas rotas a propósito— sin desplegar nada.
 */
import { readFileSync } from 'node:fs';
import { MD_VARIANTS } from './patch-vercel-output.mjs';
import { RUTAS_404, SITE } from '../src/lib/agent-md.mjs';

/* 🔴 `base` es DÓNDE se pregunta; `SITE` es lo que las respuestas dicen.
   Canonicals, og:url, el mapa del 404 y los enlaces de llms.txt son absolutos
   al dominio canónico también cuando quien sirve es un preview de Vercel.
   Compararlos contra `base` haría fallar el canary en preview por algo que
   está bien — lo destapó el ensayo en seco, antes de estrenarlo. */

const MD = 'text/markdown';
const ACCEPT_NAVEGADOR =
  'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8';
/** Las 8 cabeceras del bloque global de vercel.json. */
export const CABECERAS_SEGURIDAD = [
  'x-content-type-options',
  'referrer-policy',
  'x-frame-options',
  'permissions-policy',
  'strict-transport-security',
  'content-security-policy',
  'cross-origin-opener-policy',
  'cross-origin-resource-policy',
];
/** Ancla inglesa → página española a la que debe canonicalizar (SIN barra). */
export const ANCLAS = [
  { en: '/about', es: '/sobre-el-libro' },
  { en: '/contact', es: '/contacto' },
  { en: '/privacy', es: '/privacidad' },
];

const varyTieneAccept = (v) =>
  !!v && v.split(',').some((t) => t.trim().toLowerCase() === 'accept');
const tipo = (res) => (res.headers.get('content-type') ?? '').toLowerCase();
const textoVisible = (html) => {
  const m = html.match(/<main[\s\S]*?<\/main>/i);
  return (m ? m[0] : html)
    .replace(/<(script|style|svg|noscript)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&[a-zA-Z#0-9]+;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
};
const meta = (html, re) => (html.match(re) ?? [])[1] ?? null;

export async function runCanary({ base, cookie, fetchImpl = fetch, verbose = true } = {}) {
  const raiz = base.replace(/\/+$/, '');
  const res = [];
  const check = (nombre, ok, detalle = '') => {
    res.push({ nombre, ok, detalle });
    if (verbose) console.log(`  ${ok ? '✔' : '✖'} ${nombre}${detalle ? ` · ${detalle}` : ''}`);
  };
  const pedir = (ruta, { accept, method = 'GET' } = {}) => {
    const headers = {};
    if (accept) headers.accept = accept;
    if (cookie) headers.cookie = cookie;
    return fetchImpl(`${raiz}${ruta}`, { method, headers, redirect: 'manual' });
  };

  // (a) Las 15 rutas negocian, en GET y en HEAD, con Vary en AMBAS variantes.
  for (const { route } of MD_VARIANTS) {
    for (const method of ['GET', 'HEAD']) {
      const md = await pedir(route, { accept: MD, method });
      check(
        `${method} ${route} · Accept: text/markdown → markdown`,
        md.status === 200 && tipo(md).includes(MD) && varyTieneAccept(md.headers.get('vary')),
        `${md.status} ${tipo(md) || '—'} vary=${md.headers.get('vary') ?? '—'}`,
      );
      const html = await pedir(route, { accept: ACCEPT_NAVEGADOR, method });
      check(
        `${method} ${route} · Accept de navegador → HTML`,
        html.status === 200 && tipo(html).includes('text/html') && varyTieneAccept(html.headers.get('vary')),
        `${html.status} ${tipo(html) || '—'} vary=${html.headers.get('vary') ?? '—'}`,
      );
    }
  }

  // (b) La caché no contamina: 3 rondas alternando sobre las mismas rutas.
  for (const ruta of ['/', '/indice', '/contacto']) {
    let limpio = true;
    let cache = '';
    for (let i = 0; i < 3; i++) {
      const a = await pedir(ruta, { accept: MD });
      const b = await pedir(ruta, { accept: ACCEPT_NAVEGADOR });
      if (!tipo(a).includes(MD) || !tipo(b).includes('text/html')) limpio = false;
      cache = `${a.headers.get('x-vercel-cache') ?? '—'}/${b.headers.get('x-vercel-cache') ?? '—'}`;
    }
    check(`caché · 3 rondas alternando en ${ruta} sin contaminación`, limpio, `x-vercel-cache md/html=${cache}`);
  }

  // (c) 404 con las dos variantes · el comando literal de la auditoría.
  const inexistente = '/una-ruta-que-no-existe-canary';
  const n404html = await pedir(inexistente, { accept: ACCEPT_NAVEGADOR });
  check('404 · ruta inexistente devuelve 404 real (HTML)', n404html.status === 404, `${n404html.status}`);
  const n404md = await pedir(inexistente, { accept: MD });
  const cuerpo404 = n404md.status === 404 ? await n404md.text() : '';
  check(
    '404 · con Accept: text/markdown devuelve markdown',
    n404md.status === 404 && tipo(n404md).includes(MD) && cuerpo404.startsWith('# 404'),
    `${n404md.status} ${tipo(n404md) || '—'}`,
  );
  check(
    '404 · el mapa de recuperación lleva llms.txt, sitemap y las puertas',
    cuerpo404.includes('/llms.txt') &&
      cuerpo404.includes('/sitemap.xml') &&
      RUTAS_404.every((r) => cuerpo404.includes(`${SITE}${r.href}`)),
  );

  // (d) Los .md crudos existen y salen noindex.
  for (const md of [...new Set(MD_VARIANTS.map((v) => v.md))]) {
    const r = await pedir(md);
    check(
      `${md} · 200 con X-Robots-Tag noindex`,
      r.status === 200 && (r.headers.get('x-robots-tag') ?? '').includes('noindex'),
      `${r.status} x-robots-tag=${r.headers.get('x-robots-tag') ?? '—'}`,
    );
  }

  // (e) Las 8 cabeceras de seguridad siguen puestas (la inyección no las tumbó).
  const home = await pedir('/', { accept: ACCEPT_NAVEGADOR });
  const faltan = CABECERAS_SEGURIDAD.filter((h) => !home.headers.get(h));
  check('cabeceras de seguridad · las 8 presentes en /', faltan.length === 0, faltan.length ? `faltan: ${faltan}` : 'CSP incluida');

  // (f) Canonicals · lo que el canary del portal NO miraba.
  for (const { en, es } of ANCLAS) {
    const r = await pedir(en, { accept: ACCEPT_NAVEGADOR });
    const html = r.status === 200 ? await r.text() : '';
    const canonical = meta(html, /<link rel="canonical" href="([^"]+)"/i);
    const og = meta(html, /<meta property="og:url" content="([^"]+)"/i);
    const robots = meta(html, /<meta name="robots" content="([^"]+)"/i);
    check(
      `${en} · canonical a ${es} SIN barra final, og:url igual, noindex,follow`,
      canonical === `${SITE}${es}` && og === canonical && (robots ?? '').replace(/\s/g, '') === 'noindex,follow',
      `canonical=${canonical} og=${og} robots=${robots}`,
    );
    check(`${en} · ≥500 caracteres visibles`, textoVisible(html).length >= 500, `${textoVisible(html).length} chars`);
  }
  const rContacto = await pedir('/contacto', { accept: ACCEPT_NAVEGADOR });
  const htmlContacto = rContacto.status === 200 ? await rContacto.text() : '';
  check(
    '/contacto · indexable, canonical a sí misma y ≥500 caracteres',
    meta(htmlContacto, /<meta name="robots" content="([^"]+)"/i)?.replace(/\s/g, '') === 'index,follow' &&
      meta(htmlContacto, /<link rel="canonical" href="([^"]+)"/i) === `${SITE}/contacto` &&
      textoVisible(htmlContacto).length >= 500,
    `${textoVisible(htmlContacto).length} chars`,
  );

  // (g) llms.txt con la guía, y sin deriva con las rutas que de verdad negocian.
  const rLlms = await pedir('/llms.txt');
  const llms = rLlms.status === 200 ? await rLlms.text() : '';
  check(
    'llms.txt · guía «when to use», «not a fit» y cómo llamar',
    llms.includes('## When to use this site') &&
      /^Not a fit/m.test(llms) &&
      llms.includes('Accept: text/markdown') &&
      llms.includes(`${SITE}/sitemap.xml`),
  );
  const anunciadas = (llms.match(/Negotiating routes: (.+)$/m)?.[1] ?? '')
    .split('·')
    .map((s) => s.trim())
    .filter(Boolean)
    .sort();
  check(
    'llms.txt · las rutas que anuncia son las que negocian',
    JSON.stringify(anunciadas) === JSON.stringify(MD_VARIANTS.map((v) => v.route).sort()),
    `${anunciadas.length} anunciadas vs ${MD_VARIANTS.length} reales`,
  );

  // (h) Sitemap: /contacto dentro, rutas inglesas fuera.
  const rMapa = await pedir('/sitemap.xml');
  const mapa = rMapa.status === 200 ? await rMapa.text() : '';
  check(
    'sitemap · incluye /contacto y NINGUNA ruta inglesa',
    mapa.includes(`${SITE}/contacto<`) && ANCLAS.every(({ en }) => !mapa.includes(`${SITE}${en}<`)),
  );

  // (i) Controles negativos: quien no pide markdown recibe HTML.
  for (const accept of ['*/*', 'application/json', ACCEPT_NAVEGADOR]) {
    const r = await pedir('/', { accept });
    check(`CONTROL · Accept: ${accept.slice(0, 28)}… → HTML`, tipo(r).includes('text/html'), tipo(r) || '—');
  }

  const fallos = res.filter((r) => !r.ok);
  return { total: res.length, pasados: res.length - fallos.length, fallos, resultados: res };
}

function ayuda() {
  console.log(`agentic-canary · verifica la campaña de agentic readiness contra un despliegue.

  --base=<url>      URL a comprobar (obligatorio). Ej: https://tejidosdevibracion.com
  --cookie=<fich>   fichero de cookies (previews protegidos de Vercel)
  --help            esta ayuda

Sale con código 1 si alguna comprobación falla.`);
}

async function main() {
  const args = Object.fromEntries(
    process.argv.slice(2).map((a) => {
      const [k, ...v] = a.replace(/^--/, '').split('=');
      return [k, v.join('=') || true];
    }),
  );
  if (args.help || !args.base) {
    ayuda();
    process.exit(args.help ? 0 : 1);
  }
  const cookie = args.cookie
    ? readFileSync(args.cookie, 'utf8')
        .split('\n')
        .filter((l) => l && !l.startsWith('#'))
        .map((l) => l.split('\t'))
        .filter((c) => c.length >= 7)
        .map((c) => `${c[5]}=${c[6]}`)
        .join('; ')
    : undefined;

  console.log(`\nagentic-canary → ${args.base}\n`);
  const { total, pasados, fallos } = await runCanary({ base: args.base, cookie });
  console.log(`\n${pasados}/${total} comprobaciones pasadas`);
  if (fallos.length) {
    console.log('\nFALLOS:');
    for (const f of fallos) console.log(`  ✖ ${f.nombre} · ${f.detalle}`);
    process.exit(1);
  }
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1].replace(/\\/g, '/')}`).href) {
  await main();
}
