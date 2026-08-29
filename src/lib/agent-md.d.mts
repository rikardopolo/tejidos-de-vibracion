// Tipos sidecar para agent-md.mjs (negociación de markdown para agentes).

/** Entrada del mapa de recuperación del 404. */
export interface Ruta404 {
  href: string;
  label: string;
  desc: string;
}

/** Mapa de recuperación · fuente única de 404.astro y de MD_404. */
export const RUTAS_404: readonly Ruta404[];

/** Cuerpo markdown del 404. */
export const MD_404: string;

/** ¿El cliente pide markdown explícitamente? */
export function wantsMarkdown(accept: string | null | undefined): boolean;

/** Negocia la variante del 404 y marca `Vary: Accept`. Otras respuestas salen intactas. */
export function apply404Negotiation(
  pathname: string,
  accept: string | null | undefined,
  res: Response,
): Response;
