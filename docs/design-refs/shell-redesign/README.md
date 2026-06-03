# Shell-redesign · referencias visuales

Sprint **shell-redesign** del portal del libro (rama `preview/chapters-1-2-3`).
Porta el lenguaje visual de la Obertura (`OberturaLayout.astro`) a los
capítulos, conservando la paleta oro del libro.

> **Nota:** las 4 capturas de referencia se compartieron pegadas inline en
> la sesión de trabajo (no como archivos). Este README documenta qué imagen
> corresponde a cada slot y las convenciones derivadas, para que el lenguaje
> visual quede versionado aunque los binarios deban añadirse aparte. Para
> completar: soltar los 4 PNG en esta carpeta con los nombres de abajo.

## Slots de referencia

| Archivo | Qué muestra | Rol |
|---|---|---|
| `ref-1-obertura-index.png` | Index de la Obertura · header minimalista + lista de piezas + numeración compacta (`00`, `01`, `i`) | Modelo del index biblioteca |
| `ref-2-obertura-contenido.png` | Pieza de contenido · breadcrumb central `◆ 02 · EL META-OBSERVADOR` + pagination cards al pie | Modelo del shell de lectura |
| `baseline-3-cap2-index.png` | Index Cap. 2 ANTES (book-header de 5 items) | Estado a reemplazar |
| `baseline-4-cap2-galileo.png` | §2.1 ANTES (book-header + sin breadcrumb) | Estado a reemplazar |

## Convenciones derivadas (implementadas)

### Header chrome (3 slots · `CapituloLayout.astro`)
- Izquierda: pill **☰ ÍNDICE** → abre `CapituloToc` (lista de piezas del capítulo).
- Centro: **breadcrumb dinámico** `{ornamento} {label} · Cap. {N}` (solo en piezas, no en el index).
- Derecha: pill **⊕ LECTURA** → abre el panel de controles de lectura (reutiliza `/libro-reader.js`).
- Se elimina en capítulos el `BookHeader` global de 5 items y el FAB flotante "Aa".

### Numeración compacta por tipo de pieza (`lib/piece-num.ts`)
El identificador comunica el **tipo** de pieza, no solo el orden:

| Tipo (`kind`) | Marcador |
|---|---|
| `portada` | `◇` |
| `umbral` | `○` |
| `anclaje` | `◆` |
| `numbered` | su número (`2.1`, `2.2`, …) |
| `cierre` | `●` |

El breadcrumb usa `◆` como marcador de sección para las §-numbered
(el `§num` desambigua del Anclaje, que también es `◆`).

### Tratamiento de texto
- Cuerpo `.prose` **justificado** + `hyphens: auto` (scoped a capítulos vía
  `CapituloLayout`, NO en `system.css` global · no afecta las otras páginas
  de `LecturaLarga`).
- En móvil (`max-width: 480px`) el cuerpo vuelve a `text-align: left` para
  evitar ríos en columnas estrechas.

### "Modo lectura" (coherencia con Obertura)
- Reading-progress bar (scaleX) en oro `--oro-suave`.
- Thread-strip lateral en oro (vs carmesí de la Obertura).
- Paper-grain sutil (gradientes oro + índigo).

### Paleta
- Conservada: oro del libro (`--oro`, `--oro-suave`, `--pergamino`, etc. de
  `tokens.css`). **No** se adopta el carmesí `--obertura-thread`.
- Tipografías V2.1 intactas (EB Garamond · Inter · DM Sans · JetBrains Mono).

## Arquitectura

`CapituloLayout` es **standalone** (`<!doctype html>` propio, como
`OberturaLayout`) pero importa `global.css` (fonts + tokens + system) para que
el contenido MDX renderizado funcione idéntico. Es un layout **paralelo**: NO
modifica `LecturaLarga.astro`, que sigue sirviendo a las 10+ páginas que no son
capítulos.
