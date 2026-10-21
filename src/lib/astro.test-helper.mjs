/** Render de plantillas reales, sin Vite, red ni base. Reutiliza el cargador TS de endpoints. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import * as compilerRuntime from 'astro/compiler-runtime';
import { experimental_AstroContainer as Container } from 'astro/container';
import { cargarModuloTs } from './endpoint.test-helper.mjs';
const { transform } = createRequire(import.meta.resolve('astro/package.json'))('@astrojs/compiler-rs');
const ROOT = new URL('../../', import.meta.url);
export async function cargarAstro(ruta, dependencias, env = {}) {
  const { code, diagnostics } = transform(readFileSync(new URL(ruta, ROOT), 'utf8'), {
    filename: ruta, internalURL: 'astro/compiler-runtime', resultScopedSlot: true, resolvePath: (s) => s,
  });
  assert.deepEqual(diagnostics.filter((d) => d.severity === 'error'), [], ruta);
  const deps = { 'astro/compiler-runtime': compilerRuntime, ...dependencias };
  for (const m of code.matchAll(/import "([^"]+\?astro&type=style[^"]*)";/g)) deps[m[1]] = {};
  return cargarModuloTs(new URL(`${ruta}.ts`, ROOT), deps, { env, fuente: code });
}
export async function renderAstro(componente, ruta, props = {}, opciones = {}) {
  const container = await Container.create();
  return container.renderToString(componente.default, { props, request: new Request(`https://libro-preview.test${ruta}`), ...opciones });
}
