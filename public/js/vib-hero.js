/* vib-hero.js — ondas de "tejidos de vibración". Canvas 2D nativo, cero
   dependencias. Externo (script-src 'self'). Multi-canvas por id con presets
   (rediseño Umbral): #vib-hero y c-1a son INTERACTIVOS (animan al pasar el
   cursor + glow, se asientan a estático al cesar); c-6a y c-7a son AMBIENTALES
   (bucle lento continuo) pero conservan las guardas del original: DPR clamp 2,
   IntersectionObserver (pausa fuera de viewport), estático en táctil y en
   prefers-reduced-motion. #vib-hero mantiene su conducta EXACTA de hoy.
   ponytail: rAF activo solo cuando aporta y es visible; CPU ~0 en reposo. */
(function () {
  var reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  var touch = matchMedia('(hover: none)').matches;

  // Parámetros por canvas. #vib-hero = valores exactos del hero actual.
  // c-1a/c-6a/c-7a = tabla del handoff (waves.js), adaptada con guardas.
  var PRESETS = {
    'vib-hero': { lines: 5, ampBase: 10, ampStep: 26, alphaBase: 0.12, alphaStep: 0.22, alphaBoost: 0.15, yTop: 0.30, ySpan: 0.45, speed: 0.012, lineW: 0.6, mode: 'inter' },
    'c-1a':     { lines: 5, ampBase: 12, ampStep: 26, alphaBase: 0.10, alphaStep: 0.20, alphaBoost: 0.15, yTop: 0.34, ySpan: 0.42, speed: 0.008, lineW: 0.6, mode: 'inter' },
    'c-6a':     { lines: 4, ampBase: 10, ampStep: 20, alphaBase: 0.08, alphaStep: 0.16, alphaBoost: 0,    yTop: 0.42, ySpan: 0.36, speed: 0.007, lineW: 0.7, mode: 'amb' },
    'c-7a':     { lines: 3, ampBase: 8,  ampStep: 16, alphaBase: 0.05, alphaStep: 0.10, alphaBoost: 0,    yTop: 0.55, ySpan: 0.30, speed: 0.005, lineW: 0.7, mode: 'amb' }
  };

  function init(canvas, o) {
    var ctx = canvas.getContext('2d');
    if (!ctx) return;
    var interactive = o.mode === 'inter';
    var stage = canvas.closest('.vib-stage') || canvas.parentElement;
    var w = 0, h = 0, t = 1.2;
    var raf = 0, running = false, visible = true, lastMove = 0;
    var pointer = { x: 0.5, y: 0.5, active: false };

    function resize() {
      var dpr = Math.min(window.devicePixelRatio || 1, 2);
      var r = canvas.getBoundingClientRect();
      w = r.width; h = r.height;
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      drawFrame();
    }

    function drawFrame() {
      ctx.clearRect(0, 0, w, h);
      var px = pointer.x, py = pointer.y;
      var intensity = interactive ? (pointer.active ? 1 : 0.45) : 1;
      for (var i = 0; i < o.lines; i++) {
        var ratio = i / (o.lines - 1);
        var baseY = h * (o.yTop + ratio * o.ySpan);
        var ampFlat = o.ampBase + ratio * o.ampStep;
        var amp = interactive ? ampFlat * intensity * (1 + Math.abs(py - 0.5) * 1.4) : ampFlat;
        var freq = 0.006 + ratio * 0.004;
        var phase = t * (0.8 + ratio * 0.6) + (interactive ? (px - 0.5) * 6 : 0);
        var alpha = o.alphaBase + ratio * o.alphaStep;
        ctx.beginPath();
        for (var x = 0; x <= w; x += 6) {
          var y;
          if (interactive) {
            var dx = x - px * w;
            var boost = Math.exp(-(dx * dx) / (w * w * 0.04));
            y = baseY + Math.sin(x * freq + phase) * amp
                  + Math.sin(x * freq * 2.3 + phase * 1.4) * amp * 0.3 * boost;
          } else {
            y = baseY + Math.sin(x * freq + phase) * amp
                  + Math.sin(x * freq * 2.3 + phase * 1.4) * amp * 0.22;
          }
          if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        var g = ctx.createLinearGradient(0, 0, w, 0);
        g.addColorStop(0, 'rgba(212,160,23,0)');
        g.addColorStop(0.5, 'rgba(212,160,23,' + (alpha + o.alphaBoost) + ')');
        g.addColorStop(1, 'rgba(212,160,23,0)');
        ctx.strokeStyle = g;
        ctx.lineWidth = 1 + ratio * o.lineW;
        ctx.stroke();
      }
      if (interactive && pointer.active) {
        var gx = px * w, gy = py * h;
        var rg = ctx.createRadialGradient(gx, gy, 0, gx, gy, 140);
        rg.addColorStop(0, 'rgba(212,160,23,0.18)');
        rg.addColorStop(1, 'rgba(212,160,23,0)');
        ctx.fillStyle = rg;
        ctx.fillRect(0, 0, w, h);
      }
    }

    function loop() {
      t += o.speed;
      drawFrame();
      if (!visible) { running = false; raf = 0; return; }
      // interactivo: se asienta a estático tras la inactividad. ambiental: sigue.
      if (interactive && Date.now() - lastMove > 1500 && !pointer.active) {
        running = false; raf = 0; return;
      }
      raf = requestAnimationFrame(loop);
    }

    function start() {
      if (running || reduce || touch || !visible) return;
      running = true;
      raf = requestAnimationFrame(loop);
    }

    if (interactive) {
      var onMove = function (e) {
        var r = canvas.getBoundingClientRect();
        pointer.x = (e.clientX - r.left) / r.width;
        pointer.y = (e.clientY - r.top) / r.height;
        pointer.active = true;
        lastMove = Date.now();
        start();
      };
      var onLeave = function () { pointer.active = false; lastMove = Date.now(); };
      // El cursor se escucha en el contenedor (el canvas es pointer-events:none).
      stage.addEventListener('pointermove', onMove, { passive: true });
      stage.addEventListener('pointerleave', onLeave, { passive: true });
    }

    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (es) {
        visible = es[0].isIntersecting;
        if (!visible && raf) { cancelAnimationFrame(raf); raf = 0; running = false; }
        else if (visible) { if (!interactive || pointer.active) start(); }
      }, { threshold: 0 }).observe(canvas);
    }

    window.addEventListener('resize', resize, { passive: true });
    resize();                 // pinta el primer frame estático
    if (!interactive) start(); // ambiental arranca su bucle (guardas dentro de start)
  }

  Object.keys(PRESETS).forEach(function (id) {
    var c = document.getElementById(id);
    if (c) init(c, PRESETS[id]);
  });
})();
