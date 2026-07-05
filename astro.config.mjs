// @ts-check
import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';
import vercel from '@astrojs/vercel';
import { unified } from '@astrojs/markdown-remark';
import remarkSeparators from './src/lib/remark-separators.mjs';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';

// El MISMO processor unified para .md y .mdx. El libro es 100% .mdx; pasar el
// processor EXPLÃCITO a mdx() garantiza que remarkSeparators + remark-math/rehype-katex
// corran sobre los .mdx (la herencia automÃ¡tica de markdown.processor no bastÃ³ en Astro 7).
const markdownProcessor = unified({
  remarkPlugins: [remarkSeparators, remarkMath],
  rehypePlugins: [rehypeKatex],
});

// https://astro.build/config
export default defineConfig({
  site: 'https://www.tejidosdevibracion.com',
  output: 'static',
  // compressHTML:false Â· Astro 7 colapsa por defecto el whitespace JSX entre palabra y
  // tag inline (Ã©nfasis, enlaces, footnotes <sup>) â€” el libro es prose-heavy. Preservar
  // el whitespace evita palabras pegadas en la prosa. +~3-4% gzip (Vercel comprime).
  compressHTML: false,
  adapter: vercel({
    webAnalytics: { enabled: false },
    imageService: false,
  }),
  // remarkSeparators gilda los separadores literales standalone (â€” â—‡ â€”, â—†,
  // â—‡ â—† â—‡) a divisores .flourish en oro Â· MDX hereda markdown.remarkPlugins.
  // Astro 7 Â· SÃ¤tteri (procesador markdown default, en Rust) NO ejecuta plugins
  // remark/rehype (JS) â†’ forzar el procesador unified() de @astrojs/markdown-remark
  // para que SIGAN corriendo remarkSeparators (329 separadores .flourish en oro) +
  // remark-math/rehype-katex (21 fÃ³rmulas KaTeX). Sin esto: build verde pero glifos
  // crudos y `$$â€¦$$` literal en todo el libro. gfm/smartypants quedan en su default
  // (true) = mismo comportamiento tipogrÃ¡fico que Astro 4.
  markdown: {
    processor: markdownProcessor,
  },
  integrations: [mdx({ processor: markdownProcessor })],
  build: {
    inlineStylesheets: 'auto',
  },
  vite: {
    build: {
      cssMinify: 'lightningcss',
    },
  },
});
