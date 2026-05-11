/**
 * brevo.ts · Helpers para la API de Brevo (email marketing).
 */
import { z } from 'zod';

const BREVO_API_BASE = 'https://api.brevo.com/v3';

export const leadSchema = z.object({
  nombre: z.string().min(2).max(100).trim(),
  email: z.string().email().max(254),
  honeypot: z.string().max(0),
});

export type Lead = z.infer<typeof leadSchema>;

interface BrevoContactPayload {
  email: string;
  listIds: number[];
  updateEnabled: boolean;
  attributes?: Record<string, string>;
  emailBlacklisted?: boolean;
  smsBlacklisted?: boolean;
}

export async function addContactToList(opts: {
  email: string;
  listId: number;
  apiKey: string;
  attributes?: Record<string, string>;
}): Promise<{ ok: true } | { ok: false; status: number; message: string }> {
  const { email, listId, apiKey, attributes } = opts;

  const payload: BrevoContactPayload = {
    email: email.toLowerCase().trim(),
    listIds: [listId],
    updateEnabled: true,
    attributes,
  };

  try {
    const res = await fetch(`${BREVO_API_BASE}/contacts`, {
      method: 'POST',
      headers: {
        accept: 'application/json',
        'api-key': apiKey,
        'content-type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    // 201 = created · 204 = updated · ambos son OK
    if (res.status === 201 || res.status === 204) {
      return { ok: true };
    }

    // 400 con "Contact already exists" también es OK (Brevo lo rechaza como duplicado)
    const text = await res.text();
    if (res.status === 400 && text.includes('already')) {
      return { ok: true };
    }

    return { ok: false, status: res.status, message: text.slice(0, 200) };
  } catch (e) {
    return { ok: false, status: 0, message: String(e).slice(0, 200) };
  }
}

// Rate limit en memoria (por hash de IP, 1 req / 60 s)
const ratebuckets = new Map<string, number>();
const RATE_WINDOW_MS = 60_000;

export function hashIp(ip: string): string {
  let h = 0;
  for (let i = 0; i < ip.length; i++) {
    h = (h << 5) - h + ip.charCodeAt(i);
    h |= 0;
  }
  return String(h);
}

export function isRateLimited(ipHash: string): boolean {
  const now = Date.now();
  const last = ratebuckets.get(ipHash);
  if (last && now - last < RATE_WINDOW_MS) {
    return true;
  }
  ratebuckets.set(ipHash, now);
  // Limpiar entradas antiguas ocasionalmente
  if (ratebuckets.size > 1000) {
    for (const [k, t] of ratebuckets.entries()) {
      if (now - t > RATE_WINDOW_MS * 2) ratebuckets.delete(k);
    }
  }
  return false;
}
