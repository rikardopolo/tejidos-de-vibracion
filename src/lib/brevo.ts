/**
 * brevo.ts · Helpers para la API de Brevo (email marketing).
 * Double Opt-In (DOI) flow.
 */
import { z } from 'zod';

const BREVO_API_BASE = 'https://api.brevo.com/v3';

export const leadSchema = z.object({
  nombre: z.string().min(2).max(100).trim(),
  correo: z.string().email().max(254),
  acepto: z.literal(true),
  website: z.string().max(0),
});

export type Lead = z.infer<typeof leadSchema>;

interface DoiPayload {
  email: string;
  includeListIds: number[];
  templateId: number;
  redirectionUrl: string;
  attributes?: Record<string, string>;
}

export async function createDoiContact(opts: {
  email: string;
  apiKey: string;
  listId: number;
  templateId: number;
  redirectionUrl: string;
  attributes?: Record<string, string>;
}): Promise<{ ok: true } | { ok: false; status: number; message: string }> {
  const payload: DoiPayload = {
    email: opts.email.toLowerCase().trim(),
    includeListIds: [opts.listId],
    templateId: opts.templateId,
    redirectionUrl: opts.redirectionUrl,
    attributes: opts.attributes,
  };

  try {
    const res = await fetch(`${BREVO_API_BASE}/contacts/doubleOptinConfirmation`, {
      method: 'POST',
      headers: {
        'accept': 'application/json',
        'api-key': opts.apiKey,
        'content-type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (res.status === 201 || res.status === 204) {
      return { ok: true };
    }

    const text = await res.text();
    // Si el contacto ya existe y está pendiente, Brevo devuelve 400 — lo tratamos como éxito
    // (re-enviará el email de confirmación)
    if (res.status === 400 && (text.includes('already') || text.includes('exist'))) {
      return { ok: true };
    }

    return { ok: false, status: res.status, message: text.slice(0, 200) };
  } catch (e) {
    return { ok: false, status: 0, message: String(e).slice(0, 200) };
  }
}

// Rate limit en memoria (por hash de IP, 1 req / 60 s)
const rateBuckets = new Map<string, number>();
const RATE_WINDOW_MS = 60_000;

export function hashIp(ip: string): string {
  let h = 0;
  for (let i = 0; i < ip.length; i++) {
    h = ((h << 5) - h) + ip.charCodeAt(i);
    h |= 0;
  }
  return String(h);
}

export function isRateLimited(ipHash: string): boolean {
  const now = Date.now();
  const last = rateBuckets.get(ipHash);
  if (last && now - last < RATE_WINDOW_MS) return true;
  rateBuckets.set(ipHash, now);
  if (rateBuckets.size > 1000) {
    for (const [k, t] of rateBuckets.entries()) {
      if (now - t > RATE_WINDOW_MS * 2) rateBuckets.delete(k);
    }
  }
  return false;
}
