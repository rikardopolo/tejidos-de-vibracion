// Tipos sidecar para ingest-headers.mjs (filtro puro de cabeceras del proxy PostHog).
export const CABECERAS_PERMITIDAS: ReadonlySet<string>;
export const CABECERAS_RESPUESTA_BLOQUEADAS: ReadonlySet<string>;

export function filtrarPeticion(entrantes: Headers): Headers;
export function filtrarRespuesta(entrantes: Headers): Headers;
