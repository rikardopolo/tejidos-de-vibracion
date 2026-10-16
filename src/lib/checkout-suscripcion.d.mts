// Tipos sidecar para checkout-suscripcion.mjs (checkout de la suscripción, S-13).
import type { Desenlace } from './checkout-intento.mjs';

export type Plan = 'mensual' | 'anual';
export const PLANES: readonly Plan[];
export const INTENTO_TTL_MS: number;
export const TIMEOUT_CHECKOUT_MS: number;
export const SLUG_SUSCRIPCION: 'suscripcion-libro';
export const PORTAL_CUENTA_URL: string;

export function checkoutSuscripcionActivo(env?: Record<string, string | undefined>): boolean;
export function variantesDePlan(leer: (k: string) => string | undefined): { mensual: string | null; anual: string | null };
export function urlCuentaPortal(autorizarUrl: string | undefined | null): string;
export function correoPrecargable(email: unknown): string | undefined;

export type RespuestaCheckout = {
  status: number;
  body: Record<string, unknown>;
  desenlace: Desenlace;
  extra?: Record<string, unknown>;
  aviso?: 'config';
};

export function prepararCheckoutSuscripcion(ctx: {
  sesion: { aid: string; ep: number } | null;
  plan: Plan;
  client: unknown;
  secretCustom: string | null | undefined;
  variantes: { mensual: string | null; anual: string | null };
  crearCheckout: (o: {
    variantId: string;
    email?: string;
    productSlug: string;
    custom: Record<string, string>;
    expiresAt: string;
  }) => Promise<{ ok: true; url: string } | { ok: false; reason: string; status?: number; causa?: string }>;
  cuentaPortalUrl?: string;
  /** Límite de ritmo por cuenta; `true` = 429. Se consulta tras sesión y correo verificado. */
  limitado?: (aid: string) => boolean;
  nowMs?: number;
  nonce?: string;
  timeoutMs?: number;
}): Promise<RespuestaCheckout>;
