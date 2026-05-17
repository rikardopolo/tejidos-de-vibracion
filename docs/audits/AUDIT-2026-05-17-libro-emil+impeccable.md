# Audit Completo del Sitio del Libro · Emil Design Eng + Impeccable

> **Generado:** 2026-05-17
> **Auditor:** Claude Code (Sonnet 4.7) · ejecutando los skills externos como guía analítica
> **Skills usados:**
> - **Emil Design Eng** (1 archivo · 26.69 KB · copiado del repo del portal)
> - **Impeccable v3.1** (CLI v2.1.9 · global · ya instalado desde audit del portal)
> **Páginas auditadas:** 11 rutas en `src/pages/` (Home, Obertura, Acto I/II/III, Sobre el libro, Recibir, Bienvenido, Comunidad, Indice, Colofón, Privacidad, 404, Buscar)
> **Branch:** `audit/emil-impeccable-libro-2026-05-17`
> **NO modifica código fuente** · reporte para que Ricardo decida qué arreglar en PR de fixes posterior.

---

## 0 · Resumen ejecutivo

| Métrica | Valor |
|---|---|
| **Total de hallazgos brutos** | **~22** (5 detect HTML + 2 detect src + ~15 audit LLM) |
| **True issues recomendados a arreglar** | **13** |
| **False positives por canon (documentar, no arreglar)** | **~7** (Inter overused-font, border-left blockquote literarios, contrastes de títulos `--oro` ornamentales, etc.) |
| **Grey area (decisión de Ricardo)** | **2** |
| **P0 crítico** | **1** (`:focus-visible` ausente con `outline: none` explícito en inputs) |
| **P1 importante** | **6** |
| **P2 mejora** | **5** |
| **P3 nice-to-have** | **1** |

### Audit Health Score (criterio Impeccable · 0-4 por dimensión)

| Dimensión | Score | Hallazgo más crítico |
|---|---|---|
| Accesibilidad (A11y) | **2 / 4** | `:focus-visible` ausente · `outline: none` explícito en inputs (`system.css:956-960, 1062`) |
| Performance | **3 / 4** | Font preloads en `Base.astro` apuntan a paths inexistentes (404 silencioso) |
| Theming | **3 / 4** | `--reposo #8a8a8a` (2.88:1) y `--oro-suave #b68914` (2.66:1) usados como texto operativo |
| Responsive | **3 / 4** | Touch targets A-/A/A+ en ReaderControls son ~26×32 px (falla WCAG 2.5.5) |
| Anti-Patterns | **4 / 4** | **Cero AI tells confirmados.** Único sitio del proyecto que llega a 4/4 |
| **Total** | **15 / 20** | **Good · address weak dimensions** |

**Verdict:** sitio editorial **excepcionalmente disciplinado en identidad** (4/4 en Anti-Patterns · el único del proyecto que lo logra). Pero baja a **2/4 en Accesibilidad** por `outline: none` explícito + ausencia de skip-link + uso de greys que fallan AA en texto operativo. El portal fue 15/20 con A11y 3/4; el libro es 15/20 con A11y 2/4 pero Anti-Patterns 4/4. Distinto perfil de fortaleza/debilidad.

### Top 5 hallazgos más impactantes

1. **[P0] `:focus-visible` ausente + `outline: none` explícito en inputs** · `system.css:956-960` (`.form-registro input:focus { … }` cambia solo border-color sin halo) y `system.css:1062` (`.form-tejedor input:focus { outline: none; … }`). WCAG 2.4.7 fail. Usuarios solo-teclado navegan a ciegas en CTAs principales (`.lit-link`, `.form-tejedor__submit`, ReaderControls buttons, BookHeader nav).
2. **[P1] Font preloads rotos en `Base.astro:72-85`** · `<link rel="preload" href="/fonts/eb-garamond-latin-400-normal.woff2">` apunta a paths que NO existen (fontsource inlinea via CSS y empaqueta a `/_astro/<hash>.woff2`). 404 silencioso cada page-load. Resultado: EB Garamond carga tarde, FOUC en Obertura y Acto I (precisamente donde más duele).
3. **[P1] Greys que fallan AA como texto operativo** · `--reposo #8a8a8a` (2.88:1 sobre `#f2ead5`) usado en `.eyebrow`, `.meta`, `.form-microcopy`, `.form-tejedor__label`, `.form-tejedor__nota` (`system.css:142, 225-226, 491, 1047, 1111`). `--oro-suave #b68914` (2.66:1) usado como `aria-current` activo en BookHeader (`system.css:99, 259, 420`). El consentimiento RGPD en `form-microcopy` (12px) requiere lectura confirmada y queda en 2.88:1.
4. **[P1] Touch targets sub-44px en ReaderControls A-/A/A+** · `system.css:835-846` da ~26×32 px efectivos. Anti-irónico: precisamente los controles que sirven a la **lectura mobile** son los peor diseñados para mobile. Más el panel `.reader-controls` no tiene media queries · en `<360 px` se desborda lateralmente.
5. **[P1] Ausencia de skip-link** · `<main>` sin `id` ni `tabindex` en `Base.astro:90` + `LecturaLarga.astro:45`. Usuarios de teclado/screen-reader deben recorrer 5 enlaces de nav + progress-rail + 2 triggers flotantes en cada página antes de tocar el contenido. Particularmente brutal en BloquePuerta donde el contenido es un formulario al final.

