/**
 * POST /api/track · Ingesta first-party de lectura del libro.
 *
 * First-party y CSP-safe: el navegador llama a same-origin (`connect-src 'self'`),
 * sin terceros, sin abrir la CSP. El cliente (`/reading-tracker.js`) envía lotes
 * con `navigator.sendBeacon` en visibilitychange/pagehide.
 *
 * Identidad: si hay cookie `tejedor-access` válida → resolvemos el `lead_id` del
 * suscriptor y actualizamos `reading_progress` (responde "¿leyó todo?"). Sin
 * cookie → solo stream anónimo en `reading_events` (funnel fragmento → registro).
 *
 * El TOTAL de secciones por unidad lo calcula el servidor desde las Content
 * Collections (autoritativo) — el cliente no puede inflar el progreso.
 *
 * Todo es best-effort: nunca lanza al cliente. Responde 204 siempre.
 */
import type { APIRoute } from 'astro';
import { z } from 'zod';
import { getCollection } from 'astro:content';
import { getServerClient } from '@/lib/supabase';
import { verifyAccessToken } from '@/lib/token';

export const prerender = false;

const readEnv = (key: string): string | undefined => {
  if (typeof process !== 'undefined' && process.env) {
    const p = process.env[key];
    if (p !== undefined && p !== '') return p;
  }
  const m = (import.meta.env as Record<string, string | undefined>)[key];
  if (m !== undefined && m !== '') return m;
  return undefined;
};

const eventSchema = z.object({
  type: z.enum(['page_view', 'section_progress', 'section_complete']),
  surface: z.enum(['obertura', 'capitulo']),
  chapter: z.string().min(1).max(120),
  section: z.string().max(120).optional().nullable(),
  scrollPct: z.number().int().min(0).max(100).optional(),
  dwellMs: z.number().int().min(0).max(86_400_000).optional(),
});

const bodySchema = z.object({
  sessionId: z.string().min(1).max(64),
  events: z.array(eventSchema).min(1).max(50),
});

// ─── Rate limit coarse en memoria · 120 lotes / 60 s por ip-hash ───────────
const buckets = new Map<string, { count: number; resetAt: number }>();
function allow(key: string, max: number, windowMs: number): boolean {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || now > b.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    if (buckets.size > 5000) for (const [k, v] of buckets) if (now > v.resetAt) buckets.delete(k);
    return true;
  }
  if (b.count >= max) return false;
  b.count++;
  return true;
}

function hashIp(ip: string): string {
  let h = 0;
  for (let i = 0; i < ip.length; i++) {
    h = ((h << 5) - h) + ip.charCodeAt(i);
    h |= 0;
  }
  return String(h);
}

// ─── Secciones autoritativas por unidad (total + slugs válidos) · memoizado ─
// Obertura: piezas `published` (status sí gatea aquí, default 'published').
// Capítulo: TODAS las secciones del capítulo salvo `portada`. El `status` por
//   sección NO gatea (lo hace el capítulo padre) y nacen 'draft' — filtrar por
//   status dejaría el total en ~0. Slugs hoja para cruzar con lo que envía el
//   cliente (currentSlug = slug-hoja).
const infoCache = new Map<string, { total: number; slugs: Set<string> }>();
async function sectionsInfo(surface: string, chapter: string): Promise<{ total: number; slugs: Set<string> }> {
  const key = `${surface}:${chapter}`;
  const cached = infoCache.get(key);
  if (cached) return cached;

  let slugs = new Set<string>();
  if (surface === 'obertura') {
    const entries = await getCollection('obertura', (e) => e.data.status === 'published');
    slugs = new Set(entries.map((e) => e.slug)); // obertura slug ya es hoja
  } else if (surface === 'capitulo') {
    const entries = await getCollection(
      'chapter-sections',
      (e) => e.data.chapter === chapter && e.data.kind !== 'portada',
    );
    slugs = new Set(entries.map((e) => e.slug.split('/').pop() ?? e.slug));
  }
  const info = { total: slugs.size, slugs };
  infoCache.set(key, info);
  return info;
}

