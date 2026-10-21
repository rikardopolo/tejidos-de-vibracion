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

  /*
   * S-15 · nombre opcional y dos casillas sin marcar: autorización (obligatoria) y
   * Cartas del Tejedor (opcional). El botón NUNCA se deshabilita: se valida al
   * enviar, cada error se escribe en el <p data-error-for> que el campo enlaza con
   * aria-describedby, se marca aria-invalid y el foco va al primer campo con error.
   * La validación real está en el servidor (lib/alta-libro.mjs); esta es la cortesía.
   */
  var MENSAJES = {
    correoVacio: 'Escribe tu correo para continuar.',
    correoMal: 'Revisa el correo: parece incompleto.',
    autorizacion: 'Para enviarte el enlace necesitamos tu autorización: marca la primera casilla.',
    nombreSignos: 'Escribe tu nombre sin los signos < y >.',
    nombreServidor: 'Revisa tu nombre: sin los signos < y >, y no muy largo.',
    formato: 'Algo no coincide en el formato. Revisa los campos.',
    espera: 'Acabas de enviarlo. Espera un minuto antes de intentar de nuevo.',
    problema: 'Hubo un problema. Inténtalo de nuevo en un momento.',
    conexion: 'No se pudo enviar. Comprueba tu conexión.',
  };
  // Lo mínimo para avisar de un error de tecleo; el servidor valida de verdad.
  var CORREO_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  function campo(form, nombre) { return form.querySelector('[name="' + nombre + '"]'); }
  function cajaError(form, nombre) { return form.querySelector('[data-error-for="' + nombre + '"]'); }

  function limpiarError(form, nombre) {
    var c = campo(form, nombre);
    var e = cajaError(form, nombre);
    if (c) c.removeAttribute('aria-invalid');
    if (e) e.textContent = '';
  }

  function limpiarErrores(form) {
    var marcados = form.querySelectorAll('[aria-invalid]');
    for (var i = 0; i < marcados.length; i++) marcados[i].removeAttribute('aria-invalid');
    var cajas = form.querySelectorAll('[data-error-for]');
    for (var j = 0; j < cajas.length; j++) cajas[j].textContent = '';
  }

  /** errores: [[nombreDelCampo, mensaje], …] · devuelve true si pudo pintarlos en su sitio. */
  function mostrarErrores(form, status, errores) {
    var primero = null;
    var sueltos = [];
    for (var i = 0; i < errores.length; i++) {
      var c = campo(form, errores[i][0]);
      var e = cajaError(form, errores[i][0]);
      if (c) c.setAttribute('aria-invalid', 'true');
      if (e) e.textContent = errores[i][1];
      else sueltos.push(errores[i][1]);
      if (!primero && c) primero = c;
    }
    // Sin caja propia (marcado a medida), el aviso va a la región de estado.
    if (sueltos.length) status.textContent = sueltos.join(' ');
    if (primero) primero.focus();
  }

  function bindForm(form) {
    var status = document.querySelector('[data-status-for="' + form.id + '"]');
    if (!status) return;

    var endpoint = form.getAttribute('data-endpoint') || '/api/leads/libro';
    var submitText = form.getAttribute('data-submit-text') || 'Entrar al tejido';
    var successText = form.getAttribute('data-success-text') || 'Revisa tu correo. Te enviamos un enlace para confirmar.';
    var submitBtn = form.querySelector('button[type="submit"]');
    var enviando = false;

    // Al corregir un campo, su error se va.
    function alCambiar(e) {
      var t = e.target;
      if (t && t.name && t.getAttribute('aria-invalid') === 'true') limpiarError(form, t.name);
    }
    form.addEventListener('input', alCambiar);
    form.addEventListener('change', alCambiar);

    form.addEventListener('submit', async function (e) {
      e.preventDefault();
      if (enviando) return; // doble clic: el botón sigue activo, pero no se envía dos veces
      limpiarErrores(form);
      status.textContent = '';

      var fd = new FormData(form);
      var nombre = String(fd.get('nombre') || '').replace(/\s+/g, ' ').trim();
      var correo = String(fd.get('correo') || '').trim();
      var autorizacion = fd.get('autorizacion') === 'on';
      var cartas = fd.get('cartas') === 'on';
      var website = String(fd.get('website') || '');

      var errores = [];
      if (/[<>]/.test(nombre)) errores.push(['nombre', MENSAJES.nombreSignos]);
      if (!correo) errores.push(['correo', MENSAJES.correoVacio]);
      else if (!CORREO_RE.test(correo)) errores.push(['correo', MENSAJES.correoMal]);
      if (!autorizacion) errores.push(['autorizacion', MENSAJES.autorizacion]);
      if (errores.length) { mostrarErrores(form, status, errores); return; }

      var cuerpo = { correo: correo, autorizacion: true, cartas: cartas, website: website, utm: leerUtms() };
      if (nombre) cuerpo.nombre = nombre;

      enviando = true;
      if (submitBtn) submitBtn.textContent = 'Enviando…';

      try {
        var res = await fetch(endpoint, {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(cuerpo),
        });

        if (res.ok) {
          status.textContent = successText;
          form.reset();
          // Ocultar el form tras éxito; el aviso vive fuera del form y sigue visible.
          form.classList.add('is-sent');
        } else if (res.status === 429) {
          status.textContent = MENSAJES.espera;
        } else if (res.status === 400) {
          var issues = [];
          try { issues = ((await res.json()) || {}).issues || []; } catch (err) { issues = []; }
          var delServidor = [];
          if (issues.indexOf('correo') >= 0) delServidor.push(['correo', MENSAJES.correoMal]);
          if (issues.indexOf('autorizacion') >= 0) delServidor.push(['autorizacion', MENSAJES.autorizacion]);
          if (issues.indexOf('nombre') >= 0) delServidor.push(['nombre', MENSAJES.nombreServidor]);
          if (delServidor.length) mostrarErrores(form, status, delServidor);
          else status.textContent = MENSAJES.formato;
        } else {
          status.textContent = MENSAJES.problema;
        }
      } catch (err) {
        status.textContent = MENSAJES.conexion;
      } finally {
        enviando = false;
        if (submitBtn) submitBtn.textContent = submitText;
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
