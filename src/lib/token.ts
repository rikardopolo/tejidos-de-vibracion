/**
 * token.ts · HMAC SHA-256 tokens para acceso de tejedores.
 * TTL: 30 días. Verificación en tiempo constante (timingSafeEqual).
 */
import crypto from 'node:crypto';

const TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 días

export function generateAccessToken(email: string, secret: string): string {
  const normalizedEmail = email.toLowerCase().trim();
  const timestamp = Date.now().toString();
  const payload = `${normalizedEmail}.${timestamp}`;
  const signature = crypto.createHmac('sha256', secret).update(payload).digest('hex');
  return Buffer.from(`${payload}.${signature}`).toString('base64url');
}

export function verifyAccessToken(
  token: string,
  secret: string
): { valid: true; email: string; issuedAt: number } | { valid: false; reason: 'malformed' | 'bad_signature' | 'expired' } {
  try {
    const decoded = Buffer.from(token, 'base64url').toString('utf8');

    // El email puede contener puntos (ej. rikardo.polo@gmail.com), así que NO podemos
    // usar split('.') directamente. Parseamos desde la derecha:
    //   - últimos N chars hex (después del último '.') = firma (SHA-256 hex = 64 chars)
    //   - el bloque entre el penúltimo y último '.' = timestamp (epoch ms)
    //   - todo lo demás (antes del penúltimo '.') = email
    const lastDot = decoded.lastIndexOf('.');
    if (lastDot === -1) return { valid: false, reason: 'malformed' };
    const signature = decoded.slice(lastDot + 1);
    const beforeSig = decoded.slice(0, lastDot);

    const prevDot = beforeSig.lastIndexOf('.');
    if (prevDot === -1) return { valid: false, reason: 'malformed' };
    const timestampStr = beforeSig.slice(prevDot + 1);
    const email = beforeSig.slice(0, prevDot);

    if (!email || !timestampStr || !signature) {
      return { valid: false, reason: 'malformed' };
    }

    const expectedPayload = `${email}.${timestampStr}`;
    const expectedSig = crypto.createHmac('sha256', secret).update(expectedPayload).digest('hex');

    // Comparación en tiempo constante
    const sigBuf = Buffer.from(signature, 'hex');
    const expectedBuf = Buffer.from(expectedSig, 'hex');
    if (sigBuf.length !== expectedBuf.length) return { valid: false, reason: 'bad_signature' };
    if (!crypto.timingSafeEqual(sigBuf, expectedBuf)) return { valid: false, reason: 'bad_signature' };

    const issuedAt = parseInt(timestampStr, 10);
    if (Number.isNaN(issuedAt)) return { valid: false, reason: 'malformed' };
    if (Date.now() - issuedAt > TOKEN_TTL_MS) return { valid: false, reason: 'expired' };

    return { valid: true, email, issuedAt };
  } catch {
    return { valid: false, reason: 'malformed' };
  }
}
