(function () {
  'use strict';

  function init() {
    var form = document.getElementById('form-recibir');
    var status = document.getElementById('form-status');
    if (!form || !status) return;

    var defaultMicrocopy =
      status.textContent || 'Te enviaremos solo cuando un capítulo esté listo. Nunca antes.';

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var formData = new FormData(form);
      var email = formData.get('email');
      var honeypot = formData.get('honeypot') || '';

      if (typeof email !== 'string' || !email.includes('@')) {
        status.textContent = 'Revisa el correo: parece que falta el formato.';
        return;
      }

      var submitBtn = form.querySelector('button[type="submit"]');
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = 'Enviando…';
      }

      fetch('/api/leads/libro', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email, honeypot: honeypot }),
      })
        .then(function (res) {
          if (res.ok) {
            status.textContent = 'Recibido. Te llegará un correo de confirmación.';
            form.reset();
          } else if (res.status === 429) {
            status.textContent =
              'Acabas de enviarlo. Espera un minuto antes de intentar de nuevo.';
          } else if (res.status === 400) {
            status.textContent = 'Algo no coincide en el formato. Vuelve a intentarlo.';
          } else {
            status.textContent =
              'Hubo un problema al guardar tu correo. Inténtalo de nuevo en un momento.';
          }
        })
        .catch(function () {
          status.textContent = 'No se pudo enviar. Comprueba tu conexión e inténtalo de nuevo.';
        })
        .finally(function () {
          if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.textContent = 'Recibir';
          }
          setTimeout(function () {
            if (status.textContent !== defaultMicrocopy) {
              status.textContent = defaultMicrocopy;
            }
          }, 8000);
        });
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
