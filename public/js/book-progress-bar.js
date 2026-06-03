/* Reading progress · scaleX segun scroll.
   Externalizado de BookReader.astro para cumplir CSP script-src 'self'. */
(function () {
  var bar = document.getElementById('book-progress');
  if (!bar) return;
  var update = function () {
    var h = document.documentElement;
    var max = h.scrollHeight - h.clientHeight;
    var ratio = max > 0 ? h.scrollTop / max : 0;
    bar.style.transform = 'scaleX(' + ratio + ')';
  };
  document.addEventListener('scroll', update, { passive: true });
  update();
})();
