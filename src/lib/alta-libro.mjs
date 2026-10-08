/**
 * alta-libro.mjs · Registro gratis del libro: boletín (opcional) + nivel 1 (S-15).
 *
 * Plan v2 §3.1 (paso 3), §7.8 y Fase 6; decisiones D11, D12 y D13. Lógica pura con la
 * E/S inyectada (mismo patrón que `resolverCallback` en salto-tdv.mjs): así el flujo
 * entero de `POST /api/leads/libro` se prueba con `node --test`.
 *
 * Qué cambia respecto del formulario anterior:
 *  - DOS casillas, las dos sin marcar (Decreto 1377, art. 7: el silencio no autoriza):
 *    la autorización de tratamiento (obligatoria) y las Cartas del Tejedor (opcional).
 *    Sin la segunda NO hay suscripción: ni contacto de marketing en Brevo ni alta en
 *    la lista al confirmar (`/bienvenido` lee la evidencia y la baja con `cartasVigentes`).
 *  - Nombre opcional, con saludo neutro si falta («Hola:», nunca «Hola ,»).
 *  - Esquema zod 3 propio del libro (`z.string().email()` es lo correcto en zod 3).
 *  - Evidencia: `leads.consent_text` guarda, en JSON, el texto y la versión de cada
 *    casilla ACEPTADA. `consent_at` lo pone la base al insertar.
 *  - Lead que ya existe (decisión abierta de S-05, aplicada aquí): el POST no está
 *    confirmado —cualquiera puede escribir un correo ajeno—, así que NO se escribe
 *    nada en su fila (ni evidencia, ni nombre, ni `unsubscribed_at`, ni ip/ua/geo, ni
 *    `source`) ni se reescribe su contacto de Brevo. Solo se reenvía el enlace.
 *
 * DESVÍO DELIBERADO, para que Ricardo lo confirme: el enlace se reenvía también a un
 * lead YA confirmado. El token de `/bienvenido` y la cookie `tejedor-access` duran 30
 * días, y volver a pasar por este formulario es como un lector del boletín recupera el
 * nivel 1 (en otro equipo, o al caducar). Sin reenvío, ese lector vería «Te enviamos un
 * correo» y no le llegaría nada. La respuesta es idéntica en todos los casos, así que
 * el formulario no revela si un correo está registrado.
 */
import { z } from 'zod';

export const NOMBRE_MAX = 100;
export const CORREO_MAX = 254;

/** Texto del enlace a la política dentro de la casilla obligatoria. */
export const ENLACE_PRIVACIDAD = 'Política de privacidad';

/**
 * Texto LITERAL de cada casilla, tal como lo ve el lector, y su versión. Es la
 * evidencia legal (Ley 1581, arts. 9 y 12a; Decreto 1377, art. 5): el formulario lo
 * pinta desde aquí y el endpoint lo guarda desde aquí, así no pueden divergir.
 * PROPUESTA pendiente de Ricardo y del abogado (D11). Si cambia un texto, cambia su
 * versión: el test fija la huella de cada texto y falla si no.
 */
export const CONSENT_TEXT_LIBRO = Object.freeze({
  autorizacion: Object.freeze({
    version: 'libro-autorizacion-2026-10-07',
    texto:
      'Acepto la Política de privacidad y autorizo el tratamiento de mis datos para darme acceso al libro y registrar mi avance de lectura con el fin de mejorarlo.',
  }),
  cartas: Object.freeze({
    version: 'libro-cartas-2026-10-07',
    texto: 'Quiero recibir por correo las Cartas del Tejedor y los avisos de nuevos capítulos.',
  }),
});

/**
 * Parte un texto en lo que va antes, dentro y después del enlace a la política.
 * @param {string} texto
 * @returns {{ antes: string, enlace: string, despues: string }}
 */
