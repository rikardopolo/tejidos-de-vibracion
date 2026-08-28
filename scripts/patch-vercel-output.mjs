#!/usr/bin/env node
/**
 * patch-vercel-output · negociación de markdown (acceptmarkdown.com) para las
 * páginas principales del libro.
 *
 * Por qué existe: en el Build Output API de Vercel, los `rewrites` de
 * vercel.json se evalúan DESPUÉS de `handle: filesystem` — para una página con
 * .html en disco (la home, /indice, …) un rewrite condicionado a
 * `Accept: text/markdown` jamás ganaría al fichero. La única forma de negociar
 * sobre estáticos es insertar rutas ANTES del handle filesystem, y eso solo se
 * puede hacer editando `.vercel/output/config.json` tras el build. Este script
 * corre como paso de `pnpm build` (package.json).
 *
 * Qué inyecta, justo antes de `{ "handle": "filesystem" }`:
 *  1. Una ruta `continue: true` que marca `Vary: Accept` en TODAS las variantes
 *     (html y md) de los paths negociados — sin ella una CDN puede servir la
 *     variante equivocada desde caché.
 *  2. Una ruta por página que, si la petición trae `Accept: text/markdown`,
 *     reescribe al .md estático (public/*.md) con content-type explícito.
 *
 * El 404 NO se maneja aquí: todo path desconocido cae al catch-all `_render`
 * (SSR) y el middleware negocia su variante markdown (src/lib/agent-md.mjs).
 *
 * Alcance consciente: solo páginas top-level de NIVEL 0. Ni las piezas de la
 * Obertura ni las de capítulo llevan variante .md — su acceso lo decide el
 * gating (lib/gating.ts) y un .md estático lo puentearía. `/obertura` y
 * `/recibir` sí están, pero su .md describe la página, no sirve contenido
 * cerrado.
 *
 * ponytail: manifiesto a mano — si nace una página pública nueva, su entrada se
 * añade aquí y su .md a public/ (el test de paridad de
 * scripts/agentic-readiness.test.mjs vigila que ambos existan).
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

/** Regex del header Accept que dispara la variante markdown.
 * El match de `has.value` es de cadena completa (semántica matchHas de Vercel;
 * su blog oficial usa `(.*)text/markdown(.*)` para esta misma condición).
 *
 * Medido en el edge real del portal hermano (canary del PR #329), no deducido:
 *  - el match resulta case-INSENSITIVE (`Text/Markdown` también negocia), o sea
 *    en paridad con el `wantsMarkdown` del 404 — no hay divergencia;
 *  - ninguna de las dos superficies parsea q-values:
 *    `text/html,text/markdown;q=0.1` devuelve markdown igualmente.
 * Lo segundo se acepta: quien manda `text/markdown` en el Accept lo quiere, y
 * el Accept de los navegadores no lo incluye (verificado con el de Chrome). */
export const ACCEPT_MD = '.*text/markdown.*';

/** Página negociada → su fuente markdown en public/. */
export const MD_VARIANTS = [
  { route: '/', md: '/index.md' },
  { route: '/indice', md: '/indice.md' },
  { route: '/sobre-el-libro', md: '/sobre-el-libro.md' },
  { route: '/obertura', md: '/obertura.md' },
  { route: '/recibir', md: '/recibir.md' },
  { route: '/comunidad', md: '/comunidad.md' },
  { route: '/colofon', md: '/colofon.md' },
  { route: '/acto-i', md: '/acto-i.md' },
  { route: '/acto-ii', md: '/acto-ii.md' },
  { route: '/acto-iii', md: '/acto-iii.md' },
  { route: '/privacidad', md: '/privacidad.md' },
];

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** `src` regex de una página negociada (admite barra final). */
export function srcFor(route) {
  return route === '/' ? '^/$' : `^${escapeRe(route)}/?$`;
}

/** `src` regex-unión de TODOS los paths negociados (para la ruta Vary). */
export function varySrc() {
  const names = MD_VARIANTS.filter((v) => v.route !== '/').map((v) => escapeRe(v.route.slice(1)));
  return `^/(?:${names.join('|')})?/?$`;
}

/**
 * Gate de la cadena del 404 negociado: el catch-all final debe seguir siendo
 * `dest:"_render"` con status 404. Si aparece `dest:"/404.html"` es que alguien
 * prerenderizó src/pages/404.astro — el middleware dejaría de correr en los 404
 * y su variante markdown moriría EN SILENCIO. Mejor reventar aquí.
 */
