// Tipos sidecar para gate-decision.mjs (decisión pura de acceso, testeable en JS).
export type Nivel = 0 | 1 | 2 | 3;

export function puedeAcceder(
  acceso: { nivel: Nivel; slugs: string[] },
  nivelRequerido: Nivel,
  slugRequerido?: string | null,
): boolean;

export function conSesionTdv(
  porToken: { nivel: Nivel; slugs: string[] },
  haySesion: boolean,
): { nivel: Nivel; slugs: string[] };
