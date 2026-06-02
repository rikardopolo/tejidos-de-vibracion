---
name: imprenta
description: >-
  Maqueta el libro Tejidos de Vibración para impresión y genera el PDF de imprenta
  a partir del contenido MDX del repo. Úsalo SIEMPRE que se hable de maquetar,
  maquetación, PDF de imprenta, libro impreso, "sacar el PDF", exportar a papel,
  print.css, Paged Media, Vivliostyle/Paged.js, la Guía de Maquetación V2.1, o de
  convertir las piezas MDX (Obertura y capítulos) en un documento imprimible.
  NO es para diseño de pantalla/web (eso es `impeccable`): este skill produce el
  artefacto de papel reutilizando tokens.css y los componentes que ya existen.
license: Uso interno · proyecto Tejidos de Vibración (Ricardo Polo · Orion)
---

# Imprenta · maquetación de impresión de Tejidos de Vibración

Convierte el contenido MDX del libro (colecciones `obertura` y `chapter-sections`)
en un **PDF listo para imprenta**, reutilizando el sistema de diseño que ya vive en
el repo. No reinventa nada: añade una sola capa de impresión sobre lo existente.

## Antes de tocar nada (carga de contexto · obligatoria)

Estas son las fuentes de verdad del proyecto. Léelas en este orden cuando arranques
una sesión de maquetación, y respeta su jerarquía:

1. **`src/styles/tokens.css`** — fuente única de paleta, tipografía y espaciado.
   Ningún valor de color/tamaño en `print.css` se escribe a mano: se deriva de estas
   variables. Si un componente no tiene token, se crea el token, no se hardcodea.
2. **`docs/CANON.md`** — árbitro de diseño, microcopy y voz. Si algo en este skill
   contradice a `CANON.md`, gana `CANON.md` (y se actualiza este skill, no se ignora).
   Ojo a la sub-paleta encapsulada de la Obertura (`OberturaLayout.astro`): es
   intencional, no es deriva.
3. **Guía de Maquetación TDV V2.1** (documento del autor, en DXA) — fuente única de la
   **geometría de página** (tamaño, márgenes, cornisas, folio, portadas de sección) y
   del **checklist de entrega**. Su traducción a CSS `@page` está en
   `reference/geometria-pagina.md`.
4. **Manual de Estilo TDV V5.2** — gobierna lo editorial. Su vocabulario interno
   **nunca** aparece en el PDF (ver "Regla de entrega" abajo).

## Regla de entrega (no negociable)

El PDF final es para el lector. Por tanto, en el documento entregable:

- **Cero** menciones del Manual de Estilo (cualquier versión).
- **Cero** etiquetas internas: nada de "Nivel 1/2/3/4", "Carril A/B", nombres de
  agentes, ni andamiaje epistémico explícito.
- **Cero** checklists, reportes de verificación o meta-comentario editorial.

El rigor se queda; el rigor vive en las decisiones de contenido, no en el vocabulario.
Los niveles de evidencia, por ejemplo, se comunican con el lenguaje cuidadoso del texto
(«en física se describe como…», «esto sugiere, no demuestra…»), no con una etiqueta.

## Pipeline

```
contenido MDX  →  HTML de impresión  →  paginado (Vivliostyle)  →  preflight  →  PDF
(collections)     (Astro + print.css)    (CSS Paged Media)         (QA gate)
```

1. **Enumerar** las piezas por `order` dentro de cada colección, filtrando por
   `status` (solo `published`/`fragmento-permanente` según el alcance pedido).
   Obertura → colección `obertura`; capítulos → `chapter-sections/<slug>/`.
   `scripts/build-print-html.mjs` arma el orden canónico.
2. **Renderizar** cada pieza con sus componentes Astro reales (`Marginalia` y sus
   variantes, `Formula`, `FiguraTDV`, `Diamond`, etc.) cargando `templates/print.css`,
   que: (a) suprime el cromo de pantalla de `BookReader`/`OberturaLayout`; (b) aplica la
   geometría `@page`; (c) estiliza `.prose`, `.measure` y `.marginalia` en unidades de
   papel; (d) marca los recuadros como inquebrables.
3. **Paginar** con Vivliostyle CLI (`scripts/render-pdf.mjs`). Maneja cornisas, folio
   y notas como *running elements* / cajas de margen `@page`.
4. **Preflight**: corre la verificación de `reference/preflight.md`. Si algo falla, el
   documento está en borrador, no en entrega.
5. **Entregar** el PDF y, si aplica, enlazarlo en el frontmatter (`pdfUrl`).

## Qué leer según la tarea

- Geometría de página, cornisas, folio, portadas de sección, conversión rem→pt y el
  hueco de DM Sans → `reference/geometria-pagina.md`.
- Los nueve recuadros, sus reglas de quiebre y las variantes libro vs. Obertura →
  `reference/recuadros.md`.
- Figuras (`FiguraTDV`), fórmulas (`Formula`), numeración y notas al pie →
  `reference/figuras-formulas.md`.
- Verificación previa a la entrega (incluye la Regla de entrega) → `reference/preflight.md`.

