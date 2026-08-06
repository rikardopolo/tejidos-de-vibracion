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
  // Los 01-04, 06-08 apuntan al portal (simuladores); el 05 y los 09-12, al libro.
  // `campaign` y `destino` salen del registro canónico de cada pieza:
  // `04-Produccion/remotion-reels/data/reel-NN.json`, campo `acts.cta.bioUrl`.
  // Ojo: el `kickoff-dN` de ahí es el día PLANIFICADO, no el de publicación real
  // (reel-07 es d12 y salió el 20-jul). Se respeta el valor canónico porque es el
  // que ya viajó con la pieza y con el que se leyeron sus métricas.
  'reel-01': {
    destino: 'https://tejidosderealidad.com/simuladores/doble-rendija',
    campaign: 'kickoff-d1',
    titulo: 'Observar no es mirar',
  },
  'reel-02': {
    destino: 'https://tejidosderealidad.com/simuladores/doble-rendija',
    campaign: 'kickoff-d3',
    titulo: 'La placa es un observador',
  },
  'reel-03': {
    destino: 'https://tejidosderealidad.com/simuladores',
    campaign: 'kickoff-d5',
    titulo: 'Correlación no es comunicación',
  },
  'reel-04': {
    destino: 'https://tejidosderealidad.com/simuladores/tejido',
    campaign: 'kickoff-d7',
    titulo: 'Vibrar no es sintonizar',
  },
  'reel-05': {
    destino: 'https://tejidosdevibracion.com/obertura',
    campaign: 'kickoff-d8',
    titulo: 'Dos orillas, un río',
  },
  'reel-06': {
    destino: 'https://tejidosderealidad.com/simuladores',
    campaign: 'kickoff-d10',
    titulo: 'Placebo no es cuántico',
  },
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
    // Compartía `kickoff-d30` con reel-12 —las dos salen el 31-jul— así que en
    // PostHog eran una sola fila. Se desempata por AQUÍ y no por reel-12 porque
    // reel-12 ya tiene un pageview registrado con `kickoff-d30` (29-jul) y
    // renombrarlo dejaría ese dato huérfano.
    campaign: 'kickoff-d30-recap',
    titulo: 'Treinta días de mitos',
  },
  'reel-12': {
    destino: 'https://tejidosdevibracion.com/obertura',
    campaign: 'kickoff-d30',
    titulo: 'Esto no termina. Empieza.',
  },

  // ── Carruseles TDR · julio 2026 ───────────────────────────────────────────
  // Los carruseles no pasan por Remotion, así que no tienen JSON canónico:
  //   · `campaign` = `kickoff-d<N>`, con N = fecha de publicación − 2026-07-01.
  //     La fórmula la confirman los propios títulos de la cola: «Reel 01 · D1»
  //     salió el 02-jul y «Carrusel C01 · D2» el 03-jul. Ninguno de los días que
  //     salen aquí choca con los de los reels (1,3,5,7,8,10,12,14,26,29,30).
  //   · `destino` = el `enlace` que su fila de Facebook guarda en `content_queue`
  //     (C01-C06). C07 no tiene fila de FB → catálogo de simuladores. C08 es «la
  //     puerta a Tejidos de Vibración» y va a la Obertura.
  'carrusel-01': {
    destino: 'https://tejidosderealidad.com/simuladores',
    campaign: 'kickoff-d2',
    medium: 'carrusel',
    titulo: 'El método Doble Carril',
  },
  'carrusel-02': {
    destino: 'https://tejidosderealidad.com/simuladores',
    campaign: 'kickoff-d6',
    medium: 'carrusel',
    titulo: 'Doble rendija explicada',
  },
  'carrusel-03': {
    destino: 'https://tejidosderealidad.com/simuladores',
    campaign: 'kickoff-d9',
    medium: 'carrusel',
    titulo: 'Entrelazamiento sin mitos',
  },
  'carrusel-04': {
    destino: 'https://tejidosderealidad.com/simuladores',
    campaign: 'kickoff-d13',
    medium: 'carrusel',
    titulo: 'Frecuencia y sintonía',
  },
  'carrusel-05': {
    destino: 'https://tejidosdevibracion.com/obertura',
    campaign: 'kickoff-d17',
    medium: 'carrusel',
    titulo: 'El placebo honesto',
  },
  'carrusel-06': {
    destino: 'https://tejidosdevibracion.com/obertura',
    campaign: 'kickoff-d20',
    medium: 'carrusel',
    titulo: 'Observador cuántico vs consciente',
  },
  'carrusel-07': {
    destino: 'https://tejidosderealidad.com/simuladores',
    campaign: 'kickoff-d24',
    medium: 'carrusel',
    titulo: 'Superposición: el gato de Schrödinger',
  },
  'carrusel-08': {
    destino: 'https://tejidosdevibracion.com/obertura',
    campaign: 'kickoff-d27',
    medium: 'carrusel',
    titulo: 'Cierre: la puerta a Tejidos de Vibración',
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
  // Destino de la pieza de anuncio del Cap. 1 (hito de agosto). Apunta al
  // índice del capítulo, no a una pieza suelta: desde ahí se ven las 9.
  // El capítulo se abre con el flip de `status` en su MDX; este atajo puede
  // existir antes, porque redirigir no publica nada.
  'cap-1': {
    destino: 'https://tejidosdevibracion.com/capitulo/cap-1-universo-sinfonia',
    campaign: 'agosto-c1',
    medium: 'bio',
    titulo: 'Capítulo 1 · La Historia Secreta del Sonido',
  },
  'a01-cimatica': {
    destino: 'https://tejidosderealidad.com/simuladores/cymatica',
    campaign: 'agosto-a01',
    medium: 'reel',
    titulo: 'La arena que dibuja el sonido',
  },
};