### Top 3 false positives importantes para documentar

1. **2 `side-tab` (border-left 2px gold) en CSS de Acto I** son **convención editorial clásica** de Pullquote/Marginalia/BloqueRegistro · NO AI side-stripe. Penguin, NYT Magazine, Atlantic usan el mismo patrón. **No arreglar.**
2. **1 `overused-font` (Inter)** flaggeado por Impeccable. Inter es la `--sans` canónica del libro (UI únicamente · eyebrows, meta, nav, forms). El patrón editorial deliberado es "serif para voz literaria, sans para metadata". **No arreglar.**
3. **`--oro #d4a017` como color de títulos** (`.monumental`, `.title-1`, `.title-2`, `.dropcap`) tiene contraste 1.98:1 sobre pergamino · técnicamente falla AA-large (3:1) pero es **canon editorial deliberado**: oro como acento ornamental de capitulares y títulos 48-128 px en EB Garamond bold. WCAG SC 1.4.6 exempt para texto incidental cuando hay duplicación semántica (cada título tiene eyebrow tipográficamente prominente arriba). **No arreglar.**

### Conclusión general

El sitio del libro es **lo que el portal aspira a ser y todavía no es: una identidad visual comprometida**. Pergamino cálido `#f2ead5`, EB Garamond corriendo en cuerpo y título, columna `42rem ≈ 72ch`, line-height 1.7, capitular oro de 4.2em, sangría francesa en párrafos de continuación. Cada decisión tipográfica está alineada con la promesa: *"leer este libro debe sentirse como leer un libro"*. El theming no es un sistema de utilidades genérico que casualmente quedó cálido — es un códice digital donde `--reposo` no se llama `--gray-500`. Esa coherencia editorial es la que justifica un score de Anti-Patterns 4/4 sin matices.

Los gaps de accesibilidad, sin embargo, traicionan precisamente esa promesa. Un libro que se cuida con tanta paciencia tipográfica no puede dejar a un lector con visión reducida sin contraste en el consentimiento RGPD, ni dejar al lector solo-teclado navegando a ciegas sin halo de foco. El problema de `:focus-visible` ausente y `outline: none` explícito en inputs es **ideológicamente** incompatible con un proyecto cuya tesis declarada es *"el libro encuentra su ritmo, vamos juntos"*: vamos juntos solo si todos pueden ver dónde están. Y `--reposo #8a8a8a` no es elegancia minimalista — es la decisión por defecto de muchos sistemas que el libro, por canon propio, debería superar. Subir el gris dos pasos (a `#6d6d6d` ≈ 4.6:1) no mancha el pergamino. Lo hace legible.

---

## 1 · Hallazgos de Impeccable detect (CLI · 29 reglas deterministic)

### 1.1 · Resumen cuantitativo

| Antipattern | HTML compilado | Código fuente (`src/`) | Notas |
|---|---:|---:|---|
| `layout-transition` | 2 | 2 | `transition: width 80ms` en `.book-header::after` reading-progress + `transition: padding-bottom 180ms` en `.lit-link` hover |
| `side-tab` | 2 | 0 | 1 `border-left:2px solid var(--oro)` (Pullquote/Marginalia/BloqueRegistro · canon) + 1 `border-left:1px solid var(--pergamino-2)` (1px no es side-tab AI tell · false positive) |
| `overused-font` | 1 | 0 | `font-family: Inter` (canon del libro como `--sans`) |
| **TOTAL** | **5** | **2** | **7** hits totales (vs 100 del portal · libro es mucho más simple) |

### 1.2 · True issues (arreglar)

| # | Regla | Archivo · Línea | Severidad | Recomendación |
|---|---|---|---|---|
| D1 | `layout-transition` | `src/styles/system.css:41` | **P2** | `.book-header::after { transition: width 80ms linear }` anima `width` en cada scroll event. Migrar a `transform: scaleX()` con `transform-origin: left` + `requestAnimationFrame` en `public/libro-init.js` |
| D2 | `layout-transition` | `src/styles/system.css:417` | **P3** | `.lit-link` hover anima `padding-bottom` para mover el `border-bottom`. Migrar a `transform: translateY()` o `bottom` (positional, no layout) |

### 1.3 · False positives por canon (NO arreglar)

| Regla flaggeada | Archivo | Por qué es canon defendible |
|---|---|---|
| `side-tab` 2px `var(--oro)` | `acto-i.B-TSIT4_.css` (probable Pullquote/Marginalia/BloqueRegistro) | Convención editorial clásica del siglo XIX (Penguin, NYT, Atlantic). En el libro son **marcadores tipográficos canónicos** (cita literaria, blockquote, marginal note) |
| `side-tab` 1px `var(--pergamino-2)` | `acto-i.B-TSIT4_.css` | 1px no es side-tab AI tell (que son ≥2px). Tono cálido en divisor sutil entre secciones |
| `overused-font` Inter | `acto-i.B-TSIT4_.css` | Inter es la `--sans` canónica del libro para UI/metadata. Documentado en `tokens.css:33` |