## Relación con los otros skills

- `impeccable` diseña interfaces de **pantalla**; no toca papel. Este skill es su
  contraparte de impresión y comparte los mismos tokens y el mismo `CANON.md`.
- Estructura del contenido (las colecciones MDX) ya está resuelta por el repo: este
  skill **consume** esa estructura, no la crea.

## Principios de calidad

- Una sola fuente de contenido: el MDX. El PDF es una salida, nunca un máster paralelo.
- Fuentes y color son canónicos: EB Garamond cuerpo, Inter títulos, DM Sans cornisas/
  folio. Prohibidos los azules de Office (`#2E74B5`, `#1F4D78`, `#5B9BD5`).
- Los recuadros no se parten entre páginas. Los separadores no quedan huérfanos al pie.
- El interlineado y el cuerpo de **impresión** son más ceñidos que los de pantalla
  (ver `geometria-pagina.md`): la web respira a 1.7; el papel, a ~1.35.
- Valida visualmente una pieza antes de escalar a un capítulo entero.

## Decisiones de impresión (cerradas con el autor · 2026-06-02)

Las tres «decisiones abiertas» del brief de implementación, resueltas:

1. **DM Sans (cornisas/folio).** DM Sans **ya está cargada** (`fonts.css`) y tokenizada
   (`--cornisa` en `tokens.css`) en el repo; la premisa del brief («no está cargada»)
   estaba desactualizada. Decisión: **mantener DM Sans** vía `--cornisa` (fidelidad
   a la Guía, sin peso nuevo). No se añadió `@fontsource/dm-sans` porque ya era dependencia.
2. **Notas al pie.** Decisión: **endnotes por sección** (estado actual del autorado:
   marcadores `<sup>N</sup>` + bloque «Notas y referencias» al cierre de cada pieza).
   No se activó `float: footnote`. El gancho en `print.css` queda documentado por si se
   revisa más adelante.
3. **Cuerpo / interlineado.** **11 pt / 1.35** (Guía V2.1), fijado en `print.css`.
   Pendiente: **validación con prueba impresa física** (no solo monitor) antes de
   congelar el valor.

Decisión de diseño adicional (divergencia consciente respecto a pantalla, confirmada):
- **Borde de los recuadros**: en impresión el acento izquierdo va **en el color del tipo**
  (índigo para Pausa Científica / Ventana Cuántica · verde para Voz del Tejido · oro para
  el resto), per `reference/recuadros.md`. En pantalla el borde es siempre oro y solo
  cambia el eyebrow; en papel se diferencia para mejor lectura.

## Nota de implementación (repo `tejidos-de-vibracion`)

- `print.css` instalado en `src/styles/print.css` (versión de producción autorada contra
  el DOM real; `templates/print.css` se conserva como plantilla del skill).
- Layout mínimo: `src/layouts/PrintLayout.astro` (carga `global.css` + `print.css`, sin cromo).
- Ruta: `src/pages/print/[...slug].astro` (pieza / capítulo / Obertura / volumen).
- `render-pdf.mjs` parchado para portabilidad Windows: invoca el bin local de Vivliostyle
  con `node` (evita `spawn npx ENOENT`) y usa un Chromium del sistema vía
  `--executable-browser` (o `IMPRENTA_BROWSER`) para no depender de la descarga propia.
- Render de prueba validado: `/print/cap-2-ciencia-escuchar/03-galileo` → `out/galileo.pdf`
  (cornisa, folio, recuadros, separadores y caja 6.5×9 correctos).

### Seguridad de la ruta /print

`/print` renderiza el contenido **completo sin gating** (es para generar el PDF). Por eso
la ruta es SSR con guardia: solo responde en **desarrollo** o cuando `IMPRENTA_PRINT=1`;
en el deploy de producción (Vercel) responde **404**. Nunca se prerenderiza /print en el
build normal — eso publicaría el libro entero saltándose el muro del tejedor.

### Render estático de imprenta (flip LOCAL · para PDFs grandes/reproducibles)

Astro exige que `export const prerender` sea un literal, así que no se puede condicionar
por env. Para un PDF reproducible (p. ej. Acto I / volumen completo, ~300 pp) sin depender
del dev server (que puede caerse en el compile en frío bajo la carga de Vivliostyle), se
hace un flip **local y transitorio** que NO se commitea:

1. En `src/pages/print/[...slug].astro`: cambia `export const prerender = false` → `true`
   y añade un `getStaticPaths()` que enumere los alcances a paginar
   (`volumen-i`, `obertura`, `cap-1…`, `cap-2…`, `cap-3…`).
2. `IMPRENTA_PRINT=1 pnpm build` (la guardia pasa con ese flag; emite estáticos a
   `.vercel/output/static/print/…` con el CSS ya empacado, sin URLs de dev).
3. Sirve esa carpeta: `npx serve .vercel/output/static -l 4399`.
4. `node .claude/skills/imprenta/scripts/render-pdf.mjs http://localhost:4399/print/volumen-i out/volumen-i.pdf`.
5. **Revierte el flip:** `git checkout -- "src/pages/print/[...slug].astro"`.
