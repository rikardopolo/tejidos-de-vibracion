/**
 * custom-suscripcion.mjs · `custom` FIRMADO del checkout de la suscripción (S-13).
 * Plan v2 §7.6; plan de implementación, bloque S-13 (puntos 3 y 4).
 *
 * El checkout del libro manda a Lemon Squeezy `checkout_data.custom` =
 * `{account_id, nonce, iat, sig}` (todo en string: LS devuelve string aunque se le
 * mande un número), y LS lo devuelve en `meta.custom_data` de TODOS los eventos de la
 * suscripción. Con él, el webhook ata el pago a la CUENTA que lo inició, nunca a un
 * correo parecido.
 *
 *   sig = HMAC-SHA256(LS_CUSTOM_SECRET, `${account_id}|${nonce}|${iat}`) en hex
 *
 * `LS_CUSTOM_SECRET` es solo del libro, distinto por entorno y de tipo Sensitive; con
 * menos de 32 caracteres (o sin él) ni se firma ni se acepta nada. `iat` en SEGUNDOS;
 * el webhook no acepta un `custom` de más de 7 días (la misma ventana en la que la
 * purga conserva los intentos sin usar). El `nonce` es de un solo uso: su fila en
 * `checkout_intentos` se consume con un CAS en el webhook.
 *
 * Lógica pura, testeable con `node --test`.
 */
import crypto from 'node:crypto';

export const CUSTOM_SECRETO_MIN = 32;
/** Edad máxima de un `custom` al llegar al webhook. */
export const CUSTOM_MAX_EDAD_S = 7 * 24 * 60 * 60;
// Un `iat` en el futuro solo se tolera por desfase de relojes.
const HOLGURA_FUTURO_S = 5 * 60;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NONCE = /^[A-Za-z0-9_-]{32,128}$/;
const IAT = /^[0-9]{1,12}$/;
const HEX64 = /^[0-9a-f]{64}$/;

/** El secreto recortado si vale (≥ 32 caracteres), o `null`. */
export function secretoCustomValido(valor) {
  if (typeof valor !== 'string') return null;
  const s = valor.trim();
  return s.length >= CUSTOM_SECRETO_MIN ? s : null;
}

/** Nonce de un solo uso: 32 bytes aleatorios en base64url (43 caracteres). */
export function nuevoNonce() {
  return crypto.randomBytes(32).toString('base64url');
}

function mensaje(accountId, nonce, iat) {
  return `${String(accountId).toLowerCase()}|${nonce}|${iat}`;
}

/** HMAC-SHA256 hex de `account_id|nonce|iat`. */
export function firmaCustom(accountId, nonce, iat, secret) {
  return crypto.createHmac('sha256', secret).update(mensaje(accountId, nonce, iat), 'utf8').digest('hex');
}

/**
 * `custom` listo para `checkout_data.custom` (valores string), o `null` si algo no vale.
 * @param {{ accountId: string, nonce: string, iat: number }} c
 * @param {string|null|undefined} secretRaw
 * @returns {{ account_id: string, nonce: string, iat: string, sig: string }|null}
 */
export function firmarCustom(c, secretRaw) {
  const secret = secretoCustomValido(secretRaw);
  if (!secret || !c) return null;
  if (typeof c.accountId !== 'string' || !UUID.test(c.accountId)) return null;
  if (typeof c.nonce !== 'string' || !NONCE.test(c.nonce)) return null;
  if (!Number.isInteger(c.iat) || c.iat < 0) return null;
  const accountId = c.accountId.toLowerCase();
  const iat = String(c.iat);
  return { account_id: accountId, nonce: c.nonce, iat, sig: firmaCustom(accountId, c.nonce, iat, secret) };
}

/**
 * Verifica el `custom` que vuelve en `meta.custom_data`: campos, firma en tiempo
 * constante y edad. No consulta la base (el CAS del nonce lo hace el webhook).
 * @param {unknown} custom
 * @param {string|null|undefined} secretRaw
 * @param {{ nowS: number, maxEdadS?: number }} opts
 * @returns {{ ok: true, accountId: string, nonce: string, iat: number }
 *   | { ok: false, motivo: 'sin_secreto'|'sin_custom'|'campos'|'firma'|'caducado'|'futuro' }}
 */
export function verificarCustom(custom, secretRaw, { nowS, maxEdadS = CUSTOM_MAX_EDAD_S }) {
  const secret = secretoCustomValido(secretRaw);
  if (!secret) return { ok: false, motivo: 'sin_secreto' };
  if (!custom || typeof custom !== 'object' || Array.isArray(custom)) return { ok: false, motivo: 'sin_custom' };

  const c = /** @type {Record<string, unknown>} */ (custom);
  const accountId = typeof c.account_id === 'string' ? c.account_id : '';
  const nonce = typeof c.nonce === 'string' ? c.nonce : '';
  const iatStr = typeof c.iat === 'string' || typeof c.iat === 'number' ? String(c.iat) : '';
  const sig = typeof c.sig === 'string' ? c.sig : '';
  if (!accountId && !nonce && !sig) return { ok: false, motivo: 'sin_custom' };
  if (!UUID.test(accountId) || !NONCE.test(nonce) || !IAT.test(iatStr) || !HEX64.test(sig)) {
    return { ok: false, motivo: 'campos' };
  }

  const esperada = Buffer.from(firmaCustom(accountId, nonce, iatStr, secret), 'utf8');
  const recibida = Buffer.from(sig, 'utf8');
  if (esperada.length !== recibida.length || !crypto.timingSafeEqual(esperada, recibida)) {
    return { ok: false, motivo: 'firma' };
  }

  const iat = Number(iatStr);
  if (iat > nowS + HOLGURA_FUTURO_S) return { ok: false, motivo: 'futuro' };
  if (nowS - iat > maxEdadS) return { ok: false, motivo: 'caducado' };
  return { ok: true, accountId: accountId.toLowerCase(), nonce, iat };
}
