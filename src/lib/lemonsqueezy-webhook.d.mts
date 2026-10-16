// Tipos sidecar para lemonsqueezy-webhook.mjs (lógica pura en JS testeable).
export function verifyLemonSignature(
  rawBody: string,
  signatureHeader: string | null | undefined,
  secret: string,
): boolean;

export function orderRef(lsOrderId: string): string;

export function mapProductToNivel(
  productSlug: string | undefined | null,
): { nivel: 2 | 3; expira: string | null } | null;

export const PREFIJO_VARIANTE: 'LS_VARIANT_';
export const PREFIJO_VARIANTE_SUSCRIPCION: 'LS_VARIANT_SUSCRIPCION';

/** 'bundle-preventa' → 'LS_VARIANT_BUNDLE_PREVENTA'. */
export function envVarDeVariante(slug: string): string;

export interface MapaVariantes {
  /** variant_id → slug de pago único. */
  unica: Map<string, string>;
  /** variant_id de suscripción (toda variable `LS_VARIANT_SUSCRIPCION*`). */
  suscripcion: Set<string>;
  /** variant_id que dos slugs reclaman a la vez (se dejan fuera del mapa). */
  ambiguas: string[];
}

export function buildVariantMap(env: Record<string, string | undefined> | null | undefined): MapaVariantes;

/** `LS_ACEPTAR_TEST_MODE=true` fuera de producción. Lee `process.env` si no se le pasa entorno. */
export function aceptarTestMode(env?: Record<string, string | undefined>): boolean;

export function esTestMode(body: unknown): boolean;

export interface ParsedOrderEvent {
  lsOrderId: string;
  lsOrderIdentifier: string | null;
  email: string | null;
  userName: string | null;
  leadId: string | null;
  /** Solo informativo: no decide el nivel. */
  productSlug: string | null;
  variantId: string | null;
  orderStatus: string | null;
  amountCents: number | null;
  refundedAmountCents: number | null;
  currency: string;
  status: 'paid' | 'refunded';
  testMode: boolean;
  eventName: string;
}

export function parseOrderEvent(
  body: unknown,
  eventName: string | undefined,
): ParsedOrderEvent | null;

export type ClaseOrden =
  | { tipo: 'suscripcion' }
  | { tipo: 'desconocida' }
  | { tipo: 'unica'; slug: string; nivel: 2 | 3; expira: string | null };

export function clasificarOrden(
  parsed: Pick<ParsedOrderEvent, 'variantId' | 'productSlug'>,
  variantes: Pick<MapaVariantes, 'unica' | 'suscripcion'>,
): ClaseOrden;

export type DecisionEntrega =
  | { accion: 'firma_invalida' }
  | { accion: 'json_invalido' }
  | { accion: 'test_mode_ignorado'; body: unknown; eventName: string | null; lsOrderId: string | null }
  | { accion: 'evento_ignorado'; body: unknown; eventName: string | null }
  | { accion: 'suscripcion'; body: unknown; sub: ParsedSubscriptionEvent }
  | { accion: 'suscripcion_invalida'; body: unknown; eventName: string | null }
  | { accion: 'suscripcion_ignorada'; body: unknown; parsed: ParsedOrderEvent }
  | { accion: 'reembolso_parcial'; body: unknown; parsed: ParsedOrderEvent }
  | { accion: 'producto_desconocido'; body: unknown; parsed: ParsedOrderEvent }
  | {
      accion: 'procesar';
      body: unknown;
      parsed: ParsedOrderEvent;
      producto: { slug: string; nivel: 2 | 3; expira: string | null };
    };

export function decidirEntrega(input: {
  raw: string;
  signature: string | null | undefined;
  secret: string;
  eventName?: string | null;
  variantes: Pick<MapaVariantes, 'unica' | 'suscripcion'>;
  aceptarTestMode: boolean;
}): DecisionEntrega;

export function persistOrderAtomic(
  supabase: { from: (table: string) => any },
  parsed: { lsOrderId: string; status: 'paid' | 'refunded' },
  row: Record<string, unknown>,
): Promise<{ isFirstEffect: boolean; error: { message: string } | null }>;

/** Reclama ATÓMICAMENTE el derecho a enviar el email de acceso de una orden. */
export function claimAccesoEnvio(
  supabase: { from: (table: string) => any },
  lsOrderId: string,
): Promise<{ claimed: boolean; error: { message: string } | null }>;

/** Devuelve el derecho a enviar cuando el email falló, para que el reintento lo recupere. */
export function releaseAccesoEnvio(
  supabase: { from: (table: string) => any },
  lsOrderId: string,
): Promise<{ error: { message: string } | null }>;

// ─── Suscripciones (S-13) ───────────────────────────────────────────────────

export const SUBSCRIPTION_EVENTS: readonly string[];
export type EstadoSuscripcion = 'active' | 'on_trial' | 'past_due' | 'paused' | 'cancelled' | 'expired' | 'unpaid';
export const ESTADOS_SUSCRIPCION: readonly EstadoSuscripcion[];
export const PROVEEDOR: 'lemonsqueezy';
export const SLUG_SUSCRIPCION: 'suscripcion-libro';

export function suscripcionRef(id: string): string;

export interface ParsedSubscriptionEvent {
  providerSubscriptionId: string;
  status: EstadoSuscripcion;
  variantId: string | null;
  customerId: string | null;
  email: string | null;
  userName: string | null;
  renewsAt: string | null;
  endsAt: string | null;
  trialEndsAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  cancelled: boolean;
  pause: { mode: 'void' | 'free'; resumes_at: string | null } | null;
  testMode: boolean;
  custom: Record<string, unknown> | null;
  eventName: string;
}

export function parseSubscriptionEvent(body: unknown, eventName: string | undefined | null): ParsedSubscriptionEvent | null;

export function cambiosSuscripcion(sub: ParsedSubscriptionEvent, body: unknown): Record<string, unknown>;
export function filaSuscripcion(
  sub: ParsedSubscriptionEvent,
  ctx: { accountId: string | null; vinculo: 'cuenta' | 'pendiente'; body: unknown; nowIso: string },
): Record<string, unknown>;
export function esEventoObsoleto(rawGuardado: unknown, sub: Pick<ParsedSubscriptionEvent, 'updatedAt'>): boolean;

export type ResultadoSuscripcion = {
  http: number;
  resultado: string;
  vinculo?: 'cuenta' | 'pendiente';
  motivo?: string | null;
  correo?: 'enviado' | 'fallido' | 'omitido';
  aviso?: 'config';
};

export function procesarSuscripcion(
  supabase: { from: (table: string) => any },
  sub: ParsedSubscriptionEvent,
  ctx: {
    body: unknown;
    secretCustom: string | null | undefined;
    variantesSuscripcion: Set<string>;
    nowMs?: number;
    enviarCorreoVincular?: (d: { email: string; nombre: string | null }) => Promise<{ ok: boolean }>;
  },
): Promise<ResultadoSuscripcion>;
