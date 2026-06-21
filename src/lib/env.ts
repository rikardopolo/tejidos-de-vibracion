/**
 * env.ts · Lectura de variables de entorno robusta a runtime/build-time.
 *
 * Vite inlines `import.meta.env.X` en build time; si la var tenía un valor
 * "stale" o vacío entonces, queda hardcoded en el bundle y nunca refleja
 * cambios posteriores en el dashboard de Vercel.
 *
 * `process.env[key]` con bracket-notation no es estáticamente analizable
 * por Vite y se evalúa en runtime en Node (Vercel Serverless), garantizando
 * que los valores actuales del dashboard se apliquen sin rebuild.
 */

/** Lee una env var respetando runtime PRIMERO, build-time como fallback. */
export function readEnv(key: string): string | undefined {
  // Runtime first (Vercel dashboard como fuente de verdad)
  if (typeof process !== 'undefined' && process.env) {
    const fromProc = process.env[key];
    if (fromProc !== undefined && fromProc !== '') return fromProc;
  }
  // Fallback a build-time (útil en dev local con .env file)
  const fromMeta = (import.meta.env as Record<string, string | undefined>)[key];
  if (fromMeta !== undefined && fromMeta !== '') return fromMeta;
  return undefined;
}