---

## 2 · Hallazgos de audit LLM (5 dimensiones Impeccable)

### 2.1 · Accesibilidad · Score 2/4

#### True issues

| # | Archivo · línea | Sev | Issue · Impacto · Fix |
|---|---|---|---|
| A1 | `src/styles/system.css:956-960, 1062` | **P0** | **`:focus-visible` ausente + `outline: none` explícito en inputs.** WCAG 2.4.7 fail. Usuarios solo-teclado pierden foco en CTAs (`.lit-link`, `.form-tejedor__submit`, ReaderControls A-/A/A+, ☀/☾, BookHeader nav, BookToc trigger). **Fix:** agregar bloque global `:focus-visible { outline: 2px solid var(--oro); outline-offset: 3px }` antes de las utilidades + restablecer outline en inputs (no `outline: none`) |
| A2 | `src/components/BookHeader.astro` + `src/styles/system.css` (`<main>` sin id ni skip-link) | **P1** | **Sin skip-link** y `<main>` sin `id`/`tabindex`. 5 enlaces de nav + 2 triggers flotantes antes del contenido. **Fix:** agregar `<a href="#main-content" class="skip-link">Saltar al contenido</a>` + `<main id="main-content" tabindex="-1">` |
| A3 | `src/styles/tokens.css:13-16` + `system.css:142, 225-226, 491, 1047, 1111, 99, 259, 420` | **P1** | **Greys fail AA para texto operativo.** `--reposo #8a8a8a` da 2.88:1 sobre pergamino (.eyebrow, .meta, .form-microcopy, .form-tejedor__label, .form-tejedor__nota). `--oro-suave #b68914` da 2.66:1 (`aria-current` activo, hover .lit-link). El consentimiento RGPD en form-microcopy a 12px queda 2.88:1. **Fix:** subir `--reposo` `#8a8a8a → #6d6d6d` (≈4.62:1, pasa AA) + para `aria-current` usar `--tinta` con `border-bottom: 1px solid var(--oro)` en lugar de cambiar color a `--oro-suave` |
| A4 | `src/components/book/ReaderControls.astro:14-22` | **P2** | **ReaderControls sin `aria-pressed` para estado activo** del modo día/noche y tamaños A-/A/A+. Screen reader no anuncia cuál está activo. **Fix:** agregar `aria-pressed={state.size === 'small'}` (dinámico via JS) en cada button |
| A5 | `src/components/book/FormularioTejedor.astro:21` + sin `aria-describedby` linkeando microcopy a inputs | **P2** | Formulario captura sin `aria-describedby` que conecte microcopy/nota a los inputs. Screen reader anuncia el campo pero no la nota explicativa adjunta. **Fix:** `<input ... aria-describedby="nota-privacidad">` + `<p id="nota-privacidad">` |
| A6 | `src/components/book/Flourish.astro` (divisor decorativo) | **P3** | `<div class="flourish ...">` sin `aria-hidden="true"`. Es decorativo puro (renderizado vía CSS `::before/after`). Screen readers podrían anunciarlo. **Fix:** agregar `aria-hidden="true"` o usar `<hr role="presentation">` |

#### False positives canon (NO arreglar)

| Item | Razón |
|---|---|
| `--tinta #1a1a1a` sobre pergamino · 14.51:1 (AAA holgado) y `--tinta-suave #3a3530` · 10.11:1 (AAA) | Paleta dominante de texto del libro es excelente. El issue es uso decorativo de greys, no lectura |
| `--oro` como título (`.monumental`, `.title-1/2`, `.dropcap`) 1.98:1 sobre pergamino | WCAG SC 1.4.6 exempt para texto incidental con duplicación semántica (eyebrow tipográfico arriba) |
| Sin auto dark mode `prefers-color-scheme` | Confirmado canon · ReaderControls override manual Papel↔Tinta es la única vía. Sitio simula códice físico |
| `autocomplete="given-name"` en campo nombre | Semánticamente correcto (no es nombre completo) |
| Honeypot `position: absolute; left: -9999px` con `tabindex="-1" aria-hidden="true"` | Bien implementado |

### 2.2 · Performance · Score 3/4

| # | Archivo · línea | Sev | Issue · Fix |
|---|---|---|---|
| P1 | `src/layouts/Base.astro:72-85` | **P1** | **Font preloads rotos** · `<link rel="preload" href="/fonts/eb-garamond-latin-400-normal.woff2">` apunta a paths inexistentes (fontsource inlinea via CSS y empaqueta a `/_astro/<hash>.woff2`). 404 silencioso en cada page-load. Resultado: EB Garamond carga tarde desde la cadena CSS, FOUC en lectura larga. **Fix:** eliminar los preloads (fontsource ya trae `font-display: swap`) o copiar el woff2 latin a `/public/fonts/` y referenciar esa ruta estable |
| P2 | `public/libro-init.js:13-26` + `src/styles/system.css:34-42` | **P2** | **Scroll handler anima `width` sin rAF + `backdrop-filter` en sticky header.** Cada scroll event escribe `--p` (custom property) que dispara `transition: width 80ms linear` en `.progress-rail::before`. Animar `width` = relayout. Más `backdrop-filter: blur(8px)` en header (compositing cost). En mobile con scroll inertial puede medirse 5-15 ms de bloqueo de frame en LongAnimationFrame. **Fix:** migrar a `transform: scaleX(var(--p))` con `transform-origin: left` + `requestAnimationFrame` throttle |
| P3 | `src/styles/system.css:53-54` (`.book-header backdrop-filter: blur(8px)`) | **P3** | Backdrop blur en mobile sufre más. **Fix opcional:** bajar a `blur(6px)` o quitarlo en `@media (max-width: 720px)` |

