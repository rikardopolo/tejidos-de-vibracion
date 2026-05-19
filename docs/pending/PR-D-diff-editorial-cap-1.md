# PR-D · Diff editorial Cap. 1 · pendiente

Diferido del sprint Cap. 1 segmentado: PR-A scaffolding (#11 merged) · PR-B piezas 00-04 + figuras 1.1-1.5 (#12 merged 2026-05-19) · PR-C piezas 05-08 + figuras 1.6-1.9 + archivado del monolítico (pendiente merge).
Paralelo arquitectónico al `PR-B-diff-editorial-obertura.md`.

## Contexto

El MDX monolítico anterior `src/content/book/cap-1-universo-sinfonia.mdx` (186K, 1 sola página) tenía diferencias significativas frente al manuscrito v2 (`Cap1_TDV_VolumenI_Modo_B3_consolidado_v2_1_09-05-2026.docx`).

En PR-B se introdujo el contenido del **manuscrito v2** (fuente canónica), no el del MDX monolítico. Esto introdujo nuevos contenidos en producción.

## Hallazgos editoriales · documentados durante PR-B

### 🟢 Hallazgo 1 · AnclajeExperiencial "El Silencio que Vibra"

| | Estado |
|---|---|
| MDX monolítico anterior | ❌ No existe (empezaba directo con `## Umbral poético`) |
| Manuscrito v2 | ✅ Existe como portada del Cap. 1 (L7–23 del .docx) |
| Decisión en PR-B | ✅ Introducido desde manuscrito (texto literal) en `00-portada.mdx` |
| Justificación | El manuscrito v2 es la fuente canónica · MDX monolítico estaba desactualizado |

### 🟡 Hallazgo 2 · Casing del Umbral Poético

| | Versión |
|---|---|
| MDX monolítico | `## Umbral poético` (lowercase "p") |
| Manuscrito v2 | `**Umbral Poético**` (uppercase "P") |
| Decisión en PR-B | Manuscrito v2 (uppercase) |

### 🟡 Hallazgo 3 · Componentes usados

| | Componentes |
|---|---|
| MDX monolítico | Flourish (`kind="diamond"`), Pullquote, Invocacion, PausaReflexiva, PausaCientifica, VozTejido, LitLink, CorteTejedor |
| MDX nuevo (piezas PR-B) | AnclajeExperiencial, PausaReflexiva, PausaCientifica, VozTejido, VentanaCuantica, LaboratorioInterior, Checkpoint, FiguraEditorial, Diamond |

Diferencias notables:
- MDX monolítico usaba `<Flourish kind="diamond" />` — reemplazado por `<Diamond />` específico
- MDX monolítico NO usaba VentanaCuantica, LaboratorioInterior, Checkpoint, FiguraEditorial, AnclajeExperiencial (no existían cuando se escribió)
- MDX monolítico usaba Invocacion y Pullquote — no usados en las piezas nuevas

### 🟡 Hallazgo 4 · Probable diff de prosa

No se realizó un diff exhaustivo word-by-word entre cap-1-universo-sinfonia.mdx monolítico y las 9 piezas del manuscrito v2. Es posible que haya:
- Párrafos agregados/modificados en v2
- Reordenamiento de subsecciones
- Cambios de puntuación/casing menores
- Adiciones de referencias bibliográficas

**Spot-check sugerido en PR-D**: comparar línea por línea las primeras 2-3 secciones, identificar patrón de diferencias, decidir si aplicar al MDX monolítico o si se considera reemplazado por las piezas segmentadas.

### 🟢 Hallazgo 5 · Figura 1.5 ubicación

| | Ubicación |
|---|---|
| Manuscrito v2 | Cierre de §1.2 (transición visual antes de header §1.3) |
| Spec Ricardo (PR-B) | Apertura de `04-tradiciones-olvidadas.mdx` |
| Decisión en PR-B | Spec Ricardo (la figura pertenece editorialmente a §1.3) |

## Cleanup ejecutado en PR-C ✅

Tras el merge de PR-B y PR-C (las 9 piezas pobladas), el MDX monolítico quedó como contenido fantasma (`hasSections === true` lo desplaza al fallback monolítico que no se ejecuta).

**Decisión ejecutada en PR-C:** archivar el MDX monolítico in-place (sin renombrar ni mover).

Implementación:
- `src/content/config.ts` · book collection schema · añadido campo `archived: z.boolean().default(false)`
- `src/content/book/cap-1-universo-sinfonia.mdx` · añadido `archived: true` al frontmatter + comentario JSX/MDX auto-documentado al inicio
- Conserva `status: "fragmento-permanente"` intacto para preservar el gating heredado por las piezas
- Conserva todo el cuerpo del MDX monolítico como referencia editorial hasta que este PR-D ejecute el diff word-by-word

Por qué archivar in-place y no mover/eliminar:
- `chapterEntry = await getEntry('book', chapter)` sigue resolviendo (mantiene el routing intacto)
- El `status` del padre sigue siendo la fuente única para el gating heredado de las piezas (fix PR-A `0c323a2`)
- Sirve como referencia editorial hasta que PR-D consolide el diff
- Apertura de Cap. 1 en junio 2026 sigue siendo cambio de una línea (`status: "fragmento-permanente"` → `status: "published"`)

## Hallazgos consolidados PR-B + PR-C

Resumen de decisiones editoriales adoptadas durante la segmentación (manuscrito v2 como fuente canónica):

| # | Hallazgo | Origen detectado | Decisión | Sprint |
|---|---|---|---|---|
| 1 | AnclajeExperiencial "El Silencio que Vibra" no existía en MDX monolítico · sí existe en manuscrito v2 L7-23 | PR-B FASE 0 | Introducir como portada `00-portada.mdx` | PR-B |
| 2 | Casing Umbral Poético · manuscrito uppercase 'P' vs monolítico lowercase 'p' | PR-B FASE 0 | Adoptar uppercase del manuscrito | PR-B |
| 3 | Figura 1.5 al cierre §1.2 (manuscrito) vs apertura §1.3 (Ricardo) | PR-B FASE 0 | Apertura de `04-tradiciones-olvidadas.mdx` + párrafo puente | PR-B |
| 4 | Componentes nuevos no usados en monolítico: VentanaCuantica, LaboratorioInterior, Checkpoint, FiguraEditorial, AnclajeExperiencial, CierreVibracional | PR-A → PR-B/C | Catálogo PR-A aplicado a las 9 piezas | PR-A · PR-B · PR-C |
| 5 | VozTejido del libro acepta solo `titulo` y `duracion` · datos biográficos van en cuerpo como primera línea italics | PR-B FASE 2 (Pitágoras) | Patrón estandarizado en 5 VozTejido del Cap. 1 (Pitágoras, Heisenberg, Verdi, Villard, Guido d'Arezzo) | PR-B · PR-C |
| 6 | Figura 1.7 al cierre de §1.5 como síntesis visual (catedrales) | PR-C FASE 0 | Tras Checkpoint, antes del Diamond final | PR-C |
| 7 | §1.6 sin Pausa Científica / Laboratorio / Checkpoint propios · análisis epistemológico denso integrado en sub-secciones por frecuencia | PR-C FASE 0 | Respetar estructura del manuscrito · sin componentes inventados | PR-C |
| 8 | Pieza 08-mantra-cierre · `kind: "cierre"` · sin `num` numerada | PR-C FASE 0 | Schema permite kind cierre sin num | PR-C |
| 9 | Advertencia de Seguridad del Ejercicio Formal MA-NI-PAD-ME representada con headings + blockquotes (no componente dedicado) | PR-C FASE 2 | Respeta jerarquía visual sin inventar componente nuevo | PR-C |
| 10 | Mapa Conceptual ASCII del manuscrito sustituido por Figura 1.9 vectorial | PR-C FASE 2 | Solo Figura 1.9 en MDX · ASCII solo válido en borradores | PR-C |

## Procedimiento sugerido para PR-D

1. Diff word-by-word manuscrito v2 vs las 9 piezas mergeadas (PR-B + PR-C).
2. Clasificar cada diferencia: Crítico / Menor / Cosmético / Estructural.
3. Reportar tabla a Ricardo.
4. Aplicar solo categorías aprobadas.
5. Validar que el archivado in-place del monolítico no introduce drift adicional.
6. Sprint estimado: 8-12h.

## Manuscrito fuente

`E:\dev\tdv-workspace-editorial\02-Libro\capitulos-borradores\Capitulo 1\Cap1_TDV_VolumenI_Modo_B3_consolidado_v2_1_09-05-2026.docx`
