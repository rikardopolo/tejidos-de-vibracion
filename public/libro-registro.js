(function () {
  'use strict';

  function init() {
    var form = document.getElementById('form-registro');
    var status = document.getElementById('form-registro-status');
    if (!form || !status) return;

    form.addEventListener('submit', async function (e) {
      e.preventDefault();
      var formData = new FormData(form);
      var nombre = (formData.get('nombre') || '').toString().trim();
      var email = (formData.get('email') || '').toString().trim();
      var honeypot = (formData.get('honeypot') || '').toString();

      if (nombre.length < 2) {
        status.textContent = 'Falta tu nombre.';
        return;
      }
      if (!email.includes('@') || email.length < 5) {
        status.textContent = 'Revisa el correo: parece que falta el formato.';
        return;
      }

      var submitBtn = form.querySelector('button[type="submit"]');
      if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Entrando…'; }

      try {
        var res = await fetch('/api/leads/libro', {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ nombre: nombre, email: email, honeypot: honeypot }),
        });

        if (res.ok) {
          var data = await res.json().catch(function () { return {}; });
          status.textContent = 'Bienvenido al tejido, ' + (data.nombre || nombre) + '.';
          // Recarga la página: la cookie nueva activa Nivel 1 y se ve el capítulo completo
          setTimeout(function () { window.location.reload(); }, 900);
        } else if (res.status === 429) {
          status.textContent = 'Acabas de enviarlo. Espera un minuto antes de intentar de nuevo.';
          if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = 'Entrar al tejido'; }
        } else if (res.status === 400) {
          status.textContent = 'Algo no coincide en el formato. Revisa los campos.';
          if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = 'Entrar al tejido'; }
        } else {
          status.textContent = 'Hubo un problema. Inténtalo de nuevo en un momento.';
          if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = 'Entrar al tejido'; }
        }
      } catch (err) {
        status.textContent = 'No se pudo enviar. Comprueba tu conexión.';
        if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = 'Entrar al tejido'; }
      }
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
