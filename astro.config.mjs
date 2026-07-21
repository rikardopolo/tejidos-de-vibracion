// @ts-check
import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';
import vercel from '@astrojs/vercel';
import sentry from '@sentry/astro';
import { unified } from '@astrojs/markdown-remark';
import remarkSeparators from './src/lib/remark-separators.mjs';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';

// El MISMO processor unified para .md y .mdx. El libro es 100% .mdx; pasar el
// processor EXPLÍCITO a mdx() garantiza que remarkSeparators + remark-math/rehype-katex
// corran sobre los .mdx (la herencia automática de markdown.processor no bastó en Astro 7).
const markdownProcessor = unified({
  remarkPlugins: [remarkSeparators, remarkMath],
  rehypePlugins: [rehypeKatex],
});

// https://astro.build/config
export default defineConfig({
  site: 'https://tejidosdevibracion.com',
  output: 'static',
  // compressHTML:false · Astro 7 colapsa por defecto el whitespace JSX entre palabra y
  // tag inline (énfasis, enlaces, footnotes <sup>) — el libro es prose-heavy. Preservar
  // el whitespace evita palabras pegadas en la prosa. +~3-4% gzip (Vercel comprime).
  compressHTML: false,
  adapter: vercel({
    webAnalytics: { enabled: false },
    imageService: false,
  }),
  // remarkSeparators gilda los separadores literales standalone (— ◇ —, ◆,
  // ◇ ◆ ◇) a divisores .flourish en oro · MDX hereda markdown.remarkPlugins.
  // Astro 7 · Sätteri (procesador markdown default, en Rust) NO ejecuta plugins
  // remark/rehype (JS) → forzar el procesador unified() de @astrojs/markdown-remark
  // para que SIGAN corriendo remarkSeparators (329 separadores .flourish en oro) +
  // remark-math/rehype-katex (21 fórmulas KaTeX). Sin esto: build verde pero glifos
  // crudos y `$$…$$` literal en todo el libro. gfm/smartypants quedan en su default
  // (true) = mismo comportamiento tipográfico que Astro 4.
  markdown: {
    processor: markdownProcessor,
  },
  // Sentry · SOLO servidor. enabled.client:false es imprescindible: sin él la
  // integración inyecta el SDK de navegador en cada página AUNQUE no exista
  // sentry.client.config.* (fallback buildClientSnippet) y la CSP script-src 'self'
  // lo bloquearía. Server-only ⇒ cero cambios de CSP. Con output:'static' solo
  // instrumenta las funciones serverless (/api/* + prerender=false). Sin subida
  // de source maps (no hay SENTRY_AUTH_TOKEN). Init + scrubbing en
  // sentry.server.config.js.
  integrations: [
    sentry({
      enabled: { client: false, server: true },
      sourceMapsUploadOptions: { enabled: false },
    }),
    mdx({ processor: markdownProcessor }),
  ],
  build: {
    inlineStylesheets: 'auto',
  },
  vite: {
    build: {
      cssMinify: 'lightningcss',
    },
  },
});
