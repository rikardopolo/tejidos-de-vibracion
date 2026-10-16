// Tipos sidecar para sesion-tdv.mjs (lógica pura en JS testeable).
export const SESION_COOKIE: '__Host-tdv_sesion';
export const STATE_COOKIE: '__Host-tdv_state';
export const SESION_TTL_S: number;
export const STATE_TTL_S: number;
export const SECRETO_MIN: number;

export type MetodoAcceso = 'enlace' | 'codigo' | 'contrasena' | 'passkey' | 'respaldo' | 'google';
export const METODOS_ACCESO: readonly MetodoAcceso[];

/** Marca de nivel (S-13, D4): último nivel ≥ 2 confirmado por la base; `hasta` en segundos. */
export type EntTdv = { n: 1 | 2 | 3; hasta: number };

export type OpcionesFirma = { secret?: string | null; now?: number };

export type SesionTdvClaims = {
  aid: string;
  ep: number;
  am: MetodoAcceso;
  /** Correo YA enmascarado (`r***@gmail.com`), nunca en claro. */
  em?: string | null;
  ent?: EntTdv | null;
};

export type SesionTdvValida = {
  ok: true;
  aid: string;
  ep: number;
  am: MetodoAcceso;
  iat: number;
  exp: number;
  em: string | null;
  ent: EntTdv | null;
};

export type RechazoTdv = {
  ok: false;
  reason:
    | 'sin-secreto'
    | 'sin-cookie'
    | 'malformed'
    | 'bad-signature'
    | 'wrong-purpose'
    | 'wrong-aud'
    | 'missing-fields'
    | 'bad-am'
    | 'expired';
};

export type StateTdvValido = { ok: true; sh: string; next: string };

export type OpcionesCookieTdv = {
  path: '/';
  httpOnly: true;
  secure: true;
  sameSite: 'lax';
  maxAge: number;
};

export function sesionTdvDeCookie(
  valor: string | null | undefined,
  opts: { activa: boolean; secret: string | null | undefined; now?: number },
): SesionTdvValida | null;
export function opcionesCookieTdv(maxAge: number): OpcionesCookieTdv;
export const OPCIONES_BORRADO_TDV: Readonly<Omit<OpcionesCookieTdv, 'maxAge'>>;

export function secretoValido(valor: unknown): string | null;
export function secretoSesionTdv(): string | null;
export function firmarSesionTdv(claims: SesionTdvClaims, opts?: OpcionesFirma): string | null;
/** Re-firma una sesión verificada cambiando solo `ent` (conserva `iat` y `exp`). */
export function reemitirSesionTdv(
  sesion: Pick<SesionTdvValida, 'aid' | 'ep' | 'am' | 'iat' | 'exp'> & { em?: string | null },
  ent: EntTdv | null,
  opts?: OpcionesFirma,
): string | null;
export function verificarSesionTdv(token: string | null | undefined, opts?: OpcionesFirma): SesionTdvValida | RechazoTdv;
export function firmarStateTdv(claims: { sh: string; next: string }, opts?: OpcionesFirma): string | null;
export function verificarStateTdv(token: string | null | undefined, opts?: OpcionesFirma): StateTdvValido | RechazoTdv;