export function assertCatchAll404(config) {
  const last = config?.routes?.[config.routes.length - 1];
  if (!last || last.status !== 404 || last.dest !== '_render') {
    throw new Error(
      `catch-all inesperado: ${JSON.stringify(last)} — se esperaba {src:"^/.*$",dest:"_render",status:404}. ` +
        '¿404.astro dejó de ser prerender=false? Eso apaga la negociación markdown del 404 (src/lib/agent-md.mjs).',
    );
  }
}

/**
 * Inyecta las rutas de negociación en un config de Build Output API (v3).
 * Muta y devuelve `{ changed, injected }`. Idempotente por rutas PROPIAS (ver
 * abajo), no por «existe alguna ruta con accept».
 */
export function injectMarkdownRoutes(config) {
  const routes = config?.routes;
  if (!Array.isArray(routes)) throw new Error('config.routes no es un array');

  const fsIdx = routes.findIndex((r) => r && r.handle === 'filesystem');
  if (fsIdx === -1) throw new Error('config.json sin { handle: "filesystem" } — layout inesperado del adapter');

  // Idempotencia por rutas PROPIAS (has accept + dest en el manifiesto), no por
  // «existe alguna ruta con accept»: una ruta ajena del adapter que condicione
  // por accept no debe saltarse la inyección en silencio.
  const mdSet = new Set(MD_VARIANTS.map((v) => v.md));
  const ours = routes.filter(
    (r) =>
      Array.isArray(r?.has) &&
      r.has.some((h) => h?.type === 'header' && h?.key === 'accept') &&
      mdSet.has(r?.dest),
  );
  if (ours.length) {
    if (ours.length !== MD_VARIANTS.length) {
      throw new Error(
        `inyección parcial detectada: ${ours.length}/${MD_VARIANTS.length} rutas propias — config corrupto, regenerar con astro build`,
      );
    }
    return { changed: false, injected: 0 };
  }

  const varyRoute = { src: varySrc(), headers: { vary: 'Accept' }, continue: true };
  const mdRoutes = MD_VARIANTS.map(({ route, md }) => ({
    src: srcFor(route),
    has: [{ type: 'header', key: 'accept', value: ACCEPT_MD }],
    dest: md,
    headers: {
      'content-type': 'text/markdown; charset=utf-8',
      'content-disposition': 'inline',
      vary: 'Accept',
    },
  }));

  config.routes = [...routes.slice(0, fsIdx), varyRoute, ...mdRoutes, ...routes.slice(fsIdx)];

  // Cinturón y tirantes del content-type: `overrides` es el mecanismo que el
  // Build Output API documenta para fijar el Content-Type de un estático (el
  // header de ruta funciona, pero esto cubre también el acceso directo a /x.md
  // sin header Accept). Merge sin pisar overrides previos del adapter.
  const overrides = { ...(config.overrides ?? {}) };
  for (const md of new Set(MD_VARIANTS.map((v) => v.md))) {
    overrides[md.slice(1)] = { contentType: 'text/markdown; charset=utf-8' };
  }
  config.overrides = overrides;

  return { changed: true, injected: 1 + mdRoutes.length };
}

function main() {
  const raiz = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const outDir = join(raiz, '.vercel', 'output');
  const configPath = join(outDir, 'config.json');

  if (!existsSync(configPath)) {
    console.error(`[patch-vercel-output] no existe ${configPath} — ¿corrió astro build?`);
    process.exit(1);
  }

  // Control positivo: cada .md del manifiesto debe estar en el output estático.
  const missing = [...new Set(MD_VARIANTS.map((v) => v.md))].filter(
    (md) => !existsSync(join(outDir, 'static', md.slice(1))),
  );
  if (missing.length) {
    console.error(`[patch-vercel-output] faltan en static/: ${missing.join(', ')}`);
    process.exit(1);
  }

  const config = JSON.parse(readFileSync(configPath, 'utf8'));
  assertCatchAll404(config);
  const { changed, injected } = injectMarkdownRoutes(config);
  if (!changed) {
    console.log('[patch-vercel-output] rutas ya presentes — nada que hacer');
    return;
  }
  writeFileSync(configPath, JSON.stringify(config, null, 2));
  console.log(`[patch-vercel-output] ${injected} rutas de negociación markdown inyectadas antes de filesystem`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
