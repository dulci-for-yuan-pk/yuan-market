/* Admin password bootstrap — redeems the one-time link. */
(function () {
  'use strict';
  const Y = window.Yuan;
  const $ = s => document.querySelector(s);
  const token = new URLSearchParams(location.search).get('token');
  const err = $('#err'), ok = $('#ok');
  const fail = m => { err.textContent = m; err.style.display = 'block'; };

  if (!token) fail('This link is missing its token. Request a new setup link from the sign-in page.');

  $('#setForm').addEventListener('submit', async e => {
    e.preventDefault();
    err.style.display = 'none';
    const f = Object.fromEntries(new FormData(e.target).entries());
    if (f.password !== f.confirm) return fail('The two passwords do not match.');
    const btn = e.target.querySelector('button[type=submit]');
    btn.disabled = true; btn.textContent = 'Saving…';
    try {
      await Y.api('/api/admin-auth/set-password', { method:'POST', body:{ token, password:f.password } });
      e.target.style.display = 'none';
      ok.style.display = 'block';
      ok.innerHTML = `<div class="glass" style="border-radius:12px;padding:15px 17px">
        <div style="font-weight:650;margin-bottom:7px">Password saved</div>
        <p class="muted" style="font-size:13px;line-height:1.65;margin-bottom:13px">
          You are signed in. This link will not work again.</p>
        <a class="btn btn-gold btn-block btn-sm" href="/admin/">Open the console</a></div>`;
    } catch (ex) {
      const c = (ex.data && ex.data.error) || '';
      fail({
        token_invalid: 'This link is not valid. It may already have been used.',
        token_expired: 'This link has expired. Request a new one.',
        weak_password: 'Please choose a stronger password — at least 6 characters, not all the same, not sequential.',
        not_admin: 'That address is not an administrator.'
      }[c] || 'Could not save the password.');
      btn.disabled = false; btn.textContent = 'Save password and sign in';
    }
  });
})();