export function partirEnlace(texto) {
  const i = texto.indexOf(ENLACE_PRIVACIDAD);
  if (i < 0) return { antes: texto, enlace: '', despues: '' };
  return {
    antes: texto.slice(0, i),
    enlace: ENLACE_PRIVACIDAD,
    despues: texto.slice(i + ENLACE_PRIVACIDAD.length),
  };
}

// Caracteres de control (C0, DEL, C1) → espacio. Marcas de dirección (bidi) y
// espacios de anchura cero → fuera: no se ven y sirven para disfrazar texto en un
// correo. ZWJ/ZWNJ (‌, ‍) se conservan: los usan algunas escrituras.
const CONTROL = /[\u0000-\u001F\u007F-\u009F]/g;
const OCULTOS = /[​‎‏‪-‮⁠-⁩﻿]/g;
const SIN_CONTENIDO = /[\s‌‍]/g;

/**
 * Nombre limpio para guardar y saludar: sin controles ni caracteres invisibles, con
 * los espacios colapsados y recortado. `''` si no queda nada visible.
 * @param {unknown} v
 * @returns {string}
 */
export function limpiarNombre(v) {
  if (typeof v !== 'string') return '';
  const limpio = v.replace(CONTROL, ' ').replace(OCULTOS, '').replace(/\s+/g, ' ').trim();
  return limpio.replace(SIN_CONTENIDO, '') === '' ? '' : limpio;
}

/**
 * Saludo del correo, con el nombre o neutro. Mismo formato que `correo-vincular.mjs`.
 * @param {unknown} nombre
 * @returns {string}  «Hola, Ana:» o «Hola:»
 */
export function saludo(nombre) {
  const n = limpiarNombre(nombre).slice(0, NOMBRE_MAX);
  return n ? `Hola, ${n}:` : 'Hola:';
}

// `undefined` si no hay nombre visible; si lo hay, la versión limpia (y la longitud
// se comprueba DESPUÉS de limpiar, sobre lo que se guarda).
const nombreOpcional = z.preprocess(
  (v) => {
    if (v === undefined || v === null) return undefined;
    if (typeof v !== 'string') return v; // que falle como tipo
    return limpiarNombre(v) || undefined;
  },
  z
    .string()
    .max(NOMBRE_MAX)
    // Un nombre no lleva marcado: el nombre viaja a un correo que puede recibir otra
    // persona (quien escribe aquí un correo ajeno elige también el nombre).
    .refine((s) => !/[<>]/.test(s), { message: 'signos' })
    .optional(),
);

/** Esquema propio del alta del libro (zod 3). No es el `leadSchema` de antes. */
export const altaLibroSchema = z.object({
  correo: z.string().trim().email().max(CORREO_MAX),
  nombre: nombreOpcional,
  // Obligatoria y explícita: solo `true` (JSON). Ni «on», ni ausente, ni `false`.
  autorizacion: z.literal(true),
  // Opcional. Ausente = no la marcó.
  cartas: z.boolean().default(false),
  // Honeypot: debe venir vacío (un bot que lo llena recibe 400, como antes).
  website: z.string().max(0),
});

/**
 * @typedef {{ correo: string, nombre?: string, autorizacion: true, cartas: boolean, website: string }} AltaLibro
 */

/**
 * Valida el cuerpo del POST. Las UTM van fuera del esquema a propósito: son metadato
 * de atribución y no deben poder invalidar un alta (las lee el endpoint del cuerpo
 * crudo con `utmsSaneadas`).
 * @param {unknown} body
 * @returns {{ ok: true, datos: AltaLibro } | { ok: false, issues: string[] }}
 */
export function validarAltaLibro(body) {
  const r = altaLibroSchema.safeParse(body);
  if (r.success) return { ok: true, datos: /** @type {AltaLibro} */ (r.data) };
  const issues = [...new Set(r.error.issues.map((i) => i.path.join('.')))];
  return { ok: false, issues };
}

