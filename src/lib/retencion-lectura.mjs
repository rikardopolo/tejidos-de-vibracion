/**
 * retencion-lectura.mjs · TTL de los eventos de lectura del libro.
 *
 * `reading_events` guarda, por cada lector NO REGISTRADO (`lead_id` null), qué
 * sección abrió, hasta dónde scrolleó y cuántos ms estuvo — atado al
 * `tdv-session-id` de su navegador. No tenía TTL ni purga de ningún tipo: era
 * rastro de comportamiento de visitantes anónimos conservado indefinidamente.
 *
 * Mecanismo espejo del que ya usa el portal (`lib/tarot/retencion.ts`): purga
 * probabilística disparada desde una petición caliente, SIN cron. El repo
 * descartó `pg_cron` deliberadamente, así que no se reintroduce aquí.
 *
 * La lógica de corte es PURA y testeable; el efecto (Supabase) se inyecta.
 */

export const TTL_EVENTOS_DIAS = 90;

const DIA_MS = 24 * 60 * 60 * 1000;

/** Corte de purga como ISO string. Puro — testeable sin red ni reloj real. */
export function corteEventos(ahoraMs) {
  return new Date(ahoraMs - TTL_EVENTOS_DIAS * DIA_MS).toISOString();
}

/**
 * ¿Toca purgar en esta petición? 1 de cada 100, como el portal: reparte el coste
 * sin bloquear a nadie y sin necesitar un job.
 * `aleatorio` se inyecta para poder fijarlo en tests.
 */
export function tocaPurgar(aleatorio = Math.random()) {
  return aleatorio < 0.01;
}

/**
 * Purga NO crítica: un fallo aquí jamás debe afectar a la petición que la
 * disparó (el tracker responde 204 pase lo que pase). La próxima invocación
 * reintenta lo que quede.
 *
 * FUERA DE ALCANCE — esta función JAMÁS toca `reading_progress`: ese rollup es
 * el avance de lectura de una persona IDENTIFICADA, gobernado por su propia
 * política y por el DSAR. Solo se purga el stream crudo de eventos.
 */
export async function purgarEventosLectura(supabase, ahoraMs = Date.now()) {
  try {
    await supabase.from('reading_events').delete().lt('created_at', corteEventos(ahoraMs));
  } catch {
    // No crítico.
  }
}
