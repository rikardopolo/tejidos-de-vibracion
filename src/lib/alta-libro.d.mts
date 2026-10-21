// Tipos sidecar para alta-libro.mjs (lógica pura en JS testeable).
import type { ZodTypeAny } from 'zod';

export const NOMBRE_MAX: number;
export const CORREO_MAX: number;
export const ENLACE_PRIVACIDAD: string;

export interface TextoConsentimiento {
  readonly version: string;
  readonly texto: string;
}

export const CONSENT_TEXT_LIBRO: Readonly<{
  autorizacion: TextoConsentimiento;
  cartas: TextoConsentimiento;
}>;

export function partirEnlace(texto: string): { antes: string; enlace: string; despues: string };
export function limpiarNombre(v: unknown): string;
export function saludo(nombre: unknown): string;

export const altaLibroSchema: ZodTypeAny;

export interface AltaLibro {
  correo: string;
  nombre?: string;
  autorizacion: true;
  cartas: boolean;
  website: string;
}

export function validarAltaLibro(body: unknown): { ok: true; datos: AltaLibro } | { ok: false; issues: string[] };
export function evidenciaConsentimiento(d: { cartas: boolean }): string;
export const CONSENT_LEGADO_LIBRO: readonly string[];
export function cartasAceptadas(consentText: unknown): boolean;
export function cartasVigentes(
  fila: { consent_text?: unknown; unsubscribed_at?: unknown } | null | undefined,
): boolean;

export function registrarAltaLibro(
  entrada: {
    datos: AltaLibro;
    /** Lo que devuelve `utmsSaneadas` (utm.mjs): objeto de UTMs o null. */
    utm: object | null;
    ipHash: string;
    userAgent: string | null;
    geo: { country: string | null; region: string | null };
  },
  deps: {
    supabase: unknown | null;
    upsertContact: (o: {
      email: string;
      attributes?: Record<string, string>;
      updateEnabled: boolean;
    }) => Promise<{ ok: boolean }>;
    enviarEnlace: (o: {
      email: string;
      name?: string;
      params: Record<string, string>;
    }) => Promise<{ ok: true; messageId?: string } | { ok: false }>;
    urlConfirmacion: (correo: string) => string;
    log?: { error: (...a: unknown[]) => void };
  },
): Promise<{ status: number; body: Record<string, unknown> }>;
