// Tipos sidecar para subscription-gate.mjs (decisión pura del gate de suscripción).
export type SubscriptionRow = {
  status: string;
  ends_at?: string | Date | null;
  current_period_end?: string | Date | null;
  pause?: { mode?: string } | null;
};

/** Niega a 1 (registro), nunca a 0: ver subscription-gate.mjs. */
export type AccesoSuscripcion = { nivel: 1 | 2; slugs: string[] };

/** Gracia tras impago: 7 días más allá de `current_period_end`. */
export const GRACIA_MS: number;

export function resolveSubscriptionGate(
  sub: SubscriptionRow | null | undefined,
  now: Date | number,
  graciaMs?: number,
): AccesoSuscripcion;
