# CLAUDE.md · tejidos-de-vibracion (sitio del libro)

Sitio del libro **tejidosdevibracion.com** (home, /obertura, /indice, /recibir, /comunidad, /sobre-el-libro, /capitulo/[chapter]/[section]). Filosofía/libro va AQUÍ; fenómenos/simuladores van al portal (`E:\dev\tejidos-de-realidad`). Workspace editorial canónico: `E:\dev\tdv-workspace-editorial`.

## Stack
- Astro 4.16 (app única, sin monorepo) · TypeScript · MDX + Content Collections · pnpm.
- KaTeX 0.17 + remark-math/rehype-katex (fórmulas; Cap. 2 las usa todas).
- Supabase (`@supabase/supabase-js`) + Brevo vía REST (`src/lib/brevo.ts`, sin SDK npm).
- **Sin vitest** (no hay suite de tests aquí) · **Sin PostHog** (tracking first-party propio).

## Reglas de oro
1. **Gating de capítulos — TRAMPA CONOCIDA:** los MDX monolíticos en `content/book/<chapter>.mdx` controlan el `chapterEntry`/routing de las piezas de `content/chapter-sections/`. **NUNCA borrarlos** (rompe el routing → redirige a /indice). Para abrir/cerrar un capítulo: cambiar `status` en el monolítico (`fragmento-permanente` protege Caps. 1-3 publicados), no tocar las piezas.
2. **CSP estricta sin inline:** `script-src 'self'` (vercel.json), sin hash/nonce. Todo JS de comportamiento va en `public/*.js` cargado con `<script is:inline src="/x.js" defer>`. Un `<script>` normal de componente que Astro inline-ee se bloquea EN SILENCIO en prod.
3. **Migraciones SQL NO viven aquí:** la Supabase es compartida y sus migraciones están en el repo del portal (`tejidos-de-realidad/supabase/migrations/`). Tablas usadas: `leads`, `events`, `reading_events`, `reading_progress`.
4. El contenido editorial es canon proyectado: la fuente de verdad de la prosa vive en el workspace editorial (canon .txt + .docx). No editar prosa de fondo sin coordinar con el canon.

## Deploy (Vercel)
- `deploymentEnabled: main` → **las ramas feature NO construyen preview por push** (salen CANCELED). Para previews: `vercel deploy` por CLI desde el working tree.
- Producción = `origin/main`. Redirects `/libro/*` viven en el PORTAL (301 hacia este dominio).

## Flujos clave
- **Registro DOI:** `POST /api/leads/libro` (Brevo, doble opt-in por POST) → confirmación en `/bienvenido?t=TOKEN` (no existe ruta /confirmar).
- **Tracking de lectura:** `public/reading-tracker.js` (first-party, CSP-safe, sendBeacon) → `POST /api/track` (`page_view`, `section_progress`, `section_complete`).
- Lector: `layouts/BookReader.astro` (shell común de OberturaLayout/CapituloLayout) + `public/libro-*.js`.

## Ramas pendientes (no mergeadas a main)
- `feat/imprenta-print-pipeline` — PDF de imprenta (`/print/[...slug]` + PrintLayout + print.css + Vivliostyle; en Windows usa Chrome del sistema vía `--executable-browser`).
- Comprobar `git log origin/main -3` al iniciar: este repo avanza por PRs squash-mergeados; el `main` local suele quedar detrás.

## Comandos
```bash
pnpm dev          # dev server
pnpm build        # build producción (verifica prerendering)
vercel deploy     # preview de rama (por CLI; push no buildea)
```
