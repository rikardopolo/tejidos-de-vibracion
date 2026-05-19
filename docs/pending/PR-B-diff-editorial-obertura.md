# PR-B · Diff editorial Obertura · pendiente

Diferido del PR `feat/obertura-figuras-y-sweep-2026-05-18` (PR-A · 5 figuras).
Sprint estimado: 8-12h · diff acelerado en 4 piezas Δ alto.

## Piezas con delta alto · prioridad

| Pieza | Manuscrito (palabras) | MDX (palabras) | Δ | Severidad |
|---|---|---|---|---|
| `03-interferometro.mdx` | 5397 | 4663 | -734 | 🔴 alto |
| `09-estados.mdx` | 2463 | 1627 | -836 | 🔴 alto |
| `10-sintesis.mdx` | 1121 | 678 | -443 | 🔴 alto · parcialmente explicado por `MapaConceptual` SVG reemplazado por Figura O.5 en PR-A |
| `11-cierre.mdx` | 1849 | 2291 | +442 | 🔴 alto · MDX tiene MÁS texto · revisar duplicación |

## Piezas con delta medio

| Pieza | Manuscrito | MDX | Δ | Notas |
|---|---|---|---|---|
| `00-frontispicio.mdx` | 1260 | 1014 | -246 | Probable contenido solo-libro-físico (copyright, ISBN) · verificar |
| `01-anclaje.mdx` | 817 | 1028 | +211 | MDX tiene MÁS texto · revisar |

## Piezas idénticas · solo verificación spot-check

`interludio-i`, `02-meta-observador`, `04-tejedor`, `05-cartografia`, `06-velos`, `07-voz-transversal`, `08-niveles`.

## Caveat metodológico

Los deltas pueden ser engañosos: los MDX usan componentes Astro (`<PausaCientifica>`, `<Advertencia>`, `<VozTejido>`, `<Laboratorio>`, etc.) cuyo contenido cuenta como prose pero el markup no. Un diff word-by-word real requiere strip de componentes antes de comparar.

## Manuscrito fuente

`E:\dev\tdv-workspace-editorial\02-Libro\capitulos-borradores\Obertura\Obertura_TDV_v2_09-05-2026.docx`

Markdown ya convertido y publicable:
`E:\dev\tdv-workspace-editorial\02-Libro\capitulos-borradores\Obertura\Obertura_TDV_v2_PUBLICABLE.md` (720 líneas, 28.854 palabras totales).

## Cleanup secundario que puede ir con PR-B

- `src/components/obertura/MapaConceptual.astro` quedó orphan tras PR-A (Figura O.5 reemplazó al SVG en `10-sintesis.mdx`). Confirmar con Ricardo si se elimina del repo o se preserva por historial.

## Procedimiento sugerido para PR-B

1. Para cada pieza Δ alto, extraer la prosa del MDX (sin componentes) con un script Python/Node.
2. Diff word-by-word contra la sección equivalente del manuscrito v2.
3. Clasificar cada diferencia en 4 categorías: **Crítico** (sección nueva), **Menor** (tipeo/puntuación), **Cosmético** (espaciado), **Estructural** (reorganización).
4. Reportar tabla a Ricardo y aplicar solo las categorías aprobadas.
5. Commits granulares por pieza · PR separado contra `main`.
