# CLAUDE.md · tejidos-de-vibracion (sitio del libro)

Sitio del libro **tejidosdevibracion.com** (home, /obertura, /indice, /recibir, /comunidad, /sobre-el-libro, /capitulo/[chapter]/[section]). Filosofía/libro va AQUÍ; fenómenos/simuladores van al portal (`E:\dev\tejidos-de-realidad`). Workspace editorial canónico: `E:\dev\tdv-workspace-editorial`.

## Stack
- **Astro 7** (app única, sin monorepo) · **Node 24.x** (`engines`) · TypeScript · MDX + Content Collections · pnpm.
- `@astrojs/mdx` 7 · `@astrojs/vercel` 11 · KaTeX 0.17 + remark-math/rehype-katex (fórmulas; Cap. 2 las usa todas).
- Supabase (`@supabase/supabase-js`) + Brevo vía REST (`src/lib/brevo.ts`, sin SDK npm).
- Sentry **server-only** (`sentry.server.config.js`, init desde `src/middleware.ts`).
- **Sin vitest** · **Sin PostHog** (tracking first-party propio). El único control automático de contenido es `pnpm lint:contenido`.

## Reglas de oro
1. **Gating de capítulos — TRAMPA CONOCIDA:** los MDX monolíticos en `src/content/book/<chapter>.mdx` (hoy: `obertura`, `cap-1`, `cap-2`, `cap-3`) controlan el `chapterEntry`/routing de las piezas de `src/content/chapter-sections/`. **NUNCA borrarlos** (rompe el routing → redirige a /indice). Para abrir/cerrar un capítulo: cambiar `status` en el monolítico (`fragmento-permanente` protege lo publicado), no tocar las piezas. La visibilidad de una pieza la manda el `status` del shell padre, no la pieza.
2. **CSP estricta sin inline:** `script-src 'self'` (vercel.json), sin hash/nonce. Todo JS de comportamiento va en `public/*.js` cargado con `<script is:inline src="/x.js" defer>`. Un `<script>` normal de componente que Astro inline-ee se bloquea EN SILENCIO en prod. (`connect-src` solo permite `self` + `api.brevo.com`.)
3. **Migraciones SQL NO viven aquí:** la Supabase es compartida y sus migraciones están en el repo del portal (`tejidos-de-realidad/supabase/migrations/`). Tablas usadas: `leads`, `events`, `reading_events`, `reading_progress`.
4. El contenido editorial es canon proyectado: la fuente de verdad de la prosa vive en el workspace editorial (canon .txt + .docx). No editar prosa de fondo sin coordinar con el canon.
5. **Antes de tocar prosa, correr `pnpm lint:contenido`** (`scripts/content-lint.mjs`): guarda los cerrojos de continuidad del Acto I. Tiene su propio test (`scripts/content-lint.test.mjs`).

## Formato editorial web («Umbral»)
Componentes de `src/components/book/`: `UmbralPoetico`, `Marginalia` (cajas + raíl), `AnclajeExperiencial`, `VozTejido`, `PausaReflexiva`, `CierreVibracional`. Caps. 1-3 abren con una pieza `01-umbral.mdx`. Al portar el formato a un capítulo nuevo: el port es CSS + raíl, `Marginalia.astro` se comparte.

**GOTCHAs de MDX** (cazados en Cap. 4): los autolinks `<https://…>` rompen el parse → URL desnuda; los comentarios HTML `<!-- -->` no valen → `{/* */}`.

## Deploy (Vercel)
- `deploymentEnabled: main` → **las ramas feature NO construyen preview por push** (salen CANCELED). Para previews: `vercel deploy` por CLI desde el working tree.
- Producción = `origin/main`. Redirects `/libro/*` viven en el PORTAL (301 hacia este dominio).
- Env de Vercel **solo aplica a deploys posteriores** a su creación: si añades una variable, hay que redesplegar.
- En preview (rama ≠ main) el gating se apaga → los capítulos se ven enteros. Es esperado, no un fallo. Runbook: `preview/chapters-1-2-3` + GitHub Action de auto-refresh.

## Flujos clave
- **Registro DOI:** `POST /api/leads/libro` (Brevo, doble opt-in por POST) → confirmación en `/bienvenido?t=TOKEN` (no existe ruta /confirmar).
- **Tracking de lectura:** `public/reading-tracker.js` (first-party, CSP-safe, sendBeacon) → `POST /api/track` (`page_view`, `section_progress`, `section_complete`).
- Lector: `layouts/BookReader.astro` (shell común de OberturaLayout/CapituloLayout) + `public/libro-*.js`.

## Ramas y flujo de trabajo
- Este repo avanza por **PRs squash-mergeados**; el `main` local suele quedar detrás. Comprobar `git log origin/main -3` al iniciar — un `origin/main` local desfasado ha producido falsas alarmas; verificar con `gh api` + `merge-base`, **nunca force-push a main**.
- Hay ~20 ramas remotas vivas; varias sin mergear a propósito (p. ej. `feat/imprenta-print-pipeline` — PDF de imprenta con `/print/[...slug]` + PrintLayout + print.css + Vivliostyle; en Windows usa Chrome del sistema vía `--executable-browser`).

## Comandos
```bash
pnpm dev              # dev server
pnpm build            # build producción (verifica prerendering)
pnpm typecheck        # astro check
pnpm lint:contenido   # cerrojos de continuidad del Acto I
vercel deploy         # preview de rama (por CLI; push no buildea)
```
