/* Obertura · TOC behavior · CSP-safe (script-src 'self').
   Cierra el panel al click fuera o ESC. */
(function () {
  var root = document.getElementById('obertura-toc');
  if (!root) return;
  document.addEventListener('click', function (e) {
    if (!root.open) return;
    if (root.contains(e.target)) return;
    root.open = false;
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && root.open) root.open = false;
  });
})();
