/**
 * /posthog-init.js · sirve el snippet de inicialización de PostHog como
 * JavaScript EXTERNO, no inline.
 *
 * Por qué externo: la CSP del sitio (`vercel.json`) es `script-src 'self'`, sin
 * `'unsafe-inline'`. Un `<script is:inline>` con el snippet quedaría bloqueado
 * por el navegador y la analítica estaría "instalada" pero muda — que es
 * exactamente el fallo que este trabajo viene a corregir. Sirviéndolo desde una
 * ruta propia, no hay que abrir la CSP ni un milímetro.
 *
 * La clave `phc_*` es PÚBLICA por diseño de PostHog (viaja al navegador en
 * cualquier integración), así que servirla desde aquí no expone nada.
 *
 * ─── LA CONFIGURACIÓN LA MANDA LA POLÍTICA DE PRIVACIDAD ───────────────────
 * `src/pages/privacidad.astro` ya declara ante el usuario:
 *   «Analítica anónima (PostHog, servidores en la UE). Medimos páginas vistas y
 *    uso agregado. Por defecto están desactivados Session Replay, Autocapture y
 *    Heatmaps.»
 * Eso no es una preferencia técnica: es un compromiso publicado. De ahí salen
 * `autocapture:false`, `disable_session_recording:true`, `enable_heatmaps:false`
 * y `person_profiles:'identified_only'`. No activar ninguno sin cambiar antes
 * la política.
 *
 * ─── POR QUÉ ADEMÁS HAY UN `before_send` ───────────────────────────────────
 * Bloquear cabeceras en el proxy no basta: el SDK compone la URL DENTRO del
 * evento (`$current_url`, `$referrer`, y los `$initial_*`, que se persisten).
 * Como `/acceso/<producto>` recibe el token de compra por `?t=`, ese token
 * acababa en el payload. `limpiarEvento` lo redacta antes de salir.
 *
 * Va serializado con `.toString()` porque el navegador recibe el TEXTO de este
 * snippet, no el módulo — de ahí que la función tenga que ser autocontenida.
 * Esa restricción está probada en `posthog-scrub.test.mjs`, no solo comentada.
 */
import type { APIRoute } from 'astro';
import { limpiarEvento } from '@/lib/posthog-scrub.mjs';

export const prerender = false;

export const GET: APIRoute = () => {
  const key = import.meta.env.PUBLIC_POSTHOG_KEY;
  // Same-origin: el proxy de /api/ingest evita que los bloqueadores de rastreo
  // (uBlock, Brave, Privacy Badger) tumben el ingest, que en un sitio de
  // divulgación es una porción nada trivial de la audiencia.
  const apiHost = '/api/ingest';
  const uiHost = import.meta.env.PUBLIC_POSTHOG_HOST ?? 'https://eu.posthog.com';

  if (!key) {
    // Sin clave no se rompe nada: simplemente no se inicializa.
    return new Response('// PostHog desactivado (falta PUBLIC_POSTHOG_KEY)\n', {
      status: 200,
      headers: {
        'Content-Type': 'application/javascript; charset=utf-8',
        'Cache-Control': 'public, max-age=60, s-maxage=300',
      },
    });
  }

  const script = `!function(t,e){var o,n,p,r;e.__SV||(window.posthog=e,e._i=[],e.init=function(i,s,a){function g(t,e){var o=e.split(".");2==o.length&&(t=t[o[0]],e=o[1]),t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}}(p=t.createElement("script")).type="text/javascript",p.crossOrigin="anonymous",p.async=!0,p.src=s.api_host.replace(".i.posthog.com","-assets.i.posthog.com")+"/static/array.js",(r=t.getElementsByTagName("script")[0]).parentNode.insertBefore(p,r);var u=e;for(void 0!==a?u=e[a]=[]:a="posthog",u.people=u.people||[],u.toString=function(t){var e="posthog";return"posthog"!==a&&(e+="."+a),t||(e+=" (stub)"),e},u.people.toString=function(){return u.toString(1)+".people (stub)"},o="init capture register register_once register_for_session unregister unregister_for_session getFeatureFlag getFeatureFlagPayload isFeatureEnabled reloadFeatureFlags updateEarlyAccessFeatureEnrollment getEarlyAccessFeatures on onFeatureFlags onSessionId getSurveys getActiveMatchingSurveys renderSurvey canRenderSurvey getNextSurveyStep identify setPersonProperties group resetGroups setPersonPropertiesForFlags resetPersonPropertiesForFlags setGroupPropertiesForFlags resetGroupPropertiesForFlags reset opt_in_capturing opt_out_capturing has_opted_in_capturing has_opted_out_capturing clear_opt_in_out_capturing startSessionRecording stopSessionRecording sessionRecordingStarted captureException loadToolbar get_property getSessionProperty createPersonProfile opt_in_session_recording opt_out_session_recording has_opted_in_session_recording has_opted_out_session_recording clear_opt_in_out_session_recording".split(" "),n=0;n<o.length;n++)g(u,o[n]);e._i.push([i,s,a])},e.__SV=1)}(document,window.posthog||[]);
// La init dispara la descarga de array.js (~70 KB). Se difiere a idle O a la
// primera interacción, lo que llegue antes, para no competir con el LCP en
// móvil — este es un sitio de lectura larga y el primer render manda.
// El stub de arriba ya expone window.posthog: cualquier capture temprano se
// encola y se vacía cuando init corre, así que no se pierde ningún evento.
// requestIdleCallback no existe en iOS Safari < 18.4 → fallback a setTimeout.
// El timeout de 4 s es la red de seguridad: un rebote rápido SIN interacción
// manda igualmente su pageview.
!function(){
  var booted=false;
  var boot=function(){
    if(booted)return;booted=true;
    posthog.init(${JSON.stringify(key)}, {
      api_host: ${JSON.stringify(apiHost)},
      ui_host: ${JSON.stringify(uiHost)},
      capture_pageview: true,
      person_profiles: 'identified_only',
      autocapture: false,
      disable_session_recording: true,
      enable_heatmaps: false,
      disable_surveys: true,
      before_send: ${limpiarEvento.toString()}
    });
  };
  (window.requestIdleCallback||function(c){return setTimeout(c,1)})(boot,{timeout:4000});
  ['pointerdown','keydown','scroll'].forEach(function(ev){document.addEventListener(ev,boot,{once:true,passive:true});});
}();
`;

  return new Response(script, {
    status: 200,
    headers: {
      'Content-Type': 'application/javascript; charset=utf-8',
      'Cache-Control': 'public, max-age=300, s-maxage=3600, must-revalidate',
    },
  });
};