/** Piezas que se listan en /bio, de la más reciente a la más antigua. */
export const ORDEN_BIO = [
  'cap-1',
  'obertura',
  'p7-invitacion-final',
  'reel-12',
  'reel-11',
  'reel-10',
  'reel-09',
  'simuladores',
] as const;

/**
 * Cuenta que se atribuye cuando la pieza no declara `source`.
 *
 * Es `tdv-ig` porque este registro **solo** se sirve desde
 * `tejidosdevibracion.com`: un `/r/<slug>` que sale de este dominio se pegó en
 * la bio de @tejidosdevibracion, no en la de TDR. El portal tiene su propia
 * copia del registro con su propio valor.
 *
 * Estaba en `tdr-ig`, copiado del portal al duplicar el archivo, y hacía que
 * `tejidosdevibracion.com/r/obertura` y `/r/cap-1` —los dos enlaces de la bio
 * de TDV— llegaran a PostHog etiquetados como tráfico de TDR. No fallaba: el
 * 302 salía bien y la cifra aparecía, en la fila equivocada.
 */
const CUENTA_POR_DEFECTO = 'tdv-ig';

/**
 * Cuenta de esta marca en cada red, para cuando el enlace declara DÓNDE se
 * publicó (`/r/<slug>?c=fb`).
 *
 * Hace falta porque el puente **descarta** cualquier UTM que traiga la petición
 * y sella siempre la de la pieza. Un `/r/reel-01` pegado en Facebook llegaba a
 * PostHog como `tdv-ig`: nada falla —el 302 sale bien— y la cifra aparece en la
 * fila de la red equivocada. Es el mismo modo de fallo que ya se pagó una vez
 * con el default copiado del portal, y el que hacía que WF-01b añadiera
 * `utm_source=facebook` a la URL para nada.
 */
const CUENTAS_POR_RED: Record<string, string> = {
  ig: CUENTA_POR_DEFECTO,
  tiktok: 'tdv-tiktok',
  fb: 'tdv-fb',
  yt: 'tdv-yt',
};

/**
 * Cuenta que corresponde a una red, o `null` si no la reconocemos.
 *
 * Allowlist a propósito: el valor sale de la query de un enlace público y acaba
 * dentro de una URL de destino. Lo que no esté aquí no entra — y al devolver
 * `null` en vez de lanzar, un `?c=` inventado degrada al comportamiento de
 * siempre en lugar de romper el enlace.
 */
export function cuentaDeRed(red: string | null | undefined): string | null {
  const clave = String(red ?? '').trim().toLowerCase();
  // `hasOwn` y no un acceso directo: `CUENTAS_POR_RED['constructor']` devuelve
  // la función heredada del prototipo —truthy— y acabaría escrita como
  // `utm_source` desde la query de un enlace público.
  return Object.hasOwn(CUENTAS_POR_RED, clave) ? CUENTAS_POR_RED[clave] : null;
}

/**
 * Construye la URL final con las UTMs selladas.
 * Si el destino ya trae parámetros, se conservan.
 *
 * `red` gana a `pieza.source`: es dónde se publicó DE VERDAD el enlace, mientras
 * que `source` solo es el valor por defecto de la pieza.
 */
export function urlConAtribucion(slug: string, pieza: Pieza, red?: string | null): string {
  const url = new URL(pieza.destino);
  url.searchParams.set('utm_source', cuentaDeRed(red) ?? pieza.source ?? CUENTA_POR_DEFECTO);
  url.searchParams.set('utm_medium', pieza.medium ?? 'reel');
  url.searchParams.set('utm_campaign', pieza.campaign);
  url.searchParams.set('utm_content', slug);
  return url.toString();
}
