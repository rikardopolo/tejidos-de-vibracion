# Tejidos de Vibración · Sitio del Libro

## Quién

Ricardo Polo · Orion. Autor colombiano (Cali) del libro Tejidos de Vibración, primer volumen de la trilogía Tejidos de Realidad.

## Qué

`tejidosdevibracion.com` es el **sitio editorial autónomo del libro Tejidos de Vibración**. Objeto editorial premium con experiencia de lectura cuidada, sistema de captura de "tejedores" (lectores), gating de niveles, y entrega escalonada de capítulos.

Stack: Astro + MDX + Vanilla CSS + Content Collections + Brevo DOI + gating HMAC.

## Audiencia

Lectores de divulgación científica con sensibilidad contemplativa. NO son developers ni profesionales tech. Buscan experiencia de lectura tipo libro de papel · pero digital · accesible y bella.

## Brand Personality

- **Pergamino dorado · cálido · ceremonial**
- Voz del Tejedor: íntima, lúcida, curiosa, elegante
- Tono: tuteo neutro colombiano · JAMÁS voseo
- Estilo: editorial premium · NO startup · NO SaaS

## Anti-references (cosas que NO debe parecerse)

- Medium / Substack / Newsletter platforms
- Notion-style document sites
- SaaS landing pages
- WordPress blog templates
- Manga/anime aesthetics

## References (lo que SÍ aspira a ser)

- Library Genesis (sobriedad editorial)
- Aeon Magazine (lectura inmersiva)
- New York Review of Books (autoridad editorial)
- Libros literarios premium impresos (papel cálido)
- Penguin Modern Classics (composición tipográfica)

## Register

**Brand register** (es un libro · diseño ES el producto). Algunas piezas funcionales son Product register (gating, Reader Controls, formulario captura · diseño SIRVE al producto).

## Voz canónica

Español neutro colombiano · tuteo absoluto · voz del Tejedor. JAMÁS voseo. Lenguaje culto pero accesible. Metáforas como herramientas pedagógicas. NO jergas tecnológicas innecesarias.

Ejemplo canon:

> "Sé bienvenido a Tejidos de Vibración. Aquí no hay venta · hay umbral. La Obertura está abierta para ti, y al final del primer recorrido encontrarás el Capítulo 1 esperando."

NO canon:

> ❌ "Suscríbete a nuestro newsletter para recibir contenido exclusivo"

## Identidad visual canónica · Paleta Pergamino

| Token | Hex | Uso |
|---|---|---|
| `--pergamino` | `#f2ead5` | Fondo cálido dorado |
| `--pergamino-2` | `#e5dbbe` | Segundo tono pergamino |
| `--tinta` | `#1a1a1a` | Texto principal (NO blanco como portal · este sitio es papel) |
| `--tinta-suave` | `#3a3530` | Texto secundario |
| `--oro` | `#d4a017` | Acento principal (COMPARTIDO con portal) |
| `--oro-suave` | `#b68914` | Acento secundario |
| `--oro-fantasma` | `#d4a0172e` | Acento muy sutil |
| `--reposo` | `#8a8a8a` | Gris reposo |
| `--reposo-claro` | `#b8b3ab` | Gris reposo claro |

**Tipografía:**

- **EB Garamond** (cuerpo Y títulos · MISMO que portal · canon editorial)
- **Inter** (UI únicamente)
- NO hay "mono" en el libro (a diferencia del portal con JetBrains Mono)

**Layout canónico (decisión deliberada · NO anti-pattern):**

- Columna única ~65ch
- Line-height 1.7
- Font-size cuerpo 1.1875rem
- Reader Controls (S/M/L/XL + Papel/Tinta) con localStorage
- Sin tema oscuro automático · usuario elige papel/tinta

## Decisiones canónicas que pueden parecer anti-patterns

Las siguientes decisiones son deliberadas. NO son anti-patterns:

| Decisión canónica del libro | Lo que un audit naive podría flaggear | Por qué NO es issue |
|---|---|---|
| Fondo pergamino `#f2ead5` cálido | "contrast ratio low" en texto sobre fondo cálido | Es decisión editorial · papel cálido es canon |
| Columna única ~65ch | "wasted horizontal space" | Estándar de readability editorial · NO Vercel |
| Line-height 1.7 | "excessive line-height for body" | Necesario para lectura prolongada |
| Reader Controls custom (S/M/L/XL) | "use rem-based responsive typography" | Control del lector es feature editorial |
| Sin tema oscuro automático | "missing dark mode support" | Papel/Tinta es el toggle canónico |
| MDX para capítulos | "complex MDX over markdown" | Necesario para componentes pedagógicos |
| Scripts externos en `/scripts/*.js` | "use inline modules" | CSP-safe es requerimiento de producción |
| `<aside>` con borde lateral oro | "decorative aside without semantic" | Componente pedagógico canónico |
| Gating con BloquePuerta y BloqueRegistro | "modal-first thinking" | Bloque inline editorial · NO overlay modal |
