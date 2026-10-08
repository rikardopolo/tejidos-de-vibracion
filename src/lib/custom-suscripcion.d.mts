// Tipos sidecar para custom-suscripcion.mjs (custom firmado del checkout, S-13).
export const CUSTOM_SECRETO_MIN: number;
export const CUSTOM_MAX_EDAD_S: number;

export type CustomFirmado = { account_id: string; nonce: string; iat: string; sig: string };

export function secretoCustomValido(valor: unknown): string | null;
export function nuevoNonce(): string;
export function firmaCustom(accountId: string, nonce: string, iat: string | number, secret: string): string;
export function firmarCustom(
  c: { accountId: string; nonce: string; iat: number },
  secretRaw: string | null | undefined,
): CustomFirmado | null;
export function verificarCustom(
  custom: unknown,
  secretRaw: string | null | undefined,
  opts: { nowS: number; maxEdadS?: number },
):
  | { ok: true; accountId: string; nonce: string; iat: number }
  | { ok: false; motivo: 'sin_secreto' | 'sin_custom' | 'campos' | 'firma' | 'caducado' | 'futuro' };
