/* Obertura · ReaderControls behavior · CSP-safe (script-src 'self').
   Wires font-size + theme buttons, persists to localStorage, handles
   outside-click + ESC close. */
(function () {
  var KEY_FONT  = 'obertura.fontSize';
  var KEY_THEME = 'obertura.theme';
  var root = document.getElementById('reader-controls');
  if (!root) return;
  var body = document.body;

  function setActive(group, value, attr) {
    var nodes = root.querySelectorAll('button[' + attr + ']');
    for (var i = 0; i < nodes.length; i++) {
      nodes[i].setAttribute('aria-pressed', String(nodes[i].getAttribute(attr) === value));
    }
  }
  function applyFont(size) {
    body.setAttribute('data-font-size', size);
    try { localStorage.setItem(KEY_FONT, size); } catch (_) {}
    setActive('font', size, 'data-font-size');
  }
  function applyTheme(theme) {
    body.setAttribute('data-theme', theme);
    try { localStorage.setItem(KEY_THEME, theme); } catch (_) {}
    setActive('theme', theme, 'data-theme');
  }

  /* Restore (defaults M / paper) and reflect aria-pressed */
  var fontSize = 'm', theme = 'paper';
  try {
    fontSize = localStorage.getItem(KEY_FONT) || 'm';
    theme    = localStorage.getItem(KEY_THEME) || 'paper';
  } catch (_) {}
  applyFont(fontSize);
  applyTheme(theme);

  /* Wire clicks */
  var fontBtns = root.querySelectorAll('button[data-font-size]');
  for (var i = 0; i < fontBtns.length; i++) {
    (function (btn) {
      btn.addEventListener('click', function () {
        applyFont(btn.getAttribute('data-font-size') || 'm');
      });
    })(fontBtns[i]);
  }
  var themeBtns = root.querySelectorAll('button[data-theme]');
  for (var j = 0; j < themeBtns.length; j++) {
    (function (btn) {
      btn.addEventListener('click', function () {
        applyTheme(btn.getAttribute('data-theme') || 'paper');
      });
    })(themeBtns[j]);
  }

  /* Outside click + ESC */
  document.addEventListener('click', function (e) {
    if (!root.open) return;
    if (root.contains(e.target)) return;
    root.open = false;
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && root.open) root.open = false;
  });
})();
