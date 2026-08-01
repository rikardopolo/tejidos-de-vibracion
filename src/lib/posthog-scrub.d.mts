// Tipos sidecar para posthog-scrub.mjs (scrub puro del payload de PostHog).
// El evento es el `CaptureResult` de posthog-js; solo tocamos `properties`.
export function limpiarEvento<T extends { properties?: Record<string, unknown> } | null>(evento: T): T;