#### False positives perf

| Item | Razón |
|---|---|
| `transition: width 80ms` en `.book-header::after` (D1) | Aunque es layout transition real, está aislado en `position: sticky` propio compositing layer. P2 (mejorable, no urgente) |
| `transition: padding-bottom 180ms` en `.lit-link` hover (D2) | Hover-only event en elemento pequeño · radio de impacto mínimo |
| 5 scripts CSP-safe (libro-init/reader/toc/buscar/recibir.js) en `public/` | Tamaño pequeño · cargados con `defer` · óptimo para CSP |

### 2.3 · Theming · Score 3/4

**Estrategia de color identificada:** *Committed* (un acento `--oro` + tinta sobre pergamino dominante)

| # | Archivo · línea | Sev | Issue · Fix |
|---|---|---|---|
| T1 | `src/styles/tokens.css:13-16` | **P1** | `--reposo #8a8a8a` y `--oro-suave #b68914` definidos en tokens pero usados como texto operativo · fail AA (ver A3) |
| T2 | `src/styles/tokens.css` (búsqueda · tokens sin uso) | **P3** | `--oro-fantasma` y `--nocturno` definidos en tokens pero sin uso encontrado en `system.css`. **Fix:** eliminar tokens muertos o documentar uso futuro |
| T3 | `src/components/book/ReaderControls.astro` mentions S/M/L/XL pero `system.css:863-865` solo implementa S/Default/L (3 niveles, no 4) | **Grey** | Discrepancia entre brief (S/M/L/XL = 4 niveles) y implementación (S/Default/L = 3). NO es bug de accesibilidad (WCAG SC 1.4.4 solo exige 200% zoom). **Pregunta a Ricardo:** ¿canon son 3 o 4 escalones? |

#### Issues secundarios theming

- Modo noche en `system.css:850-860` bien aislado (rama `--tinta #e8e3da` sobre `#1a1714` da 13.97:1 AAA)
- Cero hard-coded hex en pages (todo via tokens) ✓
- Reader Controls toggle Papel↔Tinta funciona con `localStorage` aplicado **antes del paint** en `libro-reader.js:15-18` (excelente praxis editorial · evita flash)

### 2.4 · Responsive · Score 3/4

| # | Archivo · línea | Sev | Issue · Fix |
|---|---|---|---|
| R1 | `src/styles/system.css:835-846` (ReaderControls A-/A/A+) | **P1** | **Touch targets ~26×32 px** en botones A-/A/A+. WCAG 2.5.5 pide 44×44. Apple HIG 44pt. Material 48dp. **Anti-irónico**: precisamente el control que sirve a la **lectura mobile** es el peor diseñado para mobile. **Fix:** `@media (max-width: 720px) { .reader-controls__group button { padding: 0.625rem 0.875rem; min-width: 2.75rem; min-height: 2.75rem } }` |
| R2 | `src/styles/system.css` (`.reader-controls` panel) sin media query mobile | **P2** | **Panel ReaderControls sin breakpoint mobile** · en 360 px viewport con `right: 5rem` (80 px) panel queda x=56-280 px (barely fits) y se desborda lateralmente. **Fix:** `@media (max-width: 720px) { .reader-controls { bottom: 4.5rem; right: 1rem; left: 1rem; width: auto } .reader-controls-trigger { bottom: 1rem; right: 4.25rem } }` |
| R3 | `.reader-controls-trigger` (bottom 2rem right 5rem) + `.book-toc-trigger` (mobile bottom 1rem right 1rem) | **P2** | **Posible colisión de 2 triggers flotantes en mobile**. ReaderControls trigger no se reposiciona en mobile, BookToc trigger sí. Cuando ambos están visibles, BookToc trigger queda debajo de ReaderControls trigger en distintas verticales. **Fix:** consolidar el patrón de reposicionamiento mobile |

#### Breakpoints

- **8 media queries** todas en 720px · consistente, pero monolítico
- Una sola breakpoint es decisión legítima para un libro (mobile cómodo VS desktop cómodo · no necesita el zoo de breakpoints de un dashboard)
- Columna `42rem (~72 ch)` cae elegantemente a `100% - 3rem` en mobile gracias a `main { padding: 0 1.5rem }`

### 2.5 · Anti-Patterns · Score 4/4 ✨

**El único componente del proyecto que alcanza 4/4.** Cero AI tells confirmados.

#### Lo que el libro NO tiene (huellas de no-AI)

