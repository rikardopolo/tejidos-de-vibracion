/**
 * piece-num.ts · numeración compacta y ornamentos por tipo de pieza.
 *
 * Sprint shell-redesign (preview/chapters-1-2-3). Decisión editorial:
 * el identificador de una pieza comunica su TIPO, no solo su orden.
 *   - Piezas estructurales del capítulo → ornamento (◇ ○ ◆ ●)
 *   - §-secciones canónicas (numbered)   → su número (2.1, 2.2, …)
 *
 * Mapeo de ornamentos (decisión 2 del sprint):
 *   portada  → ◇   umbral → ○   anclaje → ◆   cierre → ●
 *
 * El breadcrumb del header (decisión 3) compone ornamento + label + capítulo:
 *   "◇ Portada · Cap. 2" · "◆ §2.1 · Cap. 2" · "● Cierre · Cap. 2"
 * Las §-secciones usan ◆ como marcador de sección (el §num desambigua del
 * Anclaje, que también es ◆ pero lleva la etiqueta "Anclaje").
 */

export type PieceKind = 'portada' | 'umbral' | 'anclaje' | 'numbered' | 'cierre';

/** Ornamento asociado a cada tipo de pieza. Las numbered usan ◆ (marcador de sección). */
const ORNAMENT: Record<PieceKind, string> = {
  portada: '◇',
  umbral: '○',
  anclaje: '◆',
  numbered: '◆',
  cierre: '●',
};

/** Etiqueta corta legible por tipo (para el breadcrumb). */
const KIND_LABEL: Record<PieceKind, string> = {
  portada: 'Portada',
  umbral: 'Umbral',
  anclaje: 'Anclaje',
  numbered: '', // se sustituye por §num
  cierre: 'Cierre',
};

export interface PieceLike {
  kind: PieceKind;
  num?: string;
}

/** Ornamento puro de la pieza (para el breadcrumb y acentos del chrome). */
export function pieceOrnament(kind: PieceKind): string {
  return ORNAMENT[kind] ?? '◆';
}

/**
 * Marcador para la columna izquierda del índice (CapituloToc / biblioteca).
 *   numbered → "2.1"  ·  estructurales → ornamento (◇ ○ ◆ ●)
 */
export function pieceMarker(piece: PieceLike): string {
  if (piece.kind === 'numbered' && piece.num) return piece.num;
  return pieceOrnament(piece.kind);
}

/**
 * Etiqueta del breadcrumb central del header.
 *   "◇ Portada · Cap. 2"  ·  "◆ §2.1 · Cap. 2"  ·  "● Cierre · Cap. 2"
 *
 * `chapterLabel` es el número del capítulo tal como debe mostrarse
 * (arábigo "2" según referencia del sprint; el page decide el formato).
 */
export function breadcrumbLabel(piece: PieceLike, chapterLabel: string | number): string {
  const orn = pieceOrnament(piece.kind);
  const label =
    piece.kind === 'numbered' && piece.num ? `§${piece.num}` : KIND_LABEL[piece.kind];
  return `${orn} ${label} · Cap. ${chapterLabel}`;
}
