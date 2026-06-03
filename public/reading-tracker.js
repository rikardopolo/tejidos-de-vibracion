/* reading-tracker.js · Tejidos de Vibración
   Rastreo de lectura first-party. CSP-safe: script externo, sin eval, sin
   inline, sin terceros. Envía lotes a same-origin /api/track con sendBeacon
   (permitido por connect-src 'self'; no bloquea la navegación).

   Contexto desde <body data-track-surface|chapter|section> (lo emite BookReader
   solo en páginas de sección real). Identidad real la resuelve el servidor por
   la cookie del tejedor; aquí solo enviamos un session_id first-party.

   Señales:
     - page_view        · al cargar la sección
     - section_progress · al cruzar 25/50/75/100% de scroll
     - section_complete · scroll ≥90% con permanencia, o (sección corta) permanencia sola
*/
(function () {
  'use strict';

  var body = document.body;
  var surface = body.getAttribute('data-track-surface');
  var chapter = body.getAttribute('data-track-chapter');
  var section = body.getAttribute('data-track-section');
  if (!surface || !chapter || !section) return; // solo páginas de sección

  // ── session id estable first-party ───────────────────────────────────────
  var SID_KEY = 'tdv-session-id';
  var sessionId;
  try {
    sessionId = localStorage.getItem(SID_KEY);
    if (!sessionId) {
      sessionId = Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
      localStorage.setItem(SID_KEY, sessionId);
    }
  } catch (e) {
    sessionId = 'nostore-' + Date.now().toString(36);
  }

  var ENDPOINT = '/api/track';
  var queue = [];
  var sentComplete = false;
  var firedProgress = {};
  var maxScroll = 0;

  // ── permanencia visible (dwell) ───────────────────────────────────────────
  var dwellMs = 0;
  var visibleSince = document.visibilityState === 'visible' ? Date.now() : 0;
  function currentDwell() {
    return dwellMs + (visibleSince ? Date.now() - visibleSince : 0);
  }

  function evt(type, scrollPct) {
    queue.push({
      type: type,
      surface: surface,
      chapter: chapter,
      section: section,
      scrollPct: scrollPct,
      dwellMs: currentDwell(),
    });
  }

  function flush(useBeacon) {
    if (!queue.length) return;
    var batch = queue.splice(0, queue.length);
    var payload = JSON.stringify({ sessionId: sessionId, events: batch });
    try {
      if (useBeacon && navigator.sendBeacon) {
        navigator.sendBeacon(ENDPOINT, new Blob([payload], { type: 'application/json' }));
      } else {
        fetch(ENDPOINT, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: payload,
          keepalive: true,
          credentials: 'same-origin',
        });
      }
    } catch (e) {
      /* best-effort · la analítica nunca rompe la lectura */
    }
  }

  function scrollRatio() {
    var h = document.documentElement;
    var max = h.scrollHeight - h.clientHeight;
    if (max <= 0) return null; // sección no scrollable (cabe en viewport)
    return Math.min(100, Math.round((h.scrollTop / max) * 100));
  }

  function checkComplete() {
    if (sentComplete) return;
    var r = scrollRatio();
    var scrollable = r !== null;
    var dwell = currentDwell();
    var done =
      (scrollable && maxScroll >= 90 && dwell >= 5000) ||
      (!scrollable && dwell >= 12000);
    if (done) {
      sentComplete = true;
      evt('section_complete', scrollable ? maxScroll : 100);
      flush(true);
    }
  }

  // ── page_view inicial ─────────────────────────────────────────────────────
  evt('page_view', 0);

  // ── scroll → umbrales de progreso ─────────────────────────────────────────
  var THRESH = [25, 50, 75, 100];
  function onScroll() {
    var r = scrollRatio();
    if (r === null) return;
    if (r > maxScroll) maxScroll = r;
    for (var i = 0; i < THRESH.length; i++) {
      var t = THRESH[i];
      if (maxScroll >= t && !firedProgress[t]) {
        firedProgress[t] = true;
        evt('section_progress', maxScroll);
      }
    }
    checkComplete();
  }
  window.addEventListener('scroll', onScroll, { passive: true });

  // ── completado por permanencia (secciones cortas) ─────────────────────────
  var dwellTimer = setInterval(checkComplete, 4000);

  // ── visibilidad: acumula dwell + flush al ocultar ─────────────────────────
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'hidden') {
      if (visibleSince) {
        dwellMs += Date.now() - visibleSince;
        visibleSince = 0;
      }
      flush(true);
    } else if (!visibleSince) {
      visibleSince = Date.now();
    }
  });

  window.addEventListener('pagehide', function () {
    if (visibleSince) {
      dwellMs += Date.now() - visibleSince;
      visibleSince = 0;
    }
    checkComplete();
    flush(true);
    clearInterval(dwellTimer);
  });

  // primer cómputo (por si carga ya scrolleada o sección corta)
  onScroll();
})();