- ✅ **Cero gradient-text** en heros (vs portal que tiene 4)
- ✅ **Cero hero-metric template** (3 cols dt/dd uppercase + mono · vs portal que lo tiene en home)
- ✅ **Cero glassmorphism overuse**: un solo `backdrop-filter: blur(8px)` en `.book-header` sticky, técnica que usa Apple Books y NYT Magazine en sus headers de lectura. NO es glassmorphism cards/modales
- ✅ **Cero "identical card grid"** · home muestra cards de capítulos pero cada uno tiene tratamiento tipográfico distinto
- ✅ **Cero modal-first thinking**: `BloquePuerta` es **inline editorial** (`<aside>`) al final del contenido leído, NO overlay. Tiene ornamento `◆` + eyebrow + título + cuerpo + form + firma "— El Tejedor / Orion" · antítesis del "Sign up to continue reading" de Medium/Substack
- ✅ **Cero hero gigante SaaS-feel**: home usa columna única con tipografía editorial · NO hay CTA gigante con underglow
- ✅ **Microcopy literario**: "Cruzar el umbral", "Pertenecer al tejido", "El libro encuentra su ritmo, vamos juntos", "Estás en la lista. Espera bien." · cero CTAs SaaS
- ✅ **Formulario `recibir.astro`**: label sans pequeño "NOMBRE/CORREO" + input sin border-radius agresivo + botón "Entrar al tejido" con paleta tinta (no oro saturado) + texto serif · lee como Penguin, no como ConvertKit/Mailchimp
- ✅ **Único `linear-gradient` es FUNCIONAL** (`corte-tejedor` en gating · fade-out de contenido bloqueado para Nivel 0), no decorativo
- ✅ **Voseo: 0 ocurrencias** (issue conocido resuelto · confirmado con `grep \b(empezás|recibís|sabés|podés|tenés|sos|querés|hablás|sentís|escuchás)\b`)

---

## 3 · Hallazgos de Emil Design Eng (animaciones + microinteracciones)

### 3.1 · Tabla Before/After/Why

| Before | After | Why |
| --- | --- | --- |
| `transition: width 80ms linear` (`system.css:41` · `.book-header::after` reading-progress) | `transform: scaleX(var(--p, 0)); transform-origin: left; transition: transform 80ms linear` | Emil: "Only animate transform and opacity". `width` triggea layout; `scaleX` es GPU. Especialmente importante porque se actualiza en cada scroll event |
| `transition: color 180ms ease, border-color 180ms ease, padding-bottom 180ms ease` (`.lit-link:hover` · `system.css:417`) | `transition: color 180ms ease, border-color 180ms ease, transform 180ms ease` + `transform: translateY(...)` en hover en lugar de `padding-bottom` | `padding-bottom` triggea layout (aunque sea hover-only). `transform` es GPU |
| `transition: width 80ms linear` invocado en cada scroll event sin throttle (`public/libro-init.js`) | `requestAnimationFrame` throttle: `var ticking = false; function onScroll(){ if(!ticking){ requestAnimationFrame(update); ticking = true; } }` | Emil + Performance: scroll handlers que escriben layout deben pasar por rAF · evita 5-15 ms de bloqueo de frame en mobile |
| ReaderControls A-/A/A+ buttons sin `transform: scale(0.97)` en `:active` | `.reader-controls__group button { transition: transform 160ms ease-out } button:active { transform: scale(0.97) }` | Emil: "Buttons must feel responsive to press". Scale 0.97 da feedback de "la UI te escuchó". Especialmente importante en mobile donde tap es interacción primaria |
| Botón "Cruzar el umbral →" (BloquePuerta) sin micro-interaction visible | Agregar `.form-tejedor__submit:active { transform: scale(0.97) }` + transición transform 160 ms ease-out | Idem · CTA principal del libro merece feedback de press |
| BloquePuerta sin animation cuando aparece (`<aside>` renderizado server-side) | Considerar `@starting-style` para fade-in suave cuando entra en viewport via IntersectionObserver | Emil: "Elements appearing or disappearing without transition feel broken". El BloquePuerta es revelación ceremonial · merece appear suave |
| Cards de capítulo en home sin `:active` scale | Agregar `.capitulo-card:active { transform: scale(0.98) }` | Emil: tap feedback editorial sutil. `0.98` para evitar feel arcade |

### 3.2 · Notas filosóficas

- **¿Hay animaciones que se ven 100+ veces al día y deberían eliminarse?** No · el libro es navegación de lectura, no UI de productividad. Las animaciones son escasas y editoriales · canon respetado
- **¿Hay animaciones sin propósito claro?** No · todas tienen propósito (progress de lectura, hover de links, transiciones de ReaderControls)
- **¿Las duraciones están en rango UI (<300ms)?** Sí · 80 ms (progress), 180 ms (lit-link hover), todas dentro del rango. Excelente disciplina
- **¿Custom easing curves?** El libro usa principalmente `linear` (progress) y `ease` (hover). El `linear` en progress es correcto (constant motion). El `ease` en hover podría beneficiarse de un `cubic-bezier(0.23, 1, 0.32, 1)` (strong ease-out) para más punch sin cambiar el feel

### 3.3 · Componentes específicos revisados

