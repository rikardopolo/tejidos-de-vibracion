# PR-D · Diff editorial Cap. 1 · pendiente

Diferido del sprint Cap. 1 segmentado (PR-A scaffolding · PR-B piezas 00-04 · PR-C piezas 05-08).
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

## Cleanup pendiente para PR-C

Tras el merge de PR-B y PR-C (las 9 piezas pobladas), el MDX monolítico queda como contenido fantasma (`hasSections === true` lo desplaza al fallback monolítico que no se ejecuta).

**Decisión:** archivar el MDX monolítico en PR-C.

Opciones de archivado:
- Renombrar `src/content/book/cap-1-universo-sinfonia.mdx` → `.archived.mdx`
- O mover a `docs/archived/cap-1-universo-sinfonia-monolitico.mdx`
- O eliminarlo entirely (git history preserva)

Confirmar con Ricardo en PR-C. Verificar que `[chapter]/index.astro` no se rompe al renombrar (el `chapterEntry = await getEntry('book', chapter)` debe seguir resolviéndose para el status del capítulo).

Si el chapter entry se rompe al renombrar:
- Mantener un MDX placeholder mínimo en `book/cap-1-universo-sinfonia.mdx` con solo el frontmatter
- Frontmatter conserva `status`, `chapter`, `title`, `subtitle` para que el routing index.astro lo resuelva

## Procedimiento sugerido para PR-D

1. Diff word-by-word manuscrito v2 vs las 9 piezas mergeadas.
2. Clasificar cada diferencia: Crítico / Menor / Cosmético / Estructural.
3. Reportar tabla a Ricardo.
4. Aplicar solo categorías aprobadas.
5. Sprint estimado: 8-12h.

## Manuscrito fuente

`E:\dev\tdv-workspace-editorial\02-Libro\capitulos-borradores\Capitulo 1\Cap1_TDV_VolumenI_Modo_B3_consolidado_v2_1_09-05-2026.docx`
