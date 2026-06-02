# Preflight · verificación previa a la entrega

Si algún punto falla, el documento está en **borrador**, no en entrega.
Corre esto sobre el PDF generado (y, donde aplique, sobre el HTML de impresión).

## A · Geometría y tipografía (Guía §10)

- [ ] Página US Letter 8.5 × 11, márgenes 1 in en los cuatro lados.
- [ ] Cuerpo en EB Garamond 11 pt, interlineado ~1.35 (papel, no el 1.7 de pantalla).
- [ ] Títulos en Inter Bold con los colores TDV (`#2D1B69`, `#0A0E1A`, `#1D9E75`, `#1A1A1A`).
- [ ] Cornisa `TEJIDOS DE VIBRACIÓN · VOL. I · [SECCIÓN]` (DM Sans 9 pt, `#6B7280`) o
      la sustitución consciente documentada en `CANON.md`.
- [ ] Folio centrado al pie (10 pt, `#555555`).
- [ ] **Ningún azul de Office** (`#2E74B5`, `#1F4D78`, `#5B9BD5`) en el documento.

## B · Estructura de página

- [ ] Cada capítulo y cada portada de sección empieza en página nueva.
- [ ] Ningún recuadro partido entre páginas.
- [ ] Ningún separador (◆ / — ◇ —) huérfano al pie.
- [ ] Sin páginas en blanco accidentales; viudas/huérfanas controladas.
- [ ] Figuras con su caption en la misma página; resolución ≥ 300 ppp al tamaño usado.
- [ ] Fórmulas formales numeradas; bloques no partidos.

## C · Contenido semántico (Manual V5.2 / Guía §8)

- [ ] Cada Ventana Cuántica trae su advertencia epistemológica (qué dice · qué NO dice).
- [ ] Advertencias de Seguridad: máx. 1 por capítulo ordinario, y **preceden** al riesgo.
- [ ] Checkpoints sin respuestas (son espejo, no test).
- [ ] No hay dos recuadros idénticos consecutivos.

## D · Regla de entrega (la más importante)

- [ ] **Cero** menciones del Manual de Estilo (cualquier versión).
- [ ] **Cero** andamiaje de fábrica que el lector nunca debería ver: nombres de agentes,
      "Test del Lector Triple", notas crudas de autor/QA, meta-comentario de proceso.
- [ ] **Cero** checklists o reportes de verificación en el PDF.
- [ ] El registro es español neutro colombiano con **tuteo** (tú/puedes/eres). Sin voseo.

> **`Nivel N` y `Carril A/B` NO se filtran — son vocabulario reader-facing.** El libro los
> introduce y enseña explícitamente: la Obertura (`08-niveles`) los presenta como «el código
> de honestidad del libro» y «cuatro niveles, cada uno señalizado explícitamente»; `11-cierre`
> los nombra («no son jerga, son llaves»). Igual que `Velos`, `Territorios` o `Meta-Observador`:
> léxico de la obra, no andamiaje interno. Prohibirlos era un falso positivo.

> Sugerencia de automatización: un grep sobre el HTML/PDF de impresión para
> `Manual de Estilo`, `Test del Lector`, patrones de voseo (`podés|tenés|querés|sos\b`) y
> azules de Office (`#2E74B5|#1F4D78|#5B9BD5`). Cualquier acierto bloquea la entrega
> hasta revisión.