| Componente | Estado actual | Recomendación | Prioridad |
|---|---|---|---|
| `.book-header::after` (reading-progress) | `transition: width 80ms linear` | Migrar a `transform: scaleX()` + rAF throttle | P2 |
| `.lit-link:hover` (links literarios) | `transition: color, border-color, padding-bottom 180ms` | `padding-bottom → transform: translateY()` | P3 |
| ReaderControls A-/A/A+ + ☀/☾ | Sin `:active` scale + sin `aria-pressed` | Agregar ambos | P2 (A11y) + P3 (Emil) |
| `.form-tejedor__submit` ("Cruzar el umbral") | Sin `:active` scale | Agregar `transform: scale(0.97)` | P2 |
| BloquePuerta `<aside>` (revelación gating) | Sin animation de entrada | Considerar `@starting-style` fade-in + scale(0.98→1) | P3 |
| Cards de capítulo en home | Sin `:active` scale | Agregar `:active { transform: scale(0.98) }` | P3 |
| Toggle Papel ↔ Tinta (ReaderControls) | Aplicado en `libro-reader.js` antes del paint | Excelente (evita flash) · sin cambios | — |
| `prefers-reduced-motion` coverage | NO detectado en `system.css` ni componentes | **Agregar** `@media (prefers-reduced-motion: reduce) { * { transition: none } }` block | P2 |

---

## 4 · False positives consolidados (POR QUÉ son canon)

| Hallazgo | Skill que lo detectó | Por qué es canon defendible |
|---|---|---|
| 2 `side-tab` en CSS de Acto I (`border-left:2px solid var(--oro)` + `border-left:1px solid var(--pergamino-2)`) | Impeccable | Pullquote, Marginalia, BloqueRegistro · convención editorial clásica (Penguin, NYT Magazine, Atlantic) |
| `overused-font` Inter | Impeccable | Inter es la `--sans` canónica del libro para UI/metadata. Documentado en `tokens.css` |
| `--oro #d4a017` (1.98:1) en títulos `.monumental/.title-1/.title-2/.dropcap` | Cualquier audit de contraste | WCAG SC 1.4.6 exempt · texto incidental ornamental con duplicación semántica (eyebrow tipográfico arriba) |
| Sin auto dark mode `prefers-color-scheme` | Audits multi-tema | Canon · ReaderControls Papel↔Tinta es la única vía. Sitio simula códice físico (pergamino no cambia con hora del día) |
| EB Garamond italic en heros y `.invocacion`, `.umbral-line` | Impeccable (italic-serif display hero) | Canon editorial declarado · voz tipográfica del Tejedor |
| `backdrop-filter: blur(8px)` en `.book-header` | Impeccable (glassmorphism overuse) | Un solo uso, header sticky, técnica de Apple Books y NYT Magazine · NO es glassmorphism cards/modales |
| `linear-gradient` en `.corte-tejedor` | Impeccable (gradient overuse) | FUNCIONAL · fade-out de contenido bloqueado para Nivel 0 (gating editorial). NO decorativo |
| Honeypot `position: absolute; left: -9999px` | Audits genéricos | Correctamente combinado con `tabindex="-1" aria-hidden="true"` |

---

## 5 · Priorización recomendada para fixes

### Sprint inmediato (P0 + P1 críticos · próximo PR)

1. **A1 · `:focus-visible` ausente** · agregar bloque global en `system.css` + restablecer outline en inputs (eliminar `outline: none`). El más urgente (P0 · WCAG 2.4.7 fail)
2. **A2 · Skip-link + `<main id="main-content" tabindex="-1">`** en `Base.astro` y `LecturaLarga.astro`
3. **A3 · Subir `--reposo`** `#8a8a8a → #6d6d6d` en `tokens.css` (4.6:1 AA) + cambiar `aria-current` activo en BookHeader de `--oro-suave` a `--tinta` + `border-bottom: 1px solid var(--oro)`
4. **P1 · Eliminar font preloads rotos** en `Base.astro:72-85` (o copiar woff2 a `/public/fonts/` con paths estables)
5. **R1 · Touch targets ReaderControls** `padding: 0.625rem 0.875rem; min-width/min-height: 2.75rem` en mobile

### Sprint corto (próximas 2 semanas · P1-P2 importantes)

6. **A4 · `aria-pressed` en ReaderControls** A-/A/A+ y ☀/☾ (dinámico via libro-reader.js)
7. **A5 · `aria-describedby` en FormularioTejedor** linkeando microcopy/nota a inputs
8. **P2 · Scroll handler con rAF** + migrar `.progress-rail::before` a `transform: scaleX()` en `libro-init.js`
9. **R2 · Panel ReaderControls breakpoint mobile** · `right: 1rem; left: 1rem` para no desbordarse en <360px
10. **R3 · Reposicionamiento de los 2 triggers flotantes** en mobile (evitar colisión ReaderControls vs BookToc)
11. **Emil · `prefers-reduced-motion`** bloque global en `system.css`
12. **Emil · `:active scale(0.97)`** en CTAs principales (form-tejedor__submit, ReaderControls buttons, capitulo cards)

### Backlog (P2-P3 · cuando haya espacio)

