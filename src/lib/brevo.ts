/**
 * brevo.ts · Helpers para la API de Brevo (email marketing + transactional).
 *
 * NO usamos createDoiContact porque Brevo exige un "DOI template" registrado
 * oficialmente. Usamos sendTransacEmail con un link DOI custom controlado por
 * nosotros (apunta a /bienvenido?t=HMAC_TOKEN). Tras la confirmación añadimos
 * el contacto a la lista #9 → workflow → bienvenida.
 */
import { z } from 'zod';

const BREVO_API_BASE = 'https://api.brevo.com/v3';

/**
 * Añade un contacto a una lista de Brevo SOLO si el ID de lista viene por env.
 * ponytail: sin ID configurado salta con console.warn — el tag NUNCA rompe el
 * webhook ni bloquea el cobro/entitlement (que dependen de `orders`, no de Brevo).
 * No lanza: best-effort por diseño.
 */
export async function tagContactSafe(opts: {
  email: string;
  listId: number | undefined;
  apiKey: string | undefined;
  label: string;
}): Promise<void> {
  if (!opts.apiKey) {
    console.warn(`[Brevo tag] sin BREVO_API_KEY · salto tag ${opts.label}`);
    return;
  }
  if (!opts.listId || Number.isNaN(opts.listId)) {
    console.warn(`[Brevo tag] sin listId para ${opts.label} · salto (no rompe el webhook)`);
    return;
  }
  const res = await addContactToList({ email: opts.email, listId: opts.listId, apiKey: opts.apiKey });
  if (!res.ok) {
    console.warn(`[Brevo tag] ${opts.label} listId=${opts.listId} falló (no crítico): ${res.message}`);
  }
}

export const leadSchema = z.object({
  nombre: z.string().min(2).max(100).trim(),
  correo: z.string().email().max(254),
  acepto: z.literal(true),
  website: z.string().max(0),
});

export type Lead = z.infer<typeof leadSchema>;

/**
 * Crea (o actualiza) un contacto en Brevo SIN añadirlo a ninguna lista.
 * Usamos esto pre-confirmación: el contacto existe en Brevo pero el workflow
 * de bienvenida (asociado a la lista #9) no se dispara hasta que confirme.
 */
export async function upsertContact(opts: {
  email: string;
  apiKey: string;
  attributes?: Record<string, string>;
}): Promise<{ ok: true } | { ok: false; status: number; message: string }> {
  const payload = {
    email: opts.email.toLowerCase().trim(),
    updateEnabled: true,
    listIds: [] as number[],
    attributes: opts.attributes,
  };

  try {
    const res = await fetch(`${BREVO_API_BASE}/contacts`, {
      method: 'POST',
      headers: {
        'accept': 'application/json',
        'api-key': opts.apiKey,
        'content-type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const text = await res.text();
    console.log(`[Brevo upsertContact] status=${res.status} body=${text.slice(0, 200)}`);

    if (res.status === 201 || res.status === 204) return { ok: true };
    // Contact ya existe (200 ok or 400 with "exist" message)
    if (res.status === 400 && (text.includes('already') || text.includes('exist'))) {
      return { ok: true };
    }
    return { ok: false, status: res.status, message: text.slice(0, 300) };
  } catch (e) {
    console.error('[Brevo upsertContact] fetch threw:', e);
    return { ok: false, status: 0, message: String(e).slice(0, 300) };
  }
}

/**
 * Añade un contacto existente a una lista. Esto dispara cualquier workflow
 * configurado en Brevo con trigger "Contact added to list".
 */
export async function addContactToList(opts: {
  email: string;
  listId: number;
  apiKey: string;
}): Promise<{ ok: true } | { ok: false; status: number; message: string }> {
  try {
    const res = await fetch(`${BREVO_API_BASE}/contacts/lists/${opts.listId}/contacts/add`, {
      method: 'POST',
      headers: {
        'accept': 'application/json',
        'api-key': opts.apiKey,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ emails: [opts.email.toLowerCase().trim()] }),
    });

    const text = await res.text();
    console.log(`[Brevo addContactToList] status=${res.status} listId=${opts.listId} body=${text.slice(0, 200)}`);

    if (res.status === 201 || res.status === 204) return { ok: true };
    // El contacto ya está en la lista
    if (res.status === 400 && text.includes('already')) return { ok: true };
    return { ok: false, status: res.status, message: text.slice(0, 300) };
  } catch (e) {
    console.error('[Brevo addContactToList] fetch threw:', e);
    return { ok: false, status: 0, message: String(e).slice(0, 300) };
  }
}

/**
 * Envía un email transaccional usando una plantilla de Brevo.
 * Los placeholders en el template se rellenan con `params`:
 *   - {{params.NOMBRE}} → el nombre del usuario
 *   - {{params.CONFIRMATION_URL}} → URL custom para confirmar DOI
 */
export async function sendTransactionalEmail(opts: {
  to: { email: string; name?: string };
  templateId: number;
  params: Record<string, string>;
  apiKey: string;
}): Promise<{ ok: true; messageId?: string } | { ok: false; status: number; message: string }> {
  const payload = {
    to: [{ email: opts.to.email.toLowerCase().trim(), name: opts.to.name }],
    templateId: opts.templateId,
    params: opts.params,
  };

  try {
    const res = await fetch(`${BREVO_API_BASE}/smtp/email`, {
      method: 'POST',
      headers: {
        'accept': 'application/json',
        'api-key': opts.apiKey,
        'content-type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const text = await res.text();
    console.log(`[Brevo sendTransactionalEmail] status=${res.status} templateId=${opts.templateId} body=${text.slice(0, 200)}`);

    if (res.status === 201 || res.status === 200) {
      let messageId: string | undefined;
      try { messageId = JSON.parse(text).messageId; } catch { /* ignore */ }
      return { ok: true, messageId };
    }
    return { ok: false, status: res.status, message: text.slice(0, 300) };
  } catch (e) {
    console.error('[Brevo sendTransactionalEmail] fetch threw:', e);
    return { ok: false, status: 0, message: String(e).slice(0, 300) };
  }
}

// ─── Rate limit en memoria (1 req / 60 s por hash IP) ─────────────────────
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