/**
 * Evidencia de consentimiento para `leads.consent_text`: el texto y la versión de
 * cada casilla aceptada. La autorización siempre (sin ella no se llega aquí); las
 * Cartas solo si se marcaron.
 * @param {{ cartas: boolean }} d
 * @returns {string}
 */
export function evidenciaConsentimiento({ cartas }) {
  const { autorizacion, cartas: c } = CONSENT_TEXT_LIBRO;
  /** @type {Record<string, { version: string, texto: string }>} */
  const ev = { autorizacion: { version: autorizacion.version, texto: autorizacion.texto } };
  if (cartas) ev.cartas = { version: c.version, texto: c.texto };
  return JSON.stringify(ev);
}

/**
 * Textos LITERALES que el formulario del libro guardó en `leads.consent_text` antes de
 * S-15 (git: `8d04d47` y `3c095a1`). Los dos eran una sola casilla que incluía recibir
 * los capítulos / las Cartas por correo, así que valen como «pidió las Cartas».
 * Los textos que escribe el PORTAL en la misma tabla (tarot, listas de espera, avisos
 * del laboratorio, su propio formulario del libro) NO están aquí: esas personas nunca
 * pidieron las Cartas del libro y no se las suscribe por usar este formulario.
 */
export const CONSENT_LEGADO_LIBRO = Object.freeze([
  'Acepto recibir los capítulos por correo y que se registre mi avance de lectura para mejorar el libro. Conozco la política de privacidad.',
  'Acepto recibir por correo los avisos de nuevos capítulos y las cartas del Tejedor, y que se registre mi avance de lectura para mejorar el libro. Conozco la política de privacidad.',
]);

/**
 * ¿La evidencia guardada incluye las Cartas?
 *  - JSON de S-15 (`{ autorizacion, cartas? }`): según la casilla.
 *  - Uno de los textos de antes del LIBRO (`CONSENT_LEGADO_LIBRO`): sí; así se conserva
 *    lo que pasa hoy con esos leads.
 *  - Cualquier otro texto (los del portal), vacío o ausente (sin fila, base caída): no.
 *    Sin evidencia de las Cartas no se suscribe a nadie.
 * @param {unknown} consentText
 * @returns {boolean}
 */
export function cartasAceptadas(consentText) {
  if (typeof consentText !== 'string' || consentText.trim() === '') return false;
  if (CONSENT_LEGADO_LIBRO.includes(consentText.trim())) return true;
  let ev;
  try {
    ev = JSON.parse(consentText);
  } catch {
    return false; // texto de otro formulario (portal): no pidió las Cartas del libro
  }
  if (ev && typeof ev === 'object' && !Array.isArray(ev) && 'autorizacion' in ev) {
    return !!ev.cartas && typeof ev.cartas === 'object' && typeof ev.cartas.version === 'string';
  }
  return false;
}

/**
 * ¿Hay que suscribir a las Cartas a esta fila de `leads`? Decide si `/bienvenido` da
 * de alta en la lista de Brevo al confirmar y si el alta asegura el contacto.
 * Exige la evidencia de las Cartas Y que no se haya dado de baja: `unsubscribed_at`
 * es una revocación posterior a la evidencia, y una nueva alta (que no reescribe la
 * evidencia ni la baja) no la deshace.
 * @param {{ consent_text?: unknown, unsubscribed_at?: unknown } | null | undefined} fila
 * @returns {boolean}
 */
export function cartasVigentes(fila) {
  if (!fila || typeof fila !== 'object') return false;
  if (fila.unsubscribed_at !== null && fila.unsubscribed_at !== undefined) return false;
  return cartasAceptadas(fila.consent_text);
}

/** Versiones aceptadas en este POST (para los eventos; no es la evidencia). */
function versiones(cartas) {
  return {
    autorizacion: CONSENT_TEXT_LIBRO.autorizacion.version,
    cartas: cartas ? CONSENT_TEXT_LIBRO.cartas.version : null,
  };
}

