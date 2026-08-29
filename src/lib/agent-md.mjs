/**
 * agent-md.mjs · negociación de contenido para agentes (acceptmarkdown.com).
 *
 * Superficie de esta fase (F1): el 404. Todo path desconocido cae al catch-all
 * del adapter (`_render` · status 404) y pasa por el middleware, que delega
 * aquí. La negociación de las páginas normales va por otra vía —rutas
 * inyectadas en `.vercel/output/config.json` antes del `handle: filesystem`,
 * porque un rewrite post-filesystem nunca gana al .html— y llega en F2.
 *
 * Módulo PURO (sin imports de `astro:*`) y en `.mjs` para poder testearlo con
 * `node --test` sin resolver módulos virtuales, igual que gate-decision.mjs.
 * El runtime y los tests comparten esta misma fuente: no hay drift posible.
 */

const SITE = 'https://tejidosdevibracion.com';

/**
 * Mapa de recuperación · fuente ÚNICA para las dos variantes del 404.
 *
 * La página (404.astro) y el cuerpo markdown (MD_404) se construyen los dos
 * desde aquí: si divergieran, un agente y un humano recibirían mapas
 * distintos del mismo sitio. Solo rutas públicas de nivel 0 que existen hoy
 * (el test agentic-readiness comprueba que cada una resuelve a una página
 * real; el capítulo, además, que siga publicado).
 */
export const RUTAS_404 = [
  { href: '/', label: 'Portada', desc: 'el umbral del libro' },
  { href: '/indice', label: 'Índice del Volumen I', desc: 'tres actos, diez capítulos' },
  { href: '/obertura', label: 'Obertura', desc: '15 piezas de lectura libre' },
  {
    href: '/capitulo/cap-1-universo-sinfonia',
    label: 'Capítulo 1 · Un universo hecho de sinfonía',
    desc: 'la historia secreta del sonido',
  },
  { href: '/sobre-el-libro', label: 'Sobre el libro', desc: 'qué es, cómo se publica y quién lo escribe' },
  { href: '/recibir', label: 'Recibir', desc: 'aviso por correo cuando se abre cada capítulo' },
  { href: '/comunidad', label: 'Comunidad', desc: 'la sala de los tejedores' },
  { href: '/contacto', label: 'Contacto', desc: 'al otro lado hay una persona' },
];

/** ¿El cliente pide markdown explícitamente? */
export function wantsMarkdown(accept) {
  return !!accept && accept.toLowerCase().includes('text/markdown');
}

/** Cuerpo markdown del 404 · corto, con el mapa de recuperación para agentes. */
export const MD_404 = `# 404 · Esta ruta no existe

La URL solicitada no existe en Tejidos de Vibración. El libro sí existe — solo esta ruta no.

## Dónde mirar

- [Guía para agentes · llms.txt](${SITE}/llms.txt) — qué contiene el libro y cuándo citarlo
- [Mapa del sitio · sitemap.xml](${SITE}/sitemap.xml) — todas las URLs canónicas
${RUTAS_404.map((r) => `- [${r.label}](${SITE}${r.href}) — ${r.desc}`).join('\n')}

Las páginas principales también sirven markdown con \`Accept: text/markdown\`.
`;

/**
 * Añade `Accept` al header Vary sin pisar valores existentes.
 * Comparación por TOKENS: un regex con \b daría falso positivo con
 * `Vary: Accept-Encoding` (el \b matchea el guion) y Accept no se añadiría.
 */
function addVaryAccept(headers) {
  const vary = headers.get('vary');
  if (!vary) {
    headers.set('vary', 'Accept');
    return;
  }
  const present = vary.split(',').some((t) => t.trim().toLowerCase() === 'accept');
  if (!present) headers.set('vary', `${vary}, Accept`);
}

/**
 * Post-procesa la respuesta del middleware: en 404 de páginas (nunca /api),
 * sirve markdown si el cliente lo pidió y marca `Vary: Accept` en ambas
 * variantes. Cualquier otra respuesta sale intacta (misma instancia).
 */
export function apply404Negotiation(pathname, accept, res) {
  if (res.status !== 404) return res;
  if (pathname === '/api' || pathname.startsWith('/api/')) return res;

  if (wantsMarkdown(accept)) {
    return new Response(MD_404, {
      status: 404,
      headers: {
        'content-type': 'text/markdown; charset=utf-8',
        'content-disposition': 'inline',
        vary: 'Accept',
      },
    });
  }
  addVaryAccept(res.headers);
  return res;
}
