# BookReader refactor · baselines de paridad (PRE-refactor)

Capturado en `refactor/bookreader-base` antes de tocar código, dev server
`libro-dev` :4322, viewport **1280×800**, day/default. Fuente de verdad para
verificar paridad antes/después. Valores = `getComputedStyle`.

> Nota de viewport: la Obertura escala la fuente por media-query (m→19px a ≤640px,
> 21px a >640px). Medir SIEMPRE a 1280 para el baseline desktop.

## Obertura · `/obertura/02-meta-observador` (3 cajas + tipografía rica)

| Elemento | Propiedad | Valor |
|---|---|---|
| body | font-size / line-height | **21px** / 34.02px |
| body | font-family | EB Garamond … serif |
| body | bg / color | #F2EAD5 / #1A1A1A |
| .obertura-main | max-width / font / pad | **544px (34rem)** / 21px / 64px top·24px left |
| h2.chapter | size / color / weight / ls / mt | 38.4px / #1A1A1A / 500 / -0.192px / 80px |
| h2.chapter .num | size / color | 11.52px / #B68914 (oro) Inter |
| h3.sub | size / style / border-top | 29.82px italic / 1px rgba(26,22,18,.08) |
| h3.sub::before | content / color | "◆" / #B68914 sobre #F2EAD5 |
| h4.sub-sub | size / color / style | 22.26px / #B68914 / italic 600 |
| **.voz-tejido** | border-left | **2px #B68914** · pad-left 28px · bg transp · mt 40px |
| .voz-tejido__kind | color | **#1D9E75 (verde)** · DM Sans 11px · ls 2.42px |
| .voz-tejido__title | size/style/color | 22px italic #1A1A1A |
| **.pausa-cientifica** | border-left | **2px #B68914** · pad-left 28px · transp |
| .pausa-cientifica__kind | color | **#1F2547 (indigo Obertura)** · 11px |
| .pausa-cientifica__title | size/style | 22px italic |
| **.pausa-reflexiva** | bg / border / pad / margin | **bg rgba(182,137,20,.08)** · 2px #B68914 · pt 32px·pl 28.8px · mt 48px·ml -8px |
| .pausa-reflexiva .label | color | #B68914 · Inter 11.2px · ls 3.584px |
| .pausa-reflexiva .label::before | DISCO | radial-gradient relleno · 14×14 · radius 50% |
| .pausa-reflexiva .title | size/weight | 20.8px / 600 (no italic) |
| .thread-strip | width | **4px** · gradiente oro(182,137,20) |
| .reading-progress | height/bg | 2px / #B68914 |
| .obertura-toc-toggle | bg/border/color | rgba(241,233,216,.92) / rgba(26,22,18,.18) / #1A1A1A · Inter 11.52px |

## Capítulo · `/capitulo/cap-1-universo-sinfonia/02-aum-primordial`

| Elemento | Propiedad | Valor |
|---|---|---|
| html | data-reader | size=default · mode=day |
| body | font-size / lh | **19px** / 32.3px |
| body | font-family | EB Garamond, Garamond, Georgia, serif |
| body | bg / color | #F2EAD5 / #1A1A1A |
| .measure | max-width | **672px (42rem)** |
| .prose | font / lh / color | 19px / 32.3px / #1A1A1A |
| .title-1 | size/color/weight | 48px / #D4A017 / 600 |
| .measure h2 | size/style/transform | 24px italic #D4A017 / **none** (override cap) |
| **.marginalia** | border-left | **2px #D4A017 (oro)** · pad-left 28px · transp · mt 40px |
| .marginalia__kind | color | #B68914 (oro-suave) · DM Sans 11px · ls 2.42px |
| .marginalia--voz __kind | color | **#1D9E75 (verde)** |
| .marginalia--cientifica __kind | color | **#2D1B69 (indigo libro)** |
| .marginalia__title | size/style/color | 22px italic #1A1A1A |
| .cap-chrome | position / grid | sticky · 1fr auto 1fr |
| .cap-thread | width | **3px** · gradiente oro(182,137,20) |
| .cap-progress | height/bg | 2px / #B68914 |
| .cap-chrome__btn | bg/border/color | rgba(242,234,213,.6) / rgba(212,160,23,.18) / #1A1A1A · DM Sans 11.2px ls 2.464px |
| .flourish | color/size/ls | #D4A017 / 20px / 12px |

## Deltas de consolidación de cajas (Obertura → Marginalia del libro)

| Propiedad | Obertura | Libro (Marginalia) | Plan |
|---|---|---|---|
| border-left | #B68914 | #D4A017 | **preservar #B68914 vía override scoped `.obertura-piece .marginalia`** |
| voz eyebrow | #1D9E75 | #1D9E75 | ✓ igual |
| cien eyebrow | #1F2547 | #2D1B69 | **preservar #1F2547 vía override scoped** |
| título / kind size | 22px / 11px | 22px / 11px | ✓ igual |
| eyebrow texto | "Voz del Tejido" / "Pausa Científica" | "Voz del tejido" / "Pausa científica" | **añadir prop `label?` a Marginalia → pasar texto exacto** |
| PausaReflexiva | bg tintado + disco + 20.8px/600 | sobrio (sin bg/disco, 22px italic) | **cambio ACEPTADO** |

## Otras desviaciones aceptadas
- thread-strip Obertura 4px → 3px (chrome unificado al del Capítulo).
- Header Obertura → barra 3 slots · panel lectura → patrón libro · reset prefs lectura.

## Pendiente de baselinar (capturar en verificación): night/dark de ambas páginas,
## índices /obertura y /capitulo/<cap>, móvil 375.