/**
 * Inserta el lead si es nuevo; si ya existe, lo LEE sin escribir nada.
 * @returns {Promise<
 *   | { existe: false, id: string|null }
 *   | { existe: true, id: string|null, confirmado: boolean|null, conCartas: boolean|null, nombre: string }
 *   | { existe: null }
 * >}  `existe: null` = no se sabe (sin cliente o error de la base).
 */
async function guardarLead(supabase, fila, log) {
  if (!supabase) return { existe: null };
  try {
    // Insert-si-no-existe ATÓMICO: UNIQUE(email) arbitra y, con ignoreDuplicates, no
    // devuelve fila si ya existía (ON CONFLICT DO NOTHING RETURNING).
    const { data: nuevas, error: insErr } = await supabase
      .from('leads')
      .upsert(fila, { onConflict: 'email', ignoreDuplicates: true })
      .select('id');
    if (insErr) {
      log.error('[leads/libro] supabase insert error:', insErr.message);
      return { existe: null };
    }
    if (nuevas && nuevas.length > 0) return { existe: false, id: nuevas[0]?.id ?? null };

    const { data: previa, error: selErr } = await supabase
      .from('leads')
      .select('id, name, confirmed_at, consent_text, unsubscribed_at')
      .eq('email', fila.email)
      .maybeSingle();
    if (selErr || !previa) {
      if (selErr) log.error('[leads/libro] supabase select error:', selErr.message);
      // Existe pero no se pudo leer: nada de su fila se usa (ni nombre ni Cartas).
      return { existe: true, id: null, confirmado: null, conCartas: null, nombre: '' };
    }
    return {
      existe: true,
      id: previa.id ?? null,
      confirmado: Boolean(previa.confirmed_at),
      conCartas: cartasVigentes(previa),
      nombre: limpiarNombre(previa.name),
    };
  } catch (err) {
    log.error('[leads/libro] supabase persistence threw:', err instanceof Error ? err.name : 'unknown');
    return { existe: null };
  }
}

async function evento(supabase, fila, log) {
  if (!supabase || !fila.lead_id) return;
  try {
    await supabase.from('events').insert(fila);
  } catch (err) {
    log.error(`[leads/libro] evento ${fila.type} threw:`, err instanceof Error ? err.name : 'unknown');
  }
}

/**
 * Registra un alta ya validada. Devuelve la respuesta HTTP (estado y cuerpo).
 *
 * @param {{
 *   datos: AltaLibro,
 *   utm: Record<string, string> | null,
 *   ipHash: string,
 *   userAgent: string | null,
 *   geo: { country: string | null, region: string | null },
 * }} entrada
 * @param {{
 *   supabase: any | null,
 *   upsertContact: (o: { email: string, attributes?: Record<string, string>, updateEnabled: boolean }) => Promise<{ ok: boolean }>,
 *   enviarEnlace: (o: { email: string, name?: string, params: Record<string, string> }) => Promise<{ ok: true, messageId?: string } | { ok: false }>,
 *   urlConfirmacion: (correo: string) => string,
 *   log?: { error: (...a: unknown[]) => void },
 * }} deps
 * @returns {Promise<{ status: number, body: Record<string, unknown> }>}
 */
