/** DOI de /bienvenido: plantilla real y dobles de base/Brevo, sin red. */
import * as runtime from 'astro/runtime/server/index.js';
import { experimental_AstroContainer as Container } from 'astro/container';
import * as alta from './alta-libro.mjs';
import * as sesion from './sesion-tdv.mjs';
import { cargarModuloTs } from './endpoint.test-helper.mjs';
import { cargarAstro } from './astro.test-helper.mjs';

const Layout = { __esModule: true, default: runtime.createComponent((_r, _p, slots) => runtime.render`${slots.default?.()}`) };

export async function confirmarDoi({ activa, retirada = false, post = true, cartas = true, baja = false, falloPreferencias = null }) {
  const env = { TDV_SESION_ENABLED: String(activa), ACCESS_TOKEN_SECRET: 'falso', BREVO_API_KEY: 'falsa', BREVO_LISTA_LIBRO: '9' };
  const cuenta = cargarModuloTs(new URL('./cuenta-tdv.ts', import.meta.url), { './sesion-tdv.mjs': sesion }, { env });
  const contactos = [];
  const db = { from(tabla) {
    let escribe = false;
    const q = {
      select: () => q, eq: () => q, is: () => q, not: () => q, order: () => q, limit: () => q,
      update: () => { escribe = true; return q; }, insert: () => q,
      maybeSingle: async () => {
        if (tabla === 'events' && falloPreferencias === 'throw') throw new Error('lectura de preferencias simulada');
        return { error: tabla === 'events' && falloPreferencias === 'error' ? { message: 'fallo simulado' } : null,
          data: tabla === 'leads'
            ? escribe ? { id: 'lead-a' } : { id: 'lead-a', consent_text: alta.evidenciaConsentimiento({ cartas }), unsubscribed_at: baja ? '2026-10-18' : null }
            : retirada ? { metadata: { preferencias: { boletin: false }, estado: 'aplicado' } } : null };
      },
      then: (resolve) => Promise.resolve({ data: null, error: null }).then(resolve),
    };
    return q;
  } };
  const Pagina = await cargarAstro('src/pages/bienvenido.astro', {
    '@/lib/cuenta-tdv': cuenta, '@/layouts/LecturaLarga.astro': Layout,
    '@/lib/token': { verifyAccessToken: () => ({ valid: true, email: 'a@example.test', issuedAt: 123 }) },
    '@/lib/brevo': { addContactToList: async (o) => { contactos.push(o); return { ok: true }; } },
    '@/lib/supabase': { getServerClient: () => db }, '@/lib/alta-libro.mjs': alta,
  }, env);
  const container = await Container.create();
  const response = await container.renderToResponse(Pagina.default, { request: new Request('https://libro.test/bienvenido?t=token', post ? {
    method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: 't=token',
  } : {}) });
  // Astro adjunta sus cookies a la Response; el adaptador las serializa después.
  const cookies = Reflect.get(response, Symbol.for('astro.cookies'));
  return { html: await response.text(), cookie: cookies ? [...cookies.headers()].join('; ') : response.headers.get('set-cookie') ?? '', contactos };
}
