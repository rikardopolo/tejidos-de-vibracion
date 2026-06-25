/* vib-hero.js — visualizador de "tejidos de vibración" detrás del título de la home.
   Canvas 2D nativo, cero dependencias. Externo (script-src 'self'). El bucle de
   dibujo es el de la propuesta; la cáscara React se sustituyó por esto + guardas
   de perf: DPR clamp 2, pausa al salir del viewport, calma por defecto (anima al
   pasar el cursor y se asienta a frame estático al cesar), estático en
   prefers-reduced-motion y en táctil. Verificación = el screenshot del hero.
   ponytail: bucle activo solo durante interacción + visible; CPU ~0 en reposo. */
(function () {
  var canvas = document.getElementById('vib-hero');
  if (!canvas) return;
  var ctx = canvas.getContext('2d');
  if (!ctx) return;
  var stage = canvas.closest('.vib-stage') || canvas.parentElement;

  var reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  var touch = matchMedia('(hover: none)').matches;
  var w = 0, h = 0;
  var pointer = { x: 0.5, y: 0.5, active: false };
  var t = 1.2;                 // forma estática inicial agradable (no plana)
  var raf = 0, running = false, visible = true, lastMove = 0;

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
    var intensity = pointer.active ? 1 : 0.45;
    var lines = 5, step = 6;
    for (var i = 0; i < lines; i++) {
      var ratio = i / (lines - 1);
      var baseY = h * (0.3 + ratio * 0.45);
      var amp = (10 + ratio * 26) * intensity * (1 + Math.abs(py - 0.5) * 1.4);
      var freq = 0.006 + ratio * 0.004;
      var phase = t * (0.8 + ratio * 0.6) + (px - 0.5) * 6;
      var alpha = 0.12 + ratio * 0.22;
      ctx.beginPath();
      for (var x = 0; x <= w; x += step) {
        var dx = x - px * w;
        var boost = Math.exp(-(dx * dx) / (w * w * 0.04));
        var y = baseY + Math.sin(x * freq + phase) * amp
              + Math.sin(x * freq * 2.3 + phase * 1.4) * amp * 0.3 * boost;
        if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      var g = ctx.createLinearGradient(0, 0, w, 0);
      g.addColorStop(0, 'rgba(212,160,23,0)');
      g.addColorStop(0.5, 'rgba(212,160,23,' + (alpha + 0.15) + ')');
      g.addColorStop(1, 'rgba(212,160,23,0)');
      ctx.strokeStyle = g;
      ctx.lineWidth = 1 + ratio * 0.6;
      ctx.stroke();
    }
    if (pointer.active) {
      var gx = px * w, gy = py * h;
      var rg = ctx.createRadialGradient(gx, gy, 0, gx, gy, 140);
      rg.addColorStop(0, 'rgba(212,160,23,0.18)');
      rg.addColorStop(1, 'rgba(212,160,23,0)');
      ctx.fillStyle = rg;
      ctx.fillRect(0, 0, w, h);
    }
  }

  function loop() {
    t += 0.012;
    drawFrame();
    if (!visible || (Date.now() - lastMove > 1500 && !pointer.active)) {
      running = false; raf = 0; return;       // se asienta a estático, CPU 0
    }
    raf = requestAnimationFrame(loop);
  }

  function start() {
    if (running || reduce || touch || !visible) return;
    running = true;
    raf = requestAnimationFrame(loop);
  }

  function onMove(e) {
    var r = canvas.getBoundingClientRect();
    pointer.x = (e.clientX - r.left) / r.width;
    pointer.y = (e.clientY - r.top) / r.height;
    pointer.active = true;
    lastMove = Date.now();
    start();
  }
  function onLeave() { pointer.active = false; lastMove = Date.now(); }

  if ('IntersectionObserver' in window) {
    new IntersectionObserver(function (es) {
      visible = es[0].isIntersecting;
      if (!visible && raf) { cancelAnimationFrame(raf); raf = 0; running = false; }
      else if (visible && pointer.active) start();
    }, { threshold: 0 }).observe(canvas);
  }

  window.addEventListener('resize', resize, { passive: true });
  // El cursor se escucha en el contenedor (el canvas es pointer-events:none,
  // así los clics del hero pasan a través).
  stage.addEventListener('pointermove', onMove, { passive: true });
  stage.addEventListener('pointerleave', onLeave, { passive: true });

  resize();   // pinta el primer frame estático
})();
