/* ============================================================
   YUAN MARKET — sign in / register / invite / Google
   ============================================================ */
(function () {
  'use strict';
  const Y = window.Yuan;
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));

  const next = new URLSearchParams(location.search).get('next') || '';
  const errBox = $('#err');

  function showError(code) {
    const msg = Y.t('auth.err.' + code) || Y.t('auth.err.generic');
    errBox.textContent = msg;
    errBox.style.display = 'block';
    errBox.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }
  const clearError = () => { errBox.style.display = 'none'; };

  function homeFor(account) {
    if (next) return next;
    if (account.role === 'admin')  return '/admin/';
    if (account.role === 'seller') return '/seller/';
    return '/account/';
  }

  /* After a successful sign-in, show the approval notice rather than
     bouncing a buyer straight into a dashboard they cannot order from. */
  function done(d) {
    const a = d.account;
    if (d.awaiting_approval) {
      $('#authCard').innerHTML = `
        <div class="flip" style="text-align:center">
          <div class="mark" style="width:56px;height:56px;font-size:26px;margin:0 auto 18px">元</div>
          <h2 class="h-s" style="margin-bottom:12px">${escapeHtml(Y.t('auth.pending.title'))}</h2>
          <p class="muted" style="font-size:14px;line-height:1.75;margin-bottom:22px">
            ${escapeHtml(Y.t('auth.pending.body'))}</p>
          <div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap">
            <a class="btn btn-gold" href="/listings/">${escapeHtml(Y.t('nav.market'))}</a>
            <a class="btn btn-wa" target="_blank" rel="noopener noreferrer"
               href="https://wa.me/923006307380">
               <span class="num ltr">+92 300 630 7380</span></a>
          </div>
        </div>`;
      return;
    }
    location.href = homeFor(a);
  }

  const escapeHtml = s => String(s == null ? '' : s).replace(/[&<>"']/g,
    c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));

  async function post(path, body, btn) {
    clearError();
    if (btn) { btn.disabled = true; btn.dataset.was = btn.textContent; btn.textContent = Y.t('misc.loading'); }
    try {
      const d = await Y.api(path, { method: 'POST', body });
      done(d);
    } catch (e) {
      const code = (e.data && e.data.error) || 'generic';
      showError(code);
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = btn.dataset.was || ''; }
    }
  }

  const formData = f => Object.fromEntries(new FormData(f).entries());

  /* ---- tabs ---- */
  $$('#tabs button').forEach(b => b.addEventListener('click', () => {
    const tab = b.dataset.tab;
    $$('#tabs button').forEach(x => x.setAttribute('aria-selected', String(x === b)));
    $('#loginForm').style.display    = tab === 'login' ? '' : 'none';
    $('#registerForm').style.display = tab === 'register' ? '' : 'none';
    clearError();
  }));

  $('#loginForm').addEventListener('submit', e => {
    e.preventDefault();
    post('/api/auth/login', formData(e.target), e.target.querySelector('button[type=submit]'));
  });

  $('#registerForm').addEventListener('submit', e => {
    e.preventDefault();
    const body = formData(e.target);
    body.lang = Y.lang();
    post('/api/auth/register', body, e.target.querySelector('button[type=submit]'));
  });

  $('#inviteForm').addEventListener('submit', e => {
    e.preventDefault();
    const body = formData(e.target);
    body.code = String(body.code || '').trim().toUpperCase();
    post('/api/auth/invite', body, e.target.querySelector('button[type=submit]'));
  });

  /* ---- Google: only rendered if a client id is actually configured ---- */
  async function initGoogle() {
    let clientId = null;
    try {
      const r = await fetch('/api/me', { credentials: 'same-origin' });
      const d = await r.json();
      if (d && d.account) { location.href = homeFor(d.account); return; }
      clientId = d && d.google_client_id;
    } catch (e) { /* stay on the form */ }

    if (!clientId) return;   // not configured -> no dead button shown

    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.async = true; s.defer = true;
    s.onload = () => {
      if (!window.google || !google.accounts || !google.accounts.id) return;
      google.accounts.id.initialize({
        client_id: clientId,
        callback: res => post('/api/auth/google', { credential: res.credential })
      });
      google.accounts.id.renderButton($('#gbtn'), {
        theme: document.body.classList.contains('day') ? 'outline' : 'filled_black',
        size: 'large', width: 320,
        text: 'continue_with', shape: 'pill'
      });
      $('#googleWrap').style.display = '';
    };
    document.head.appendChild(s);
  }
  initGoogle();

  document.addEventListener('yuan:lang', clearError);
})();
