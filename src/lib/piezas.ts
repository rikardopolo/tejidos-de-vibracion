/**
 * Registro de piezas sociales → destino y campaña.
 *
 * ─── EL PROBLEMA QUE RESUELVE ──────────────────────────────────────────────
 * Los 12 reels llevan un esquema UTM completo en su CTA. En 40 días produjeron
 * **cero** sesiones atribuidas (PostHog, `utm_medium=reel` → 0). No es que
 * convirtieran mal: es que el CTA dice «link en bio», el enlace del reel no es
 * clicable, y el de la bio no puede arrastrar un `utm_content` distinto por
 * pieza porque la bio es UN solo enlace.
 *
 * El puente lo arregla invirtiendo el orden: en vez de meter las UTMs en un
 * enlace que nadie puede pulsar, se publica una ruta corta POR PIEZA
 * (`/r/reel-12`) que sí cabe donde hay enlaces reales —descripción de YouTube,
 * post de Facebook, sticker de Stories, o la propia bio cambiada por pieza— y
 * es ella la que sella la campaña al redirigir.
 *
 * ─── CÓMO AÑADIR UNA PIEZA ─────────────────────────────────────────────────
 * Una línea aquí, y el enlace `/r/<slug>` existe en el siguiente deploy. El
 * slug es el mismo identificador que usa `content_queue` y el JSON de datos,
 * para que la pieza se pueda seguir de punta a punta sin tablas de traducción.
 */

export type Pieza = {
  /** URL de destino, sin parámetros: las UTMs las pone el puente. */
  destino: string;
  /** `utm_campaign`. Suele ser el hito del calendario (kickoff-d26, agosto-c1…). */
  campaign: string;
  /** `utm_source`. Por defecto la cuenta que publica. */
  source?: string;
  /** `utm_medium`. reel · carrusel · short · post. */
  medium?: string;
  /** Título humano — se usa en la página de bio. */
  titulo?: string;
};

/** Destino por defecto cuando el slug no existe. Nunca se devuelve un 404. */
export const DESTINO_FALLBACK = 'https://tejidosdevibracion.com/obertura';

export const PIEZAS: Record<string, Pieza> = {
  // ── Reels TDR · julio 2026 ────────────────────────────────────────────────
  // Los 07-08 apuntan al portal (simuladores); los 09-12, al libro.
  'reel-07': {
    destino: 'https://tejidosderealidad.com/simuladores',
    campaign: 'kickoff-d12',
    titulo: 'Cuántico no es física',
  },
  'reel-08': {
    destino: 'https://tejidosderealidad.com/simuladores',
    campaign: 'kickoff-d14',
    titulo: 'El universo no es oídos',
  },
  'reel-09': {
    destino: 'https://tejidosdevibracion.com/obertura',
    campaign: 'kickoff-d26',
    titulo: 'Desmontar mitos no era el punto',
  },
  'reel-10': {
    destino: 'https://tejidosdevibracion.com/obertura',
    campaign: 'kickoff-d29',
    titulo: 'El vacío que no está vacío',
  },
  'reel-11': {
    destino: 'https://tejidosdevibracion.com/obertura',
    campaign: 'kickoff-d30',
    titulo: 'Treinta días de mitos',
  },
  'reel-12': {
    destino: 'https://tejidosdevibracion.com/obertura',
    campaign: 'kickoff-d30',
    titulo: 'Esto no termina. Empieza.',
  },

  // ── Fragmentos de la Obertura · cuenta TDV ────────────────────────────────
  // Estas piezas NO llevaban ninguna URL: su endcard muestra el dominio como
  // texto plano, así que hasta ahora eran imposibles de atribuir aunque
  // alguien lo tecleara a mano.
  'p3-umbral': {
    destino: 'https://tejidosdevibracion.com/obertura',
    campaign: 'obertura-fragmentos',
    source: 'tdv-ig',
    titulo: 'El umbral del método',
  },
  'p4-meta-observador': {
    destino: 'https://tejidosdevibracion.com/obertura',
    campaign: 'obertura-fragmentos',
    source: 'tdv-ig',
    titulo: 'La voz del Meta-Observador',
  },
  'p7-invitacion-final': {
    destino: 'https://tejidosdevibracion.com/obertura',
    campaign: 'obertura-fragmentos',
    source: 'tdv-ig',
    titulo: 'La invitación final',
  },

  // ── Atajos permanentes (no son piezas: son destinos de bio estables) ──────
  obertura: {
    destino: 'https://tejidosdevibracion.com/obertura',
    campaign: 'bio-permanente',
    medium: 'bio',
    titulo: 'Leer la Obertura (gratis)',
  },
  simuladores: {
    destino: 'https://tejidosderealidad.com/simuladores',
    campaign: 'bio-permanente',
    medium: 'bio',
    titulo: 'El laboratorio: simuladores',
  },
};

/** Piezas que se listan en /bio, de la más reciente a la más antigua. */
export const ORDEN_BIO = [
  'obertura',
  'p7-invitacion-final',
  'reel-12',
  'reel-11',
  'reel-10',
  'reel-09',
  'simuladores',
] as const;

/**
 * Construye la URL final con las UTMs selladas.
 * Si el destino ya trae parámetros, se conservan.
 */
export function urlConAtribucion(slug: string, pieza: Pieza): string {
  const url = new URL(pieza.destino);
  url.searchParams.set('utm_source', pieza.source ?? 'tdr-ig');
  url.searchParams.set('utm_medium', pieza.medium ?? 'reel');
  url.searchParams.set('utm_campaign', pieza.campaign);
  url.searchParams.set('utm_content', slug);
  return url.toString();
}
