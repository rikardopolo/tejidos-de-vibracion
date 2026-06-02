# Figuras, fórmulas y notas

## Figuras · `FiguraTDV` / `FiguraEditorial`

- Numeración **Figura N.M** (capítulo.orden). En impresión, el número y el caption van
  separados del gráfico cuando la figura no debe llevar texto interno.
- `break-inside: avoid;` sobre `figure` y su `figcaption` juntos.
- Caption en EB Garamond Italic, cuerpo menor (≈9.5 pt), color `--tinta-suave`.
- Resolución mínima para imprenta: 300 ppp al tamaño de colocación. El script de
  preflight marca imágenes que, al ancho de caja (6.5 in), queden por debajo.
- Mantener la estética TDV (pergamino/índigo/oro/teal). Sin texto incrustado en el
  gráfico salvo rótulos imprescindibles.

## Fórmulas · `Formula`

- Numeración **(N.M)** alineada a la derecha para fórmulas formales; las fórmulas
  narrativas en línea no se numeran.
- Separar **fórmula narrativa** (dentro del flujo, explicada) de **fórmula formal**
  (bloque centrado, numerado). No mezclar `E = hν` / `E = nhν` / `λ = h/p` sin contexto.
- `break-inside: avoid;` en el bloque de fórmula.
- Si la fórmula se renderiza como imagen/SVG, validar nitidez a 300 ppp como las figuras.

## Notas al pie

El cuerpo usa marcadores `<sup>N</sup>` (visto en `03-galileo`, etc.). Decisión de
impresión a tomar con el autor (no asumir):

1. **Notas al pie por página** (footnotes) vía CSS Paged Media: `float: footnote;`.
   Vivliostyle las soporta. Es lo clásico de un libro.
2. **Notas al final** de capítulo/volumen (endnotes), recogidas en una sección propia.

`print.css` deja el gancho listo para footnotes; activar según la decisión. Sea cual
sea, la numeración reinicia donde corresponda (por capítulo es lo habitual).
