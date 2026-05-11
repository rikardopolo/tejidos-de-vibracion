# Tejidos de Vibración · Volumen I

Sitio web del libro **Tejidos de Vibración** · proyecto editorial de Ricardo Polo (Orion).

- **Dominio:** [tejidosdevibracion.com](https://tejidosdevibracion.com) (futuro)
- **Stack:** Astro · TypeScript strict · MDX · Vanilla CSS · output static
- **Deploy:** Vercel (proyecto separado del portal hermano)
- **Portal hermano:** [tejidosderealidad.com](https://tejidosderealidad.com) — repo [`tejidos-de-realidad`](https://github.com/rikardopolo/tejidos-de-realidad)

## Desarrollo local

```bash
pnpm install
pnpm dev          # http://localhost:4321
pnpm build        # ./dist
pnpm preview      # preview de la build
```

## Estructura

```
src/
  pages/          # rutas Astro
    api/
      leads/
        libro.ts  # endpoint Brevo (serverless Vercel)
  layouts/        # LecturaLarga.astro, Base.astro
  components/     # MDX book components + UI
  content/        # Content Collections (book, capitulos)
  lib/            # brevo.ts, seo.ts, toc.ts
  styles/         # tokens + system.css portado
public/
  fonts/          # EB Garamond self-hosted
  og/             # imágenes Open Graph
scripts/          # utilidades (sync-chapter, etc.)
```

## Variables de entorno

Ver `.env.example` para la lista completa. Se configuran en Vercel dashboard.

## Licencia

© 2026 Ricardo Polo (Orion). Todos los derechos reservados.
