// Tipos sidecar para salto-tdv.mjs (lógica pura en JS testeable).
import type { MetodoAcceso } from './sesion-tdv.mjs';

export const SALTO_TIMEOUT_MS: number;
export const NEXT_MAX: number;

export type MotivoRechazoSalto =
  | 'config'
  | 'state'
  | 'parametros'
  | 'consulta'
  | 'canje'
  | 'salto-invalido'
  | 'am'
  | 'cuenta'
  | 'epoch';

export function sha256Hex(valor: string): string;
export function nuevoState(): string;
export function hashesIguales(a: unknown, b: unknown): boolean;
export function esParamSalto(valor: unknown): valor is string;
export function validarNext(next: unknown, origen: string): string | null;
export function urlAutorizar(base: string | null | undefined, state: string): string | null;
export function enmascararCorreo(email: unknown): string | null;
export function esMismoOrigen(headers: { get(name: string): string | null }, origen: string): boolean;

export function canjearSalto(
  client: unknown,
  args: { codeHash: string; stateHash: string; ahora: number; timeoutMs?: number },
): Promise<
  | { ok: true; aid: string; ep: number; am: MetodoAcceso; em: string | null }
  | { ok: false; motivo: MotivoRechazoSalto }
>;

export function resolverCallback(ctx: {
  code: string | null;
  state: string | null;
  cookieState: string | null | undefined;
  origen: string;
  client: unknown | null;
  secret: string | null | undefined;
  ahora?: number;
  timeoutMs?: number;
}): Promise<{ ok: true; next: string; sesion: string } | { ok: false; next: string; motivo: MotivoRechazoSalto }>;
