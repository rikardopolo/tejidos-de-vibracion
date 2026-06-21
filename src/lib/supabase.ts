/**
 * supabase.ts · Cliente Supabase server-only para TDV (libro).
 *
 * Backbone UNIFICADO: apunta al MISMO proyecto Supabase que el portal TDR.
 * Se usa solo en endpoints/páginas server-side (`/api/*`, SSR de `/bienvenido`)
 * para persistir el ciclo de vida del suscriptor y la lectura del libro.
 *
 * La CSP del libro NO se ve afectada: es una política de navegador; las llamadas
 * servidor→Supabase ocurren fuera del navegador.
 *
 * Patrón runtime-first (igual que gating.ts): `process.env` primero para que el
 * dashboard de Vercel sea la fuente de verdad sin rebuild; `import.meta.env`
 * como fallback en dev local. El cliente es lazy + memoizado y DEGRADA con
 * gracia (devuelve null si falta config) — la analítica nunca debe romper el
 * flujo del lector.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { readEnv } from './env';

let cached: SupabaseClient | null = null;

/** Devuelve el cliente server-only o `null` si falta configuración. */
export function getServerClient(): SupabaseClient | null {
  if (cached) return cached;
  const url = readEnv('PUBLIC_SUPABASE_URL');
  const secret = readEnv('SUPABASE_SECRET_KEY');
  if (!url || !secret) return null;
  cached = createClient(url, secret, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cached;
}

/** Igual que getServerClient pero lanza si no hay config · usar cuando la persistencia es obligatoria. */
export function requireServerClient(): SupabaseClient {
  const client = getServerClient();
  if (!client) {
    throw new Error(
      'Supabase server client no disponible — faltan PUBLIC_SUPABASE_URL / SUPABASE_SECRET_KEY',
    );
  }
  return client;
}
