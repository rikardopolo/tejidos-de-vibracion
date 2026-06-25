/**
 * purchase-token.mjs · Token HMAC de COMPRA (nivel 2/3 + scope de productos).
 *
 * Distinto del token de registro (token.ts, nivel 1): este codifica el nivel de
 * acceso pagado y los slugs comprados. Formato `body.sig` (un punto), donde body
 * = base64url(JSON). Se distingue del de registro —un único blob base64url SIN
 * puntos— por la cantidad de puntos, así ambos coexisten en la cookie tejedor-access.
 *
 * Lógica pura, testeable con `node --test`. Firma HMAC-SHA256, comparación
 * timing-safe. TTL largo (1 año): el acceso pagado dura más que el de registro.
 */
import crypto from 'node:crypto';

const TTL_MS = 365 * 24 * 60 * 60 * 1000; // 1 año

const enc = (s) => Buffer.from(s, 'utf8').toString('base64url');
const dec = (b) => Buffer.from(b, 'base64url').toString('utf8');

/**
 * @param {{ email: string, nivel: 2|3, slugs: string[], orderId?: string|null }} claims
 * @param {string} secret
 * @returns {string}
 */
export function generatePurchaseToken(claims, secret) {
  const payload = {
    e: String(claims.email).toLowerCase().trim(),
    n: claims.nivel,
    s: Array.isArray(claims.slugs) ? claims.slugs : [],
    o: claims.orderId ?? null,
    t: Date.now(),
  };
  const body = enc(JSON.stringify(payload));
  const sig = crypto.createHmac('sha256', secret).update(body).digest('hex');
  return `${body}.${sig}`;
}

/**
 * @param {string} token
 * @param {string} secret
 * @returns {{valid:true,email:string,nivel:2|3,slugs:string[],orderId:string|null,issuedAt:number}|{valid:false,reason:'malformed'|'bad_signature'|'expired'}}
 */
export function verifyPurchaseToken(token, secret) {
  if (typeof token !== 'string' || !secret) return { valid: false, reason: 'malformed' };
  const dot = token.indexOf('.');
  // Debe haber EXACTAMENTE un punto (body.sig). 0 puntos = token de registro.
  if (dot <= 0 || token.indexOf('.', dot + 1) !== -1) return { valid: false, reason: 'malformed' };

  const body = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = crypto.createHmac('sha256', secret).update(body).digest('hex');
  const a = Buffer.from(sig, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return { valid: false, reason: 'bad_signature' };

  let payload;
  try {
    payload = JSON.parse(dec(body));
  } catch {
    return { valid: false, reason: 'malformed' };
  }
  if (!payload || typeof payload.e !== 'string' || (payload.n !== 2 && payload.n !== 3)) {
    return { valid: false, reason: 'malformed' };
  }
  if (typeof payload.t !== 'number' || Date.now() - payload.t > TTL_MS) {
    return { valid: false, reason: 'expired' };
  }
  return {
    valid: true,
    email: payload.e,
    nivel: payload.n,
    slugs: Array.isArray(payload.s) ? payload.s : [],
    orderId: payload.o ?? null,
    issuedAt: payload.t,
  };
}

/** ¿El token tiene forma de token de compra (exactamente un punto)? */
export function looksLikePurchaseToken(token) {
  if (typeof token !== 'string') return false;
  const dot = token.indexOf('.');
  return dot > 0 && token.indexOf('.', dot + 1) === -1;
}