export async function registrarAltaLibro(entrada, deps) {
  const { datos, utm, ipHash, userAgent, geo } = entrada;
  const { supabase, upsertContact, enviarEnlace, urlConfirmacion } = deps;
  const log = deps.log ?? console;

  // 0. Segunda barrera, por si alguien llama aquí sin pasar por `validarAltaLibro`:
  //    sin la autorización (`true` exacto) no se guarda nada ni sale ningún correo.
  if (!datos || datos.autorizacion !== true) {
    return { status: 400, body: { error: 'invalid_input', issues: ['autorizacion'] } };
  }

  // 1. La fila del alta, como si fuera nueva. Sobre una fila existente no se escribe.
  const fila = {
    email: datos.correo,
    source: 'libro',
    name: datos.nombre ?? null,
    consent_text: evidenciaConsentimiento({ cartas: datos.cartas }),
    ip_hash: ipHash,
    user_agent: userAgent,
    country: geo.country,
    region: geo.region,
  };
  const estado = await guardarLead(supabase, fila, log);

  // Nombre que se usa en el correo: el del formulario solo si la fila es NUEVA; el
  // guardado si ya existía (un tercero no elige cómo se saluda al titular); ninguno
  // si no se sabe.
  const nombre =
    estado.existe === false ? datos.nombre : estado.existe === true ? estado.nombre || undefined : undefined;

  // 2. Contacto de Brevo, SOLO con evidencia de las Cartas: la recién guardada, o la
  //    de una fila que ya existía (por si su contacto nunca llegó a crearse). Con
  //    `updateEnabled: false`, Brevo lo crea si falta y NUNCA reescribe uno existente
  //    (ni NOMBRE ni DOI_PENDIENTE). Sin lista: el workflow no arranca hasta confirmar.
  const conCartas =
    (estado.existe === false && datos.cartas) || (estado.existe === true && estado.conCartas === true);
  if (conCartas) {
    /** @type {Record<string, string>} */
    const attributes = { NIVEL: 'tejedor', FUENTE: 'registro-libro', DOI_PENDIENTE: 'true' };
    if (nombre) attributes.NOMBRE = nombre;
    const r = await upsertContact({ email: datos.correo, attributes, updateEnabled: false });
    if (!r.ok) {
      log.error('[leads/libro] Brevo upsertContact failed');
      return { status: 502, body: { error: 'brevo_failed' } };
    }
  }

  // 3. Eventos (best-effort). Debe existir el lead ANTES del correo, para que el
  //    webhook de Brevo (en el portal) cruce `email_delivered` con él.
  const leadId = estado.existe === null ? null : estado.id;
  if (estado.existe === false) {
    await evento(
      supabase,
      {
        lead_id: leadId,
        type: 'lead_created',
        source: 'api',
        metadata: {
          endpoint: 'leads/libro',
          ctaSource: 'libro',
          country: geo.country,
          region: geo.region,
          consentimiento: versiones(datos.cartas),
          // null cuando el visitante llegó sin UTMs: distinguir «no vino de una pieza»
          // de «no lo estábamos guardando».
          utm: utm ?? null,
        },
      },
      log,
    );
  } else if (estado.existe === true) {
    // Rastro de la repetición SIN tocar la evidencia: qué marcó este POST (que nadie
    // ha confirmado) y si la fila ya estaba confirmada.
    await evento(
      supabase,
      {
        lead_id: leadId,
        type: 'alta_repetida',
        source: 'api',
        metadata: {
          endpoint: 'leads/libro',
          confirmado: estado.confirmado,
          consentimiento_no_aplicado: versiones(datos.cartas),
        },
      },
      log,
    );
  }

  // 4. El enlace de confirmación (o de vuelta al nivel 1). Ver «DESVÍO» arriba.
  /** @type {Record<string, string>} */
  const params = { SALUDO: saludo(nombre), CONFIRMATION_URL: urlConfirmacion(datos.correo) };
  if (nombre) params.NOMBRE = nombre;
  const enviado = await enviarEnlace({ email: datos.correo, name: nombre, params });
  if (!enviado.ok) {
    log.error('[leads/libro] Brevo sendTransactionalEmail failed');
    return { status: 502, body: { error: 'email_send_failed' } };
  }

  await evento(
    supabase,
    {
      lead_id: leadId,
      type: 'email_sent',
      source: 'api',
      metadata: {
        endpoint: 'leads/libro',
        kind: 'doi',
        messageId: enviado.messageId ?? null,
        reenvio: estado.existe === true,
      },
    },
    log,
  );

  // Misma respuesta para un correo nuevo y para uno registrado (no se enumera).
  return {
    status: 201,
    body: { success: true, message: 'Te enviamos un correo. Revisa tu bandeja de entrada para confirmar.' },
  };
}
