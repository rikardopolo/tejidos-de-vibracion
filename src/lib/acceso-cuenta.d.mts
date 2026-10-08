// Tipos sidecar para acceso-cuenta.mjs (nivel 2 por la cuenta de la sesión, S-13).
import type { EntTdv } from './sesion-tdv.mjs';

export type Nivel = 0 | 1 | 2 | 3;
export type Acceso = { nivel: Nivel; slugs: string[] };

export const TIMEOUT_ACCESO_MS: number;
export const ENT_MAX_S: number;
export const ENT_REFRESCO_S: number;

export function esProduccion(env?: Record<string, string | undefined>): boolean;
export function alcanceDeNivel(n: number): string[];
export function combinarAccesos(a: Acceso, b: Acceso): Acceso;
export function finDelDerecho(
  sub: { status: string; ends_at?: unknown; current_period_end?: unknown },
  graciaMs?: number,
): number;
export function clasificarFallo(res: { status?: number | null } | null | undefined): 'caida' | 'config';

export type ConsultaCuenta =
  | {
      ok: true;
      cuenta: { session_epoch: number } | null;
      subs: Array<Record<string, unknown>>;
      ordenes: Array<Record<string, unknown>>;
    }
  | { ok: false; tipo: 'caida' | 'config'; status: number };

export function consultarCuenta(client: unknown, aid: string, opts?: { timeoutMs?: number }): Promise<ConsultaCuenta>;

export function decidirMarcaEnt(
  actual: { n: number; hasta: number } | null,
  nueva: { n: number; hasta: number } | null,
  refrescoS?: number,
): 'mantener' | 'escribir' | 'borrar';

export function entVigente(ent: { n: number; hasta: number } | null | undefined, nowS: number): boolean;

export type DecisionCuenta = {
  acceso: Acceso;
  /** Epoch distinto o cuenta borrada: la sesión no vale y se borra la cookie. */
  revocada: boolean;
  ent: { accion: 'mantener' } | { accion: 'borrar' } | { accion: 'escribir'; ent: EntTdv & { n: 2 | 3 } };
  aviso: null | 'caida' | 'config';
  motivo: string;
};

export function decidirAccesoCuenta(ctx: {
  sesion: { ep: number; ent?: EntTdv | null };
  consulta: ConsultaCuenta;
  nowMs: number;
  produccion: boolean;
}): DecisionCuenta;

export function resolverAccesoCuenta(ctx: {
  client: unknown;
  sesion: { aid: string; ep: number; ent?: EntTdv | null };
  nowMs?: number;
  produccion?: boolean;
  timeoutMs?: number;
}): Promise<DecisionCuenta>;