13. **D1/D2 · Layout transitions** (`width → scaleX`, `padding-bottom → transform`)
14. **A6 · `aria-hidden="true"`** en Flourish.astro
15. **T2 · Eliminar tokens muertos** (`--oro-fantasma`, `--nocturno` si confirmás que no se usan)
16. **P3 · `backdrop-filter: blur(8px) → blur(6px)`** o quitarlo en mobile <720px
17. **Emil · `cubic-bezier(0.23, 1, 0.32, 1)`** en lugar de `ease` para `.lit-link:hover`

### NO arreglar (canon defendible · ver Sección 4)

`side-tab` blockquotes, Inter overused-font, `--oro` ornamental en títulos, sin auto dark mode, EB Garamond italic en heros, `backdrop-filter` único en header, `linear-gradient` funcional del `corte-tejedor`, etc.

---

## 6 · Items que requieren input de Ricardo

| # | Hallazgo | Pregunta concreta |
|---|---|---|
| 1 | **Reader Controls: S/M/L/XL vs S/Default/L** · brief menciona 4 niveles pero `system.css:863-865` solo implementa 3 (`1.0625rem / 1.1875rem / 1.3125rem`) | ¿El canon son 3 escalones (S/Default/L) o 4 (S/M/L/XL)? Si son 4, falta `XL` en CSS. Si son 3, actualizar el brief/PRODUCT.md |
| 2 | **`--oro-fantasma rgba(212,160,23,0.18)` y `--nocturno #0a0e1a`** definidos en `tokens.css:13-16` pero sin uso encontrado en `system.css` ni componentes | ¿Son tokens muertos a eliminar, o tokens reservados para componentes futuros (ej. modo noche profundo, accent fantasma decorativo)? |

---

## 7 · Confirmación de issues conocidos del addendum

| Issue conocido | Estado | Notas |
|---|---|---|
| **Voseo argentino residual** (`/recibir` "empezás", etc.) | ✅ **0 ocurrencias** · `grep \b(empezás\|recibís\|sabés\|podés\|tenés\|sos\|querés\|hablás\|sentís\|escuchás)\b` retorna vacío | Sweep voseo completado en sesión anterior · sin regresiones |
| **MDX components accessibility** | ⚠️ **1 issue identificado:** `Flourish.astro` (divisor decorativo) sin `aria-hidden="true"` · P3 | Otros componentes MDX revisados (Pullquote, PausaCientifica, VozTejido) tienen estructura semántica OK |
| **Gating Nivel 0/1 visualmente correcto** | ✅ **Sí** · `BloquePuerta.astro` renderiza inline (`<aside>`), NO modal · ornamento + eyebrow + título + cuerpo + form + firma editorial. Cumple el canon "no es overlay, es bloque ceremonial" | Único caveat: sin animation de entrada (P3) |
| **Reader Controls funcional** | ⚠️ **Funciona visualmente** pero falta:<br>- `aria-pressed` para indicar estado activo (A4 · P2)<br>- Touch targets sub-44 px en mobile (R1 · P1)<br>- Panel sin breakpoint mobile (R2 · P2)<br>- localStorage aplicado antes del paint ✅ (excelente praxis editorial) | El toggle Papel↔Tinta funciona perfectamente desde el ángulo lectura. Los issues son a11y + responsive |

---

## 8 · Comparación Portal vs Libro

### Score lado a lado

| Dimensión | Portal | Libro | Diferencia |
|---|---|---|---|
| Accesibilidad | 3 / 4 | **2 / 4** | Libro **peor** · `outline: none` + skip-link ausente + greys fail AA |
| Performance | 3 / 4 | 3 / 4 | Empate · portal sufre con three.js eager-load; libro con font preloads rotos |
| Theming | 3 / 4 | 3 / 4 | Empate · portal con drift V14→Cosmos Vivo; libro con tokens decorativos usados como texto |
| Responsive | 3 / 4 | 3 / 4 | Empate · portal con wordmark oculto mobile; libro con touch targets ReaderControls |
| Anti-Patterns | 3 / 4 | **4 / 4** ✨ | Libro **mejor** · cero AI tells confirmados. Portal tiene 4 gradient-text + 1 hero-metric |
| **Total** | **15 / 20** | **15 / 20** | **Empate técnico · perfiles distintos** |

### Issues compartidos (afectan ambos sitios)

- Touch targets sub-44 px en controles compactos
- Lack of `:active scale(0.97)` en CTAs principales
- Falta `prefers-reduced-motion` global block (portal lo tiene en 38 sitios, libro no lo tiene)
- `transition: width` en reading-progress (ambos lo hacen)

### Portal-only

- 4 gradient-text en heros de guías de simulador (AI tell · solo portal)
- three.js eager-loaded en `/simuladores/orbitales` (libro no usa three.js)
- 184 ocurrencias drift de ink V14 (libro no tuvo esa migración)
- Wordmark oculto mobile <480px
- Hero-metric template parcial en home (sim-row-cv__metrics)

### Libro-only

- `:focus-visible` ausente + `outline: none` explícito (P0 · más urgente del proyecto)
- Skip-link ausente + `<main>` sin id
- Font preloads rotos en `Base.astro`
- Touch targets ReaderControls A-/A/A+ (~26×32 px)
- Greys `--reposo` y `--oro-suave` como texto operativo
- ReaderControls sin `aria-pressed`
- Panel ReaderControls sin breakpoint mobile
- 2 triggers flotantes que pueden colisionar en mobile

