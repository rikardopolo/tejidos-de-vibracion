// Tipos sidecar para lead-alta.mjs (lógica pura en JS testeable).
export const CAMPOS_PROTEGIDOS: readonly ['email', 'name', 'unsubscribed_at'];

export function camposDeAlta<T extends Record<string, unknown>>(
  fila: T,
  ctx: { existe: boolean },
): Partial<T>;
