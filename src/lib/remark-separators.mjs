/**
 * remark-separators.mjs · gilda los separadores tipográficos del libro.
 *
 * Sprint unificación de estilo · decisión 2 (B.2). Convierte los
 * separadores LITERALES standalone del MDX en divisores `.flourish`
 * (oro), unificando el repertorio Obertura ↔ Capítulos sin editar
 * archivo por archivo · y haciendo que Cap. 3 los herede automáticamente.
 *
 * Repertorio (decisión 2):
 *   ◆        → flourish--diamond  (respiro entre párrafos)
 *   — ◇ —    → flourish--rule     (separador de sección)
 *   ◇ ◆ ◇    → flourish--triple   (cierre de bloque mayor)
 *
 * PRECAUCIÓN (Ricardo): solo transforma PÁRRAFOS STANDALONE cuyo único
 * contenido es el separador. NUNCA toca glifos ◆/◇ que aparezcan inline
 * dentro de prosa o ASCII-art (esos tienen más texto en el párrafo →
 * no matchean).
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
};

/** Normaliza: trim + colapsa espacios internos (p.ej. "◇   ◆   ◇" → "◇ ◆ ◇"). */
function normalize(s) {
  return s.replace(/\s+/g, ' ').trim();
}

/** ¿El párrafo es SOLO un separador? Devuelve la variante o null. */
function separatorVariant(node) {
  if (node.type !== 'paragraph' || !Array.isArray(node.children)) return null;
  // Concatenar solo nodos de texto · si hay otros tipos (énfasis, links,
  // jsx) no es un separador puro.
  if (!node.children.every((c) => c.type === 'text')) return null;
  const text = normalize(node.children.map((c) => c.value).join(''));
  return VARIANT_BY_SEP[text] ?? null;
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
