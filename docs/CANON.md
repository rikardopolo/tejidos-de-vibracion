# Canon visual y editorial · Tejidos de Vibración (libro)

**Última actualización:** 18 de mayo 2026 · Sprint migración Obertura al libro.

Este documento es la fuente de verdad sobre las decisiones de diseño,
paleta, microcopy y voz editorial del sitio del libro **tejidosdevibracion.com**.

Cuando hay duda entre lo que dice este archivo y otra fuente (un prompt
en `00-Documentos-Fuente/`, un audit, una conversación pasada), este archivo
gana. Si el archivo está desactualizado se actualiza, no se ignora.

---

## Sub-paleta de la Obertura · paper-and-ink independiente

**Decisión:** 2026-05-18 · sprint migración Obertura desde el portal

La Obertura tiene su propia sub-paleta encapsulada en `OberturaLayout.astro`
(`src/layouts/OberturaLayout.astro`). El resto del libro (capítulos cuando se
publiquen) usa `LecturaLarga.astro` con la paleta Pergamino canónica.

**Principio:** independencia ≠ aislamiento total. Donde la diferencia
con el canon Pergamino es imperceptible se alinea (consistencia). Donde
la diferencia es funcional se preserva (identidad).

### Tokens alineados al canon Pergamino

| Token Obertura | Valor | Equivalente canon |
|---|---|---|
| `--obertura-paper` | `#f2ead5` | `--pergamino` |
| `--obertura-paper-warm` | `#e5dbbe` | `--pergamino-2` |
| `--obertura-ink` | `#1a1a1a` | `--tinta` |
| `--obertura-ink-soft` | `#3a3530` | `--tinta-suave` |

### Tokens con identidad paper-and-ink propia

| Token | Valor | Razón de preservación |
|---|---|---|
| `--obertura-ink-faded` | `#6b5f4d` (cálido) | El gris `#8a8a8a` del canon sirve para UI · sobre paper-and-ink el faded cálido respira mejor |
| `--obertura-gold` | `#9c7a2a` (apagado) | El oro `#d4a017` del canon es para CTAs · este oro apagado es para indicadores epistémicos (niveles de evidencia, separadores rituales) |

### Tokens canónicos intocables · Hilo del Tejedor

| Token | Valor | Uso |
|---|---|---|
| `--obertura-thread` | `#8b2e2e` | Rojo borgoña principal · separadores, eyebrows, acentos |
| `--obertura-thread-deep` | `#5a1818` | Variante profunda |
| `--obertura-thread-hover` | `rgba(139, 46, 46, 0.04)` | Hover de TOC/nav-links |
| `--obertura-thread-ambient` | `rgba(139, 46, 46, 0.025)` | Gradient ambient sutil |
| `--obertura-thread-soft` | `rgba(139, 46, 46, 0.07)` | Bg PausaReflexiva |
| `--obertura-thread-mark` | `rgba(139, 46, 46, 0.08)` | Bg badge VozTejido |
| `--obertura-thread-quote` | `rgba(139, 46, 46, 0.3)` | Border-left blockquotes |

**El Hilo del Tejedor es canon documentado del proyecto editorial.** No se
modifica por contraste, ajuste tonal o "armonización". Cualquier cambio
requiere revisión editorial explícita en CANON.md.

### Tipografía

- `--obertura-serif: 'EB Garamond'` (alineada al canon del libro)
- `--obertura-sans: 'Inter'`
- `--obertura-mono: 'JetBrains Mono'`

---

## Gating de la Obertura · 3 piezas públicas, 12 piezas Nivel 1

**Piezas públicas (Nivel 0 · sin cookie):**
- `/obertura/00-frontispicio`
- `/obertura/01-anclaje`
- `/obertura/interludio-i`

**Piezas Nivel 1 (requieren cookie `tejedor-access`):**

Las 12 piezas restantes (`02-meta-observador` hasta `11-cierre`, más los
3 interludios). Lector sin cookie ve header + `BloquePuerta`.

**Biblioteca `/obertura`:** pública para todos. Las piezas Nivel 1 muestran
un indicador visual `◆` en oro fantasma cuando el lector está en Nivel 0.

**Bot allowlist:** crawlers conocidos (Googlebot, ClaudeBot, GPTBot,
Bingbot, facebookexternalhit, etc.) bypasean el gating y reciben contenido
completo. Esto es crítico para SEO + social previews + LLM training-set
inclusion.

---

## Origen del sistema

La arquitectura Biblioteca + 15 piezas + sub-paleta Obertura fue migrada
desde el portal `tejidos-de-realidad.com` el 2026-05-18 (sprint documentado
en `00-Documentos-Fuente/Portal web/Rediseño_TDR/PROMPT-MIGRACION-OBERTURA-2026-05-18.md`).

Antes de la migración el sitio del libro tenía una `/obertura` monolítica
(scroll infinito sobre `book/obertura.mdx`). Ese MDX se preserva como
referencia histórica con `status: 'draft'` y nota de deprecación.

---

## Impresión · recuadros (Marginalia)

**Decisión:** 2026-06-02 · skill `imprenta`

En impresión los recuadros siguen **el mismo canon que pantalla**: **borde izquierdo oro
uniforme** (`var(--oro)`), **fondo transparente**, y **solo el *eyebrow* diferenciado por
tipo** (`--indigo` para Pausa Científica / Ventana Cuántica · `--verde` para Voz del Tejido,
ya canónico en `system.css`). El borde **no** cambia de color por tipo. `print.css` no
introduce marcos ni tintes de fondo propios de impresión.

---

## Impresión · portada de sección

**Decisión:** 2026-06-02 · skill `imprenta`

La portada de cada sección (Obertura, capítulos) se renderiza con el **componente
`Frontispicio`** real, no con la geometría DXA literal de la Guía de Maquetación V2.1 §9.
El componente cumple el brief de "reusar componentes" y la geometría §9 queda superada por
él (ver `.claude/skills/imprenta/reference/geometria-pagina.md`). La portada usa `@page
portada` (sin cornisa ni folio).

---

## Cómo actualizar este canon

Cualquier cambio que afecte:

- Sub-paleta `--obertura-*` (todos los tokens · incluyendo `--obertura-thread`)
- Tipografía o tamaños de la Obertura
- Niveles de acceso por pieza
- Bot allowlist
- Microcopy del `BloquePuerta`

…**debe** actualizar este archivo en el MISMO PR que aplica el cambio.

Si encuentras una decisión en código que no está reflejada aquí, abre un
PR de documentación · NO la conviertas en canon de facto.
