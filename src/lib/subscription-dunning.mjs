/**
 * subscription-dunning.mjs · Candado de UNA SOLA VEZ para el correo de impago.
 *
 * Copia del patrón `claimAccesoEnvio` / `releaseAccesoEnvio`
 * (lemonsqueezy-webhook.mjs:122-156), sobre `subscriptions.dunning_enviado_at` en
 * vez de `orders.acceso_enviado_at`. El disparo (qué evento del proveedor lo
 * llama, con qué plantilla Brevo —BREVO_TEMPLATE_SUB_IMPAGO / _SUB_CERRADA— y
 * cuándo se vuelve a poner a null al recuperarse el pago) lo escribe el adaptador
 * en F3. Aquí solo vive el candado, agnóstico de proveedor.
 *
 * Por qué un candado y no `isFirstEffect`: Hotmart reenvía hasta 5 veces y LS 3;
 * un `PURCHASE_DELAYED` / `subscription_payment_failed` reprocesado mandaría el
 * aviso otra vez. Y si el correo falla, el reintento del proveedor debe poder
 * volver a intentarlo: por eso existe `release`.
 *
 * Lógica de DB pura (recibe el cliente por parámetro); testeable con un mock que
 * replique la semántica RETURNING de Postgres.
 */

/**
 * Reclama el derecho a enviar el aviso de impago de una suscripción, de forma
 * ATÓMICA: solo envía quien gana la carrera; el resto ve 0 filas afectadas.
 *
 * @param {{ from: (t: string) => any }} supabase  cliente supabase-js (o mock)
 * @param {string} subscriptionId  `subscriptions.id`
 * @returns {Promise<{claimed: boolean, error: any}>}
 */
export async function claimDunningEnvio(supabase, subscriptionId) {
  const { data, error } = await supabase
    .from('subscriptions')
    .update({ dunning_enviado_at: new Date().toISOString() })
    .eq('id', subscriptionId)
    // Solo una suscripción EN IMPAGO recibe el aviso. Sin este filtro, un evento de
    // impago reprocesado DESPUÉS de que el pago se recuperó (status ya 'active')
    // mandaría un aviso falso. Consulta el estado PERSISTIDO, no el del evento, así
    // que cubre las entregas fuera de orden y los reenvíos manuales.
    .eq('status', 'past_due')
    .is('dunning_enviado_at', null)
    .select('id');
  if (error) return { claimed: false, error };
  return { claimed: !!data && data.length > 0, error: null };
}

/**
 * Devuelve el derecho a enviar cuando el correo falló, para que el reintento del
 * proveedor pueda intentarlo de nuevo. Si esta liberación falla, degradamos al
 * comportamiento «no se reenvía» — nunca a algo peor.
 *
 * @returns {Promise<{error: any}>}
 */
export async function releaseDunningEnvio(supabase, subscriptionId) {
  const { error } = await supabase
    .from('subscriptions')
    .update({ dunning_enviado_at: null })
    .eq('id', subscriptionId)
    .select('id');
  return { error: error ?? null };
}
