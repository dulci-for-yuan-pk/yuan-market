/* ============================================================
   YUAN MARKET — buyer dashboard
   Orders with an honest timeline, invoices, saved lists, profile.
   ============================================================ */
(function () {
  'use strict';
  const Y = window.Yuan;
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g,
    c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
  const t = (en, ur) => Y.lang() === 'ur' ? ur : en;

  let ME = null, ORDERS = [], LISTS = [];

  /* The real journey, in order. Nothing is skipped or faked. */
  const STEPS = [
    ['placed',    'Order placed',            'آرڈر ہو گیا'],
    ['enquiring', 'Checking with supplier',  'سپلائر سے پوچھا جا رہا ہے'],
    ['confirmed', 'Supplier confirmed',      'سپلائر نے تصدیق کر دی'],
    ['invoiced',  'Invoice issued',          'بل بھیج دیا گیا'],
    ['paid',      'Payment received',        'ادائیگی موصول'],
    ['sourcing',  'Being bought in China',   'چین میں خریداری'],
    ['shipped',   'Shipped',                 'روانہ ہو گیا'],
    ['delivered', 'Delivered',               'پہنچ گیا']
  ];

  async function load() {
    try {
      const me = await Y.api('/api/me');
      ME = me.account;
      if (!ME) { location.href = '/login/?next=/account/'; return; }
    } catch (e) { location.href = '/login/?next=/account/'; return; }

    const [o, l] = await Promise.all([
      Y.api('/api/shop/orders').catch(() => ({ orders: [] })),
      Y.api('/api/shop/saved-lists').catch(() => ({ lists: [] }))
    ]);
    ORDERS = o.orders || []; LISTS = l.lists || [];
    render();
  }

  function render() {
    const placed = new URLSearchParams(location.search).get('placed');
    const box = $('#acct');

    box.innerHTML = `
      ${placed ? `<div class="nextup" style="background:linear-gradient(120deg,color-mix(in srgb,var(--ok) 16%,transparent),var(--mat-1));border-color:color-mix(in srgb,var(--ok) 34%,transparent)">
        <div class="ico" style="background:var(--ok);color:#fff">✓</div>
        <div class="txt">
          <div class="en">${esc(t('Order '+placed+' is with us. We are contacting the supplier now — you will not be asked for money until they confirm and we send you an invoice.',
            'آرڈر '+placed+' ہمیں مل گیا۔ ہم سپلائر سے رابطہ کر رہے ہیں — جب تک وہ تصدیق نہ کریں اور ہم بل نہ بھیجیں، آپ سے رقم نہیں مانگی جائے گی۔'))}</div>
        </div></div>` : ''}

      ${!ME.can_order ? `<div class="panel" style="border-color:color-mix(in srgb,var(--warn) 40%,transparent)">
        <div class="panel-b">
          <b style="color:var(--warn)">${esc(t('Your account is waiting for approval','آپ کا اکاؤنٹ منظوری کا منتظر ہے'))}</b>
          <p class="muted" style="font-size:13.5px;line-height:1.7;margin-top:8px">${esc(t(
            'You can browse the whole market now. Mirza Javaid Iqbal reviews new trade accounts himself before a first order — usually the same day.',
            'آپ ابھی پوری مارکیٹ دیکھ سکتے ہیں۔ پہلے آرڈر سے پہلے مرزا جاوید اقبال نئے کاروباری اکاؤنٹ خود دیکھتے ہیں — عموماً اُسی دن۔'))}</p>
          <a class="btn btn-wa btn-sm" style="margin-top:12px" target="_blank" rel="noopener noreferrer"
             href="https://wa.me/923006307380"><span class="num ltr">+92 300 630 7380</span></a>
        </div></div>` : ''}

      <div class="adm-head"><div>
        <h1>${esc(t('My orders','میرے آرڈر'))}</h1>
        <p>${esc(ME.business_name || ME.name || '')}${ME.city ? ' · ' + esc(ME.city) : ''}</p>
      </div><a class="btn btn-glass btn-sm" href="/listings/">${esc(t('Browse the market','مارکیٹ دیکھیں'))}</a></div>

      ${!ORDERS.length ? `<div class="panel"><div class="panel-b" style="text-align:center;padding:clamp(28px,5vw,54px)">
        <div style="font-family:var(--serif);font-size:40px;color:var(--gold);opacity:.28;margin-bottom:12px">元</div>
        <p class="muted" data-t="ord.none"></p>
        <a class="btn btn-gold btn-sm" style="margin-top:16px" href="/listings/">${esc(t('Start a basket','ٹوکری شروع کریں'))}</a>
      </div></div>` : ORDERS.map(orderCard).join('')}

      ${LISTS.length ? `<div class="panel">
        <div class="panel-h"><div><h2>${esc(t('Saved lists','محفوظ لسٹیں'))}</h2>
          <div class="sub">${esc(t('Reorder a whole basket next season in one tap.','اگلے سیزن پوری ٹوکری ایک بار میں دوبارہ منگوائیں۔'))}</div></div></div>
        <div class="panel-b">
          ${LISTS.map(l => `<div style="display:flex;align-items:center;justify-content:space-between;gap:12px;
            padding:11px 0;border-bottom:1px solid var(--hair)">
            <div><b>${esc(l.name)}</b><div class="dim num" style="font-size:11.5px">${(l.items||[]).length} ${esc(t('items','اشیاء'))} · ${esc(Y.date(l.created_at))}</div></div>
            <button class="btn btn-glass btn-sm" data-restore="${esc(l.id)}">${esc(t('Load into basket','ٹوکری میں ڈالیں'))}</button>
          </div>`).join('')}
        </div></div>` : ''}

      <div class="panel">
        <div class="panel-h"><h2>${esc(t('My details','میری تفصیل'))}</h2></div>
        <div class="panel-b" style="font-size:13.5px;line-height:2">
          <div>${esc(t('Name','نام'))}: <b>${esc(ME.name || '—')}</b></div>
          <div>${esc(t('Shop','دکان'))}: <b>${esc(ME.business_name || '—')}</b></div>
          <div>${esc(t('City','شہر'))}: <b>${esc(ME.city || '—')}</b></div>
          <div>${esc(t('Phone','فون'))}: <b class="num ltr">${esc(ME.phone || '—')}</b></div>
          <div>${esc(t('Email','ای میل'))}: <b class="ltr">${esc(ME.email || '—')}</b>
            ${ME.email_verified ? `<span class="pill-sm st-live">${esc(t('verified','تصدیق شدہ'))}</span>`
              : (ME.email ? `<span class="pill-sm st-review">${esc(t('not verified','غیر تصدیق شدہ'))}</span>` : '')}</div>
          <div>${esc(t('Can place orders','آرڈر کر سکتے ہیں'))}:
            <b style="color:${ME.can_order?'var(--ok)':'var(--warn)'}">${ME.can_order ? esc(t('yes','جی ہاں')) : esc(t('awaiting approval','منظوری کا انتظار'))}</b></div>
        </div>
      </div>`;

    $$('[data-restore]').forEach(b => b.addEventListener('click', async () => {
      try { await Y.api('/api/shop/saved-lists/restore', { method:'POST', body:{ id: b.dataset.restore } });
        location.href = '/cart/'; } catch (e) {}
    }));

    Y.applyLang(Y.lang(), false);
    Y.scrubDigits(box);
  }

  function orderCard(o) {
    const idx = STEPS.findIndex(s => s[0] === o.status);
    const cancelled = o.status === 'cancelled';
    const c = o.completeness || {};

    return `<div class="panel">
      <div class="panel-h">
        <div><h2 class="mono" style="font-size:14px">${esc(o.ref)}</h2>
          <div class="sub">${esc(Y.date(o.created_at))}${o.city_slug ? ' · ' + esc(o.city_slug) : ''}</div></div>
        <div style="text-align:end">
          <div class="num" style="font-family:var(--display);font-size:19px;font-weight:700;color:var(--gold)">
            ${Y.n0(o.total_pkr)} <span style="font-size:12px;color:var(--fg-3)">PKR</span></div>
          ${o.invoice ? `<div class="dim" style="font-size:11.5px">${esc(t('invoice','بل'))}
            <b class="mono">${esc(o.invoice.number)}</b></div>` : ''}
        </div>
      </div>

      <div class="panel-b">
        ${cancelled ? `<div class="pill-sm st-review">${esc(t('Cancelled','منسوخ'))}</div>` : `
        <div style="display:grid;gap:0">
          ${STEPS.map((s, i) => {
            const done = i <= idx, current = i === idx;
            return `<div style="display:flex;gap:12px;align-items:flex-start;padding:7px 0">
              <div style="width:18px;flex:0 0 18px;display:flex;flex-direction:column;align-items:center">
                <div style="width:11px;height:11px;border-radius:50%;
                  background:${done ? 'var(--ok)' : 'var(--mat-3)'};
                  ${current ? 'box-shadow:0 0 0 4px color-mix(in srgb,var(--ok) 24%,transparent)' : ''}"></div>
                ${i < STEPS.length - 1 ? `<div style="width:2px;flex:1;min-height:14px;
                  background:${i < idx ? 'var(--ok)' : 'var(--hair)'}"></div>` : ''}
              </div>
              <div style="padding-bottom:4px">
                <div style="font-size:13.5px;font-weight:${current ? '680' : '500'};
                  color:${done ? 'var(--fg)' : 'var(--fg-3)'}">
                  ${esc(Y.lang() === 'ur' ? s[2] : s[1])}</div>
                ${current && s[0] === 'invoiced' && o.invoice ? `
                  <div class="glass" style="border-radius:10px;padding:10px 12px;margin-top:7px;font-size:12.5px;line-height:1.7">
                    <b>${esc(t('Please pay','براہِ کرم ادائیگی کریں'))} <span class="num">${Y.n0(o.invoice.total_pkr)}</span> PKR</b>
                    ${o.invoice.bank_details ? `<div class="muted" style="margin-top:5px;white-space:pre-line">${esc(o.invoice.bank_details)}</div>`
                      : `<div class="muted" style="margin-top:5px">${esc(t('We will send you the account details on WhatsApp.','ہم اکاؤنٹ کی تفصیل واٹس ایپ پر بھیج دیں گے۔'))}</div>`}
                  </div>` : ''}
              </div>
            </div>`;
          }).join('')}
        </div>`}

        ${o.items && o.items.length ? `<div style="margin-top:14px;padding-top:12px;border-top:1px solid var(--hair)">
          ${o.items.map(i => `<div style="display:flex;justify-content:space-between;gap:12px;font-size:12.5px;padding:3px 0">
            <span>${esc((i.title_snapshot||'').slice(0,48))} <span class="dim num">× ${Y.n0(i.qty)}</span></span>
            <span class="num">${Y.n0(i.line_pkr)}</span>
          </div>`).join('')}
        </div>` : ''}

        ${(c.estimated || c.unsourced) ? `<div class="muted" style="font-size:12px;margin-top:12px;line-height:1.65">
          ${esc(t('Some costs on this order were estimates when you placed it. Your invoice carries the confirmed figures.',
                  'یہ آرڈر دیتے وقت کچھ خرچے اندازاً تھے۔ آپ کے بل میں پکے ہندسے ہوں گے۔'))}
        </div>` : ''}
      </div>
    </div>`;
  }

  document.addEventListener('yuan:lang', () => { if (ME) render(); });
  load();
})();
