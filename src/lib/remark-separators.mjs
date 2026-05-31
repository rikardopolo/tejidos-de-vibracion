/**
 * remark-separators.mjs · gilda los separadores tipográficos del libro.
 *
 * Sprint unificación de estilo · decisión 2 (B.2). Convierte los
 * separadores LITERALES standalone del MDX en divisores `.flourish`
 * (oro), unificando el repertorio Obertura ↔ Capítulos sin editar
 * archivo por archivo · y haciendo que Cap. 3 los herede automáticamente.
 *
 * Repertorio:
 *   ◆        → flourish--diamond  (respiro entre párrafos)
 *   — ◇ —    → flourish--rule     (separador de sección)
 *   ◇ ◆ ◇    → flourish--triple   (cierre de bloque mayor)
 *   ◆ ◆ ◆    → flourish--triple   (variante del cierre · misma forma oro)
 *
 * Muchos separadores vienen ENVUELTOS en negrita desde el DOCX
 * (`**◆**`, `**◆ ◆ ◆**`) → en MDAST son un nodo `strong`, no `text`.
 * Por eso extraemos el texto recursivamente a través de `strong`/
 * `emphasis`/`delete` (pero NO de links/código/jsx/imágenes).
 *
 * PRECAUCIÓN (Ricardo): solo transforma PÁRRAFOS STANDALONE cuyo único
 * contenido es el separador. NUNCA toca glifos ◆/◇ que aparezcan inline
 * dentro de prosa o ASCII-art (esos párrafos tienen más texto → su
 * contenido normalizado no matchea ninguna entrada del mapa).
 *
 * El glifo lo provee el CSS `.flourish--X::before` en oro · por eso el
 * nodo queda sin hijos. `.flourish` vive en system.css (Capítulos, vía
 * global.css) y en el global de OberturaLayout (Obertura).
 */

const VARIANT_BY_SEP = {
  '◆': 'diamond',
  '— ◇ —': 'rule',
  '- ◇ -': 'rule', // tolera guion simple por si la fuente no usó em-dash
  '◇ ◆ ◇': 'triple',
  '◆ ◆ ◆': 'triple', // rombos llenos · misma forma de cierre en oro
};

/** Nodos inline cuyo texto SÍ cuenta como contenido del separador. */
const TEXTUAL_WRAPPERS = new Set(['strong', 'emphasis', 'delete']);

/** Normaliza: trim + colapsa espacios internos (p.ej. "◇   ◆   ◇" → "◇ ◆ ◇"). */
function normalize(s) {
  return s.replace(/\s+/g, ' ').trim();
}

/**
 * Texto plano de un nodo inline, descendiendo por strong/emphasis/delete.
 * Devuelve null si encuentra un nodo NO textual (link, inlineCode, image,
 * jsx, break, html…) · señal de que el párrafo no es un separador puro.
 */
function extractText(node) {
  if (node.type === 'text') return node.value;
  if (TEXTUAL_WRAPPERS.has(node.type) && Array.isArray(node.children)) {
    let out = '';
    for (const child of node.children) {
      const t = extractText(child);
      if (t === null) return null;
      out += t;
    }
    return out;
  }
  return null;
}

/** ¿El párrafo es SOLO un separador (aunque venga en negrita)? Variante o null. */
function separatorVariant(node) {
  if (node.type !== 'paragraph' || !Array.isArray(node.children)) return null;
  let text = '';
  for (const child of node.children) {
    const t = extractText(child);
    if (t === null) return null; // contiene algo que no es texto/énfasis
    text += t;
  }
  return VARIANT_BY_SEP[normalize(text)] ?? null;
}

export default function remarkSeparators() {
  return (tree) => {
    const walk = (parent) => {
      if (!parent || !Array.isArray(parent.children)) return;
      for (const node of parent.children) {
        const variant = separatorVariant(node);
        if (variant) {
          node.data = node.data || {};
          node.data.hName = 'div';
          node.data.hProperties = {
            className: ['flourish', `flourish--${variant}`],
            role: 'separator',
            'aria-hidden': 'true',
          };
          node.children = []; // el glifo viene del CSS ::before
        } else {
          walk(node);
        }
      }
    };
    walk(tree);
  };
}