### Recomendación operativa para Ricardo

**Prioridad consolidada** para próxima sesión de fixes (orden de impacto):

1. **🔴 P0 LIBRO** · `:focus-visible` global + restablecer outline en inputs (un solo bloque CSS · 5 min)
2. **🔴 P1 PORTAL** · contraste texto secundario (subir alpha 0.42→0.55 en 5 lugares)
3. **🔴 P1 LIBRO** · greys `--reposo` y `--oro-suave` (subir 2 pasos hex)
4. **🔴 P1 LIBRO** · skip-link + `<main id>` (1 archivo Layout)
5. **🔴 P1 PORTAL** · three.js eager-load → dynamic import
6. **🔴 P1 LIBRO** · font preloads rotos → eliminar
7. **🟠 P1 PORTAL** · wordmark oculto mobile
8. **🟠 P1 PORTAL** · drift ink V14 (sweep find-replace · 1 PR grande pero mecánico)
9. **🟠 P1 LIBRO** · touch targets ReaderControls + panel mobile
10. **🟠 P2 PORTAL** · gradient-text en 4 heros de guías (único AI tell del proyecto)

Items compartidos pueden hacerse en **un solo commit cross-repo** (ej. `:active scale(0.97)` + `prefers-reduced-motion` global).

---

## 9 · Apéndice · skills instalados

### Emil Design Eng

- **Ubicación:** `.claude/skills/emil-design-eng/SKILL.md` (26.69 KB · copiado del repo del portal)
- **Áreas cubiertas:** Animation Decision Framework, easing curves, duraciones UI, springs, component principles, CSS transforms, gesture/drag, performance, accessibility, Sonner principles, stagger animations

### Impeccable v3.1

- **Ubicación skill:** `.agents/skills/impeccable/` (universal · symlink junction desde `.claude/skills/impeccable/`)
- **CLI:** `impeccable` v2.1.9 (instalado globalmente desde audit del portal)
- **Configuración:** `PRODUCT.md` creado con identidad canónica del libro (paleta Pergamino + Reader Controls + decisiones canónicas que NO son anti-patterns). `DESIGN.md` NO creado (opcional)

---

## 10 · Estado del libro · veredicto honesto

El sitio del libro es **el componente más disciplinado del proyecto en identidad visual**. Es el único en alcanzar 4/4 en Anti-Patterns: cero AI tells confirmados, microcopy editorial cuidado ("Cruzar el umbral", "El libro encuentra su ritmo, vamos juntos"), formulario que lee como Penguin no como ConvertKit, gating ceremonial inline en lugar de modal SaaS, paleta pergamino comprometida (no es un sistema genérico que casualmente quedó cálido), tipografía EB Garamond corriendo en cuerpo y título, columna 65ch line-height 1.7 disciplina editorial premium. La praxis de aplicar `localStorage` del modo Papel/Tinta **antes del primer paint** (`libro-reader.js:15-18`) es un detalle de cuidado editorial que la mayoría de sitios de productividad no tienen.

Las áreas ejemplares: **Anti-Patterns 4/4 (único 4/4 del proyecto)**; **tokens canónicos limpios** (cero hard-coded hex en pages); **scripts CSP-safe externos** en `public/` cargados con `defer`; **Reader Controls custom** (S/Default/L + Papel/Tinta) que respeta autonomía del lector; **gating BloquePuerta inline** que no rompe la inmersión; **paleta de texto principal** (`--tinta` 14.51:1 + `--tinta-suave` 10.11:1) en AAA holgado; **modo noche manual** bien construido (`--tinta #e8e3da` sobre `#1a1714` da 13.97:1).

Las áreas que necesitan trabajo: **A11y baja a 2/4** (el menor del proyecto · por `outline: none` explícito en inputs + ausencia de skip-link + greys decorativos usados como texto operativo · todos arreglables sin tocar canon estético); **Performance** sufre dos detalles cuantitativos (font preloads rotos + scroll handler sin rAF · ambos fix de 5-15 min); **Responsive** olvida que precisamente los controles que distinguen al sitio (S/Default/L y Papel/Tinta) son los peor diseñados para mobile (touch targets sub-44 px).

**Cómo se compara con producto editorial de excelencia en 2026:** este sitio lee como **una edición de Penguin Modern Classics digital**. No es un blog de Medium queriendo parecer literario, no es un newsletter de Substack disfrazado de revista, no es un dashboard editorial. Es un libro digital que respeta su naturaleza editorial premium en cada decisión visible. Lo que falta no es identidad — es accesibilidad operativa. Una edición de bolsillo perfecta no puede olvidarse del marcapáginas; aquí el marcapáginas son los Reader Controls + el focus visible + el skip-link. Tres parches y el libro pasa de 15/20 a 18/20 sin traicionar una sola decisión canónica.

Los 13 true issues son fixables en una sesión de 2-3 horas. Ninguno toca la identidad. El libro está al **75-85% de excelencia editorial-técnica** · los siguientes 15-20% son accesibilidad operativa, no rediseño.

Audit completo. Reporte en `docs/audits/AUDIT-2026-05-17-libro-emil+impeccable.md` · pendiente revisión humana antes de generar PR de fixes.
