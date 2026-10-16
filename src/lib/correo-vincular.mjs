/**
 * correo-vincular.mjs · Correo «vincula tu suscripción» (S-13, C11).
 *
 * Cuando un pago de suscripción llega SIN `custom` válido (o con un nonce que no es
 * de esa cuenta), el webhook la guarda con `vinculo = 'pendiente'` y escribe UNA vez
 * al correo del pago. El libro no tiene `CODIGO_SECRET`: el correo solo lleva un
 * enlace a `tejidosderealidad.com/cuenta/vincular`, y el código `vincular_pago` lo
 * emite y lo canjea el portal, con sesión (S-14).
 *
 * Plantilla de Brevo si existe `BREVO_TEMPLATE_SUB_VINCULAR` (params `NOMBRE` y
 * `VINCULAR_URL`; la plantilla con click-tracking DESACTIVADO, regla de los
 * transaccionales). Si no, respaldo inline con el texto de aquí, desde
 * `BREVO_SENDER_EMAIL` o, si falta, `hola@tejidosderealidad.com` (el remitente del
 * portal en la misma cuenta de Brevo).
 *
 * Lógica pura, testeable con `node --test`.
 */

export const VINCULAR_URL = 'https://tejidosderealidad.com/cuenta/vincular';
export const REMITENTE_POR_DEFECTO = Object.freeze({ email: 'hola@tejidosderealidad.com', name: 'Tejidos de Vibración' });

/**
 * Cómo se envía, según el entorno. `null` si falta la API key de Brevo.
 * @param {(k: string) => string|undefined} leer
 * @returns {{ modo: 'plantilla', apiKey: string, templateId: number }
 *   | { modo: 'inline', apiKey: string, sender: { email: string, name: string } } | null}
 */
export function planCorreoVincular(leer) {
  const apiKey = leer('BREVO_API_KEY');
  if (!apiKey) return null;
  const plantilla = Number(leer('BREVO_TEMPLATE_SUB_VINCULAR'));
  if (Number.isInteger(plantilla) && plantilla > 0) return { modo: 'plantilla', apiKey, templateId: plantilla };
  const email = leer('BREVO_SENDER_EMAIL') || REMITENTE_POR_DEFECTO.email;
  const name = leer('BREVO_SENDER_NAME') || REMITENTE_POR_DEFECTO.name;
  return { modo: 'inline', apiKey, sender: { email, name } };
}

function escaparHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

/**
 * Texto del respaldo inline. Español neutro, tuteo.
 * @param {{ nombre?: string|null, url?: string }} [d]
 */
export function contenidoCorreoVincular({ nombre, url = VINCULAR_URL } = {}) {
  const n = typeof nombre === 'string' ? nombre.trim().slice(0, 100) : '';
  const saludo = n ? `Hola, ${n}:` : 'Hola:';
  const subject = 'Vincula tu suscripción a Tejidos de Vibración';
  const text = [
    saludo,
    '',
    'Recibimos el pago de tu suscripción a Tejidos de Vibración, pero no pudimos asociarlo a una cuenta.',
    'Para leer los capítulos de la suscripción, entra en tu cuenta y vincula el pago aquí:',
    url,
    '',
    'Te pediremos el correo con el que pagaste y te enviaremos un código para confirmarlo.',
    'Si no hiciste este pago, ignora este mensaje.',
    '',
    'Tejidos de Vibración',
  ].join('\n');
  const html = [
    `<p>${escaparHtml(saludo)}</p>`,
    '<p>Recibimos el pago de tu suscripción a <em>Tejidos de Vibración</em>, pero no pudimos asociarlo a una cuenta.</p>',
    `<p>Para leer los capítulos de la suscripción, entra en tu cuenta y vincula el pago: <a href="${escaparHtml(url)}">${escaparHtml(url)}</a></p>`,
    '<p>Te pediremos el correo con el que pagaste y te enviaremos un código para confirmarlo.</p>',
    '<p>Si no hiciste este pago, ignora este mensaje.</p>',
    '<p>Tejidos de Vibración</p>',
  ].join('\n');
  return { subject, text, html };
}
