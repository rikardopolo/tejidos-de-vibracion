// @ts-check
import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';
import vercel from '@astrojs/vercel/static';

// https://astro.build/config
export default defineConfig({
  site: 'https://tejidosdevibracion.com',
  output: 'static',
  adapter: vercel({
    webAnalytics: { enabled: false },
    imageService: false,
  }),
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
