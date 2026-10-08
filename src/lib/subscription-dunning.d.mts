// Tipos sidecar para subscription-dunning.mjs (candado del aviso de impago).

/** Reclama ATÓMICAMENTE el derecho a enviar el aviso de impago de una suscripción. */
export function claimDunningEnvio(
  supabase: { from: (table: string) => any },
  subscriptionId: string,
): Promise<{ claimed: boolean; error: { message: string } | null }>;

/** Devuelve el derecho a enviar cuando el correo falló, para que el reintento lo recupere. */
export function releaseDunningEnvio(
  supabase: { from: (table: string) => any },
  subscriptionId: string,
): Promise<{ error: { message: string } | null }>;