const noContent = () => new Response(null, { status: 204 });

export const POST: APIRoute = async ({ request, cookies, clientAddress }) => {
  // Lectura lenient del body: sendBeacon puede mandar text/plain o blob json.
  let raw: unknown;
  try {
    raw = JSON.parse(await request.text());
  } catch {
    return noContent();
  }

  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) return noContent();

  const ipHash = hashIp(clientAddress || 'unknown');
  if (!allow(`track:${ipHash}`, 120, 60_000)) return noContent();

  const supabase = getServerClient();
  if (!supabase) return noContent(); // sin backbone configurado · no rompemos al lector

  // ── Identidad del lector (best-effort) ──────────────────────────────────
  let leadId: string | null = null;
  const secret = readEnv('ACCESS_TOKEN_SECRET');
  const cookieVal = cookies.get('tejedor-access')?.value;
  if (secret && cookieVal) {
    const res = verifyAccessToken(cookieVal, secret);
    if (res.valid) {
      try {
        const { data: lead } = await supabase
          .from('leads')
          .select('id')
          .eq('email', res.email)
          .maybeSingle();
        leadId = lead?.id ?? null;
      } catch {
        /* best-effort */
      }
    }
  }

  const { sessionId, events } = parsed.data;

  // ── 1. Stream crudo ─────────────────────────────────────────────────────
  try {
    await supabase.from('reading_events').insert(
      events.map((e) => ({
        lead_id: leadId,
        session_id: sessionId,
        event_type: e.type,
        surface: e.surface,
        chapter_slug: e.chapter,
        section_slug: e.section ?? null,
        scroll_pct: e.scrollPct ?? null,
        dwell_ms: e.dwellMs ?? null,
      })),
    );
  } catch (err) {
    console.error('[track] reading_events insert threw:', err);
  }

  // ── 2. Rollup de progreso · solo identificado ───────────────────────────
  if (leadId) {
    // Agrupar por unidad (surface + chapter); recoger secciones recién completadas.
    const units = new Map<string, { surface: string; chapter: string; done: Set<string> }>();
    for (const e of events) {
      const key = `${e.surface}::${e.chapter}`;
      if (!units.has(key)) units.set(key, { surface: e.surface, chapter: e.chapter, done: new Set() });
      if (e.type === 'section_complete' && e.section) units.get(key)!.done.add(e.section);
    }

    for (const { surface, chapter, done } of units.values()) {
      try {
        const { data: existing } = await supabase
          .from('reading_progress')
          .select('sections_done, completed_at, first_seen_at')
          .eq('lead_id', leadId)
          .eq('surface', surface)
          .eq('chapter_slug', chapter)
          .maybeSingle();

        const info = await sectionsInfo(surface, chapter);
        const prevDone: string[] = existing?.sections_done ?? [];
        // Intersecta con los slugs reales: ignora secciones inexistentes y
        // garantiza pct ≤ 100 aunque el cliente envíe ruido.
        const mergedDone = Array.from(new Set([...prevDone, ...done])).filter((s) => info.slugs.has(s));
        const total = info.total;
        const completed = mergedDone.length;
        const pct = total > 0 ? Math.min(100, Math.round((completed / total) * 100)) : 0;
        const nowIso = new Date().toISOString();
        const completedAt =
          total > 0 && completed >= total ? (existing?.completed_at ?? nowIso) : null;

        await supabase.from('reading_progress').upsert(
          {
            lead_id: leadId,
            surface,
            chapter_slug: chapter,
            sections_total: total,
            sections_done: mergedDone,
            sections_completed: completed,
            pct_complete: pct,
            first_seen_at: existing?.first_seen_at ?? nowIso,
            last_seen_at: nowIso,
            completed_at: completedAt,
          },
          { onConflict: 'lead_id,surface,chapter_slug' },
        );
      } catch (err) {
        console.error('[track] reading_progress upsert threw:', err);
      }
    }
  }

  return noContent();
};

export const ALL: APIRoute = () =>
  new Response(JSON.stringify({ error: 'method_not_allowed' }), {
    status: 405,
    headers: { Allow: 'POST' },
  });
