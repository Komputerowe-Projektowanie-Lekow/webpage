/* Anonymous page-view ping + contact-form handler.
   No cookies, no localStorage, no third parties. */
(function () {
  'use strict';

  // --- page view ---------------------------------------------------------
  try {
    var payload = JSON.stringify({
      path: location.pathname + location.search,
      ref: document.referrer || '',
      lang: navigator.language || '',
      screen: (screen.width || 0) + 'x' + (screen.height || 0),
      tz: (Intl.DateTimeFormat().resolvedOptions().timeZone) || ''
    });
    if (navigator.sendBeacon) {
      navigator.sendBeacon('/api/track', new Blob([payload], { type: 'application/json' }));
    } else {
      fetch('/api/track', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: payload,
        keepalive: true
      });
    }
  } catch (e) { /* analytics must never break the page */ }

  // --- contact form ----------------------------------------------------
  var form = document.getElementById('contactForm');
  if (!form) return;
  var statusEl = document.getElementById('cfStatus');

  function setStatus(text, kind) {
    if (!statusEl) return;
    statusEl.textContent = text;
    statusEl.style.color =
      kind === 'ok' ? 'var(--accent)' :
      kind === 'err' ? 'var(--accent-warm)' : '';
  }

  form.addEventListener('submit', function (ev) {
    ev.preventDefault();

    if (form.elements.consent && !form.elements.consent.checked) {
      setStatus('Zaznacz zgodę na kontakt, aby wysłać wiadomość.', 'err');
      return;
    }
    var required = ['name', 'email', 'message'];
    for (var i = 0; i < required.length; i++) {
      if (!String(form.elements[required[i]].value || '').trim()) {
        setStatus('Uzupełnij pola: imię, e-mail i wiadomość.', 'err');
        return;
      }
    }

    var btn = form.querySelector('button[type="submit"]');
    if (btn) btn.disabled = true;
    setStatus('Wysyłanie…', '');

    var data = {
      name: form.elements.name.value,
      email: form.elements.email.value,
      company: form.elements.company ? form.elements.company.value : '',
      area: form.elements.area ? form.elements.area.value : '',
      message: form.elements.message.value,
      website: form.elements.website ? form.elements.website.value : '',
      ref: document.referrer || '',
      lang: navigator.language || ''
    };

    fetch('/api/contact', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    })
      .then(function (r) {
        return r.json().catch(function () { return {}; }).then(function (j) {
          return { ok: r.ok, body: j };
        });
      })
      .then(function (res) {
        if (btn) btn.disabled = false;
        if (res.ok) {
          form.reset();
          setStatus('Dziękujemy — odezwiemy się w ciągu 3–4 dni roboczych.', 'ok');
        } else {
          setStatus((res.body && res.body.error) || 'Nie udało się wysłać wiadomości.', 'err');
        }
      })
      .catch(function () {
        if (btn) btn.disabled = false;
        setStatus('Błąd sieci — spróbuj ponownie albo napisz mailem.', 'err');
      });
  });
})();
