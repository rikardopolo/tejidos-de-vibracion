# Geometría de página · Guía de Maquetación V2.1 → CSS `@page`

Traducción de la especificación DXA (Word) de la Guía V2.1 a CSS Paged Media.
La Guía es la fuente; esto es su forma CSS.

## Página y caja de texto

| Concepto | Guía V2.1 (DXA/pulgadas) | CSS de impresión |
|---|---|---|
| Tamaño | US Letter · 8.5 × 11 in | `@page { size: 8.5in 11in; }` |
| Márgenes | 1 in en los cuatro lados | `margin: 1in;` |
| Área de contenido | 6.5 × 9 in | resultado de los márgenes |
| Interlineado cuerpo | 1.33 (Word) | `line-height: 1.35;` (papel, NO el 1.7 de pantalla) |
| Cuerpo | EB Garamond 11 pt | `font: 11pt/1.35 var(--serif);` |

> **Decisión de impresión:** la pantalla usa `--fs-body: 1.1875rem` (19px) y
> `--lh-body: 1.7`. Eso es para lectura en monitor. En papel el cuerpo es **11 pt**
> y el interlineado **~1.35**. `print.css` sobrescribe estos dos valores; el resto
> de la escala se deriva proporcionalmente de los tokens.

## Cornisas (running headers) y folio

- **Cornisa:** `TEJIDOS DE VIBRACIÓN · VOL. I · [SECCIÓN]`, DM Sans Regular 9 pt,
  tracking letra-por-letra, color `#6B7280`, centrada.
- **Folio (pie):** solo el número de página, DM Sans 10 pt, color `#555555`, centrado.
- En CSS Paged Media se implementan con `@page { @top-center { content: ... } }` y
  `@bottom-center { content: counter(page); }`, alimentando la sección desde
  `string-set` en el encabezado de cada pieza.

### ⚠️ Hueco de fuente · DM Sans

`tokens.css` solo declara `--serif` (EB Garamond) y `--sans` (Inter). **DM Sans no
está cargada** en el sitio. La Guía V2.1 la exige para cornisas y folio. Dos opciones,
a decidir con el autor (no asumir):

1. **Añadir** `@fontsource/dm-sans` al proyecto y un token `--cornisa: 'DM Sans', ...`.
   Mantiene fidelidad total a la Guía.
2. **Sustituir** cornisas/folio por Inter (la `--sans` que ya existe). Menos fiel,
   cero peso nuevo. Si se elige esto, anotarlo como desviación consciente en `CANON.md`.

Hasta que se decida, `print.css` usa `var(--cornisa, var(--sans))` como *fallback*.

## Colores (desde tokens.css)

- Títulos Inter Bold con `--indigo (#2D1B69)`, `--nocturno (#0A0E1A)`,
  `--verde (#1D9E75)`, `--tinta (#1A1A1A)`.
- Separadores y ornamentos en `--oro (#D4A017)`.
- **Prohibidos** (azules de Office): `#2E74B5`, `#1F4D78`, `#5B9BD5`. Nunca aparecen.

## Portada de sección (Guía §9)

Cada sección mayor (Obertura, cada capítulo, Anexos) abre con portada dedicada:

| Elemento | Tamaño | Color | Posición |
|---|---|---|---|
| TEJIDOS DE VIBRACIÓN | 36 pt Inter Bold | `#0A0E1A` | ~2.5in desde el margen sup. |
| — ◇ — | 12 pt EB Garamond | `#D4A017` | bajo el título |
| Volumen I | 14 pt EB Garamond Italic | `#2D1B69` | centrado |
| OBERTURA / CAPÍTULO X | 28 pt Inter Bold versalitas | `#D4A017` | centrado |
| Subtítulo poético | 14 pt EB Garamond Italic | `#2D1B69` | centrado |
| Autor | 12 pt EB Garamond | `#1A1A1A` | ~7in desde arriba |
| Fecha | 10 pt EB Garamond Italic | `#555555` | bajo el autor |

La portada usa una `@page` nombrada sin cornisa ni folio (`@page portada { ... }`),
aplicada vía `page: portada` a la pieza `00-portada` / `00-frontispicio`.

## Quiebres

- Cada pieza-portada y cada capítulo empieza en página nueva: `break-before: page;`.
- Recuadros, figuras y fórmulas: `break-inside: avoid;`.
- Títulos no quedan al pie: `break-after: avoid;` en H2/H3; control de viudas/huérfanas
  `widows: 2; orphans: 2;` en `.prose > p`.
