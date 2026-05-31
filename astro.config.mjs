// @ts-check
import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';
import vercel from '@astrojs/vercel/serverless';
import remarkSeparators from './src/lib/remark-separators.mjs';

// https://astro.build/config
export default defineConfig({
  site: 'https://tejidosdevibracion.com',
  output: 'hybrid',
  adapter: vercel({
    webAnalytics: { enabled: false },
    imageService: false,
  }),
  // remarkSeparators gilda los separadores literales standalone (— ◇ —, ◆,
  // ◇ ◆ ◇) a divisores .flourish en oro · MDX hereda markdown.remarkPlugins.
  markdown: {
    remarkPlugins: [remarkSeparators],
  },
  integrations: [mdx()],
  build: {
    inlineStylesheets: 'auto',
  },
  vite: {
    build: {
      cssMinify: 'lightningcss',
    },
  },
});
