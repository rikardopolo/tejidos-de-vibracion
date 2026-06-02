# Recuadros · los nueve contenedores en impresión

Los recuadros del Manual existen como componentes Astro reales. Todos los del cuerpo
del libro se construyen sobre un componente base **`Marginalia.astro`** con una prop
`kind`, que produce una clase `.marginalia--<kind>`. La Obertura tiene variantes
propias (prefijo `Obertura…`) por su sub-paleta encapsulada. `print.css` estiliza la
clase base `.marginalia` y cada variante.

## Inventario (componente → función → variante)

| Componente (libro) | Contenedor del Manual | Variante Obertura |
|---|---|---|
| `VozTejido` (kind `voz-del-tejido`) | Voz del Tejido | `OberturaVozTejido` |
| `PausaCientifica` | Pausa Científica | `OberturaPausaCientifica` |
| `PausaReflexiva` | Pausa Reflexiva | `OberturaPausaReflexiva` |
| `LaboratorioInterior` | Laboratorio Interior | `Laboratorio` |
| `Checkpoint` | Checkpoint de Comprensión | — |
| `VentanaCuantica` | Ventana Cuántica | — |
| `AnclajeExperiencial` | Anclaje Experiencial | — |
| `CierreVibracional` | Cierre Vibracional | `CierreVolumen` |
| (`Advertencia`, en Obertura) | Advertencia de Seguridad | `Advertencia` |

Separadores/ornamentos: `Diamond` (◆, el más usado), `Flourish`, `Ornament`.
Otros de cuerpo: `Pullquote`, `Marginalia` (directo), `MapaConceptual`.

## Reglas de impresión (todas)

- **No se parten:** `break-inside: avoid;` en `.marginalia` y todas sus variantes,
  más `figure`, `.formula`, `.pullquote`. (Guía §8.3: "los recuadros no se parten".)
- **Anatomía de borde:** acento izquierdo grueso en el color del tipo de recuadro,
  bordes finos del mismo color. En CSS: `border-left: 4pt solid var(--<color>);`
  + `border: 0.5pt solid var(--<color>);` (el orden OOXML top→left→bottom→right de la
  Guía es una particularidad de Word; en CSS no aplica, pero el resultado visual sí).
- **Fondo:** cada familia usa su fondo semántico asignado en la Guía §7. Derivar de
  tokens; no inventar hex.
- **Separadores huérfanos:** un `Diamond`/`Flourish` nunca queda solo al pie de página
  (`break-after: avoid;` y, si encabeza bloque, `break-before: avoid;` con el párrafo
  siguiente).

## Reglas semánticas que se verifican en preflight (no son de estilo, son de contenido)

- **Ventana Cuántica:** su advertencia epistemológica (qué dice la física · qué NO
  dice) es constitutiva. Si una `VentanaCuantica` no la trae, es error de contenido.
- **Advertencia de Seguridad:** máximo 1 por capítulo ordinario, y **precede** al
  contenido riesgoso, nunca lo sigue.
- **Checkpoint:** es espejo, no test. No contiene respuestas.
- **Dos recuadros iguales seguidos** = un bloque mal partido, no dos pausas.

> Estas reglas son del Manual V5.2 / Guía §8. Se respetan en la maquetación, pero
> **ninguna etiqueta del Manual aparece en el PDF** (ver Regla de entrega del SKILL).
