(function () {
  'use strict';

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
          body: JSON.stringify({ nombre: nombre, correo: correo, acepto: true, website: website }),
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
    document.querySelectorAll('form[data-tejedor-form]').forEach(bindForm);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
