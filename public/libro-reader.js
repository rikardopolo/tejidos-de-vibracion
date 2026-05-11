/* libro-reader.js · Tejidos de Vibración
   Controles de lectura: tamaño de texto y modo día/noche.
   CSP-safe: script externo, sin eval ni inline.
   Las preferencias se persisten en localStorage. */

(function () {
  'use strict';

  var STORAGE_KEYS = {
    size: 'tdv-reader-size',  // 'small' | 'default' | 'large'
    mode: 'tdv-reader-mode',  // 'day' | 'night'
  };

  // Apply saved preferences immediately (before paint) to prevent FOUC
  var savedSize = localStorage.getItem(STORAGE_KEYS.size) || 'default';
  var savedMode = localStorage.getItem(STORAGE_KEYS.mode) || 'day';
  document.documentElement.setAttribute('data-reader-size', savedSize);
  document.documentElement.setAttribute('data-reader-mode', savedMode);

  function init() {
    var trigger = document.getElementById('reader-controls-trigger');
    var panel = document.getElementById('reader-controls');
    if (!trigger || !panel) return;

    trigger.addEventListener('click', function () {
      panel.hidden = !panel.hidden;
    });

    // Close on outside click
    document.addEventListener('click', function (e) {
      if (panel.hidden) return;
      if (!panel.contains(e.target) && e.target !== trigger) {
        panel.hidden = true;
      }
    });

    // Action handlers via event delegation
    panel.addEventListener('click', function (e) {
      var btn = e.target.closest('button[data-action]');
      if (!btn) return;
      var action = btn.dataset.action;
      if (action === 'text-smaller') setSize('small');
      else if (action === 'text-default') setSize('default');
      else if (action === 'text-larger')  setSize('large');
      else if (action === 'mode-day')   setMode('day');
      else if (action === 'mode-night') setMode('night');
    });

    function setSize(size) {
      document.documentElement.setAttribute('data-reader-size', size);
      localStorage.setItem(STORAGE_KEYS.size, size);
      updateActive();
    }

    function setMode(mode) {
      document.documentElement.setAttribute('data-reader-mode', mode);
      localStorage.setItem(STORAGE_KEYS.mode, mode);
      updateActive();
    }

    function updateActive() {
      var size = document.documentElement.getAttribute('data-reader-size');
      var mode = document.documentElement.getAttribute('data-reader-mode');
      panel.querySelectorAll('button[data-action]').forEach(function (b) {
        b.classList.remove('is-active');
      });
      var sizeBtn = panel.querySelector('button[data-action="text-' + size + '"]');
      var modeBtn = panel.querySelector('button[data-action="mode-' + mode + '"]');
      if (sizeBtn) sizeBtn.classList.add('is-active');
      if (modeBtn) modeBtn.classList.add('is-active');
    }

    updateActive();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
