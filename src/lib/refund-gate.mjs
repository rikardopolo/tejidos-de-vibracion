/**
 * refund-gate.mjs · Decisión (PURA) de si un token de COMPRA sigue vigente.
 *
 * El token firmado (purchase-token.mjs) prueba que hubo compra, pero es un HMAC de
 * 1 año que no "sabe" de reembolsos. La fuente de verdad de la revocación es
 * `orders.status`, igual que en el portal.
 *
 * POLÍTICA MIXTA (decidida 31-jul-2026, ajustada 7-oct-2026 en S-05):
 *
 *   - Error de CONSULTA (caída de Supabase, timeout de 2 s) → fail-OPEN, por
 *     ahora. Una caída no debe dejar sin su libro a quien lo pagó, y el
 *     contenido ya está escrito: servirlo de más no genera coste. Aquí el libro
 *     diverge a propósito del portal, donde cada petición gasta LLM y por eso su
 *     `decidirAcceso` es fail-closed en este mismo caso. S-13 sustituye esta
 *     apertura por la marca firmada `ent` (24 h como máximo).
 *
 *   - CONFIGURACIÓN ROTA (sin cliente: faltan PUBLIC_SUPABASE_URL o
 *     SUPABASE_SECRET_KEY) → fail-CLOSED (C8). No es una caída pasajera sino un
 *     despliegue mal configurado: abrir ahí regalaba el nivel de pago a todo
 *     token —también a los reembolsados— mientras durase. El aviso a Sentry lo
 *     da quien llama (`gating.ts`), que es quien sabe que la config está rota.
 *
 *   - Fallo de DATO (sin orderId, orden ausente, o status != 'paid')
 *     → fail-CLOSED. Si se pudo mirar y el dato no respalda la compra, se revoca.
 *
 * El caso "sin orderId" se cierra porque no es verificable NUNCA, y el único
 * emisor de tokens (el webhook de Lemon Squeezy) siempre lo incluye: un token de
 * compra sin orderId es forjado o de un formato que ya no circula.
 *
 * Lógica pura, testeable con `node --test`.
 *
 * @param {{ nivel: 2|3, slugs: string[] }} granted  acceso que otorga el token firmado
 * @param {{ orderId: string|null, hasClient: boolean, queryError: boolean, order: { status: string }|null }} ctx
 * @returns {{ nivel: 0|2|3, slugs: string[] }}
 */
export function resolveRefundGate(granted, ctx) {
  if (!ctx.orderId) return revocado();
  if (!ctx.hasClient) return revocado(); // configuración rota → cerrado (C8)
  // Error de consulta → sigue abierto hasta S-13, que lo sustituye por la marca `ent`.
  if (ctx.queryError) return granted;
  return ctx.order && ctx.order.status === 'paid' ? granted : revocado();
}

// Objeto nuevo en cada llamada: devolver una constante compartida invita a que un
// caller la mute y contamine la siguiente decisión.
function revocado() {
  return { nivel: 0, slugs: [] };
}
