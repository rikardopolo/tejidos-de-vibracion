(function () {
  'use strict';

  /**
   * Atribución · las UTMs que sella el puente /r/ llegan en la URL de aterrizaje y
   * se pierden en cuanto el visitante navega: la Obertura son 15 páginas, y el alta
   * ocurre casi siempre en otra distinta de la de entrada. Sin esto, `leads` guarda
   * país y endpoint pero NUNCA de qué pieza vino nadie — comprobado el 14-sep-2026:
   * 7 altas, 0 con utm_campaign.
   *
   * ponytail: sessionStorage, no cookie ni servidor. Techo conocido: se pierde si el
   * visitante aterriza en una página sin formulario (este script no se carga allí) o
   * si vuelve al día siguiente. Si eso pesa, el siguiente escalón es una cookie de
   * primera parte con TTL, no un servicio.
   */
  var CLAVE_UTM = 'tdv_utm';
  var CAMPOS_UTM = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'];

  function guardarUtms() {
    try {
      var q = new URLSearchParams(window.location.search);
      var encontrados = {};
      var hay = false;
      for (var i = 0; i < CAMPOS_UTM.length; i++) {
        var v = q.get(CAMPOS_UTM[i]);
        if (v) { encontrados[CAMPOS_UTM[i]] = String(v).slice(0, 120); hay = true; }
      }
      // Solo se pisa lo guardado si esta URL trae UTMs: navegar dentro del sitio no
      // debe borrar la atribución de la pieza por la que entró.
      if (hay) window.sessionStorage.setItem(CLAVE_UTM, JSON.stringify(encontrados));
    } catch (e) { /* modo privado o storage bloqueado: la atribución se pierde, el alta no */ }
  }

  function leerUtms() {
    try {
      var crudo = window.sessionStorage.getItem(CLAVE_UTM);
      if (!crudo) return null;
      var o = JSON.parse(crudo);
      return o && typeof o === 'object' ? o : null;
    } catch (e) { return null; }
  }

  function bindForm(form) {
    var status = document.querySelector('[data-status-for="' + form.id + '"]');
    if (!status) return;

    var endpoint = form.getAttribute('data-endpoint') || '/api/leads/libro';
    var submitText = form.getAttribute('data-submit-text') || 'Entrar al tejido';
    var successText = form.getAttribute('data-success-text') || 'Revisa tu correo. Te enviamos un link para confirmar.';

    form.addEventListener('submit', async function (e) {
      e.preventDefault();
      var fd = new FormData(form);
      var nombre = String(fd.get('nombre') || '').trim();
      var correo = String(fd.get('correo') || '').trim();
      var acepto = fd.get('acepto') === 'on' || fd.get('acepto') === 'true';
      var website = String(fd.get('website') || '');

      // Validación client-side mínima (la real está en backend)
      if (nombre.length < 2) { status.textContent = 'Falta tu nombre.'; return; }
      if (!correo.includes('@') || correo.length < 5) { status.textContent = 'Revisa el correo.'; return; }
      if (!acepto) { status.textContent = 'Necesitas aceptar para entrar.'; return; }

      var submitBtn = form.querySelector('button[type="submit"]');
      if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Enviando…'; }

      try {
        var res = await fetch(endpoint, {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            nombre: nombre,
            correo: correo,
            acepto: true,
            website: website,
            utm: leerUtms(),
          }),
        });

        if (res.ok) {
          status.textContent = successText;
          form.reset();
          // Ocultar el form tras éxito; mostrar status visible
          form.classList.add('is-sent');
        } else if (res.status === 429) {
          status.textContent = 'Acabas de enviarlo. Espera un minuto antes de intentar de nuevo.';
          if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = submitText; }
        } else if (res.status === 400) {
          status.textContent = 'Algo no coincide en el formato. Revisa los campos.';
          if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = submitText; }
        } else {
          status.textContent = 'Hubo un problema. Inténtalo de nuevo en un momento.';
          if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = submitText; }
        }
      } catch (err) {
        status.textContent = 'No se pudo enviar. Comprueba tu conexión.';
        if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = submitText; }
      }
    });
  }

  function init() {
    // Antes de enlazar nada: la URL de aterrizaje es la única que trae las UTMs.
    guardarUtms();
    document.querySelectorAll('form[data-tejedor-form]').forEach(bindForm);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
