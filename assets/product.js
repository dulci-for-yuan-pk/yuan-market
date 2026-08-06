/* ============================================================
   YUAN MARKET — product detail
   Shows the full transparent sheet, and is explicit about which
   figures are real and which are still to be confirmed.
   ============================================================ */
(function () {
  'use strict';
  const Y = window.Yuan;
  const $ = (s, r) => (r || document).querySelector(s);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g,
    c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
  const SYM = { CNY:'¥', USD:'$', EUR:'€', GBP:'£' };

  const slug = (location.pathname.match(/^\/p\/([^/]+)/) || [])[1]
            || new URLSearchParams(location.search).get('slug');

  let L = null;

  const pick = (l, base) => {
    const lang = Y.lang();
    if (lang === 'ur' && l[base + '_ur']) return l[base + '_ur'];
    if (lang === 'zh' && l[base + '_zh']) return l[base + '_zh'];
    return l[base + '_en'] || '';
  };

  function render(){
    const box = $('#pdp');
    if (!L){ box.innerHTML = window.YuanEmpty ? '' : ''; return; }
    const verified = L.tier === 'verified';
    const unit = Y.t('p.unit.' + (L.unit || 'piece')) || L.unit;
    const title = pick(L, 'title');
    document.title = title + ' — Yuan Market';

    const img = L.hero_url
      ? `<img src="${esc(L.hero_url)}" alt="${esc(title)}" referrerpolicy="no-referrer"
             style="width:100%;height:100%;object-fit:cover">`
      : `<div class="void" style="display:grid;place-items:center;height:100%;color:var(--fg-3)">—</div>`;

    /* Prices are shown in YUAN and RUPEES only, at the live cross-checked
       rate. A supplier price published in USD/EUR/GBP is normalised to yuan
       through that same rate; the exact figure is confirmed with the supplier
       once an order is placed, and nothing is charged before then. */
    const cny = window.YuanPriceOf ? window.YuanPriceOf(L) : null;
    const pkr = (cny != null && Y.fx && Y.fx.rate) ? cny * Y.fx.rate : null;
    const priceRows = `
      <div class="lrow"><span class="l"><i></i><span>${esc(verified ? Y.t('p.china') : Y.t('tier.listedprice'))}</span></span>
        <span class="a num">${cny == null ? '—' : '¥ ' + Y.n2(cny)}</span></div>
      <div class="lrow"><span class="l"><i></i><span data-t="led.conv"></span></span>
        <span class="a num">${pkr == null ? '—' : Y.pkr(pkr)}</span></div>
      ${verified ? '' : `<div class="lrow"><span class="l"><i></i><span>${esc(Y.t('tier.approx'))}</span></span>
        <span class="a"><span class="confirm-note">${esc(Y.t('tier.confirm'))}</span></span></div>`}`;

    box.innerHTML = `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:clamp(20px,3.4vw,48px);align-items:start">

      <div class="glass spec rv" style="border-radius:var(--r-xl);overflow:hidden;aspect-ratio:1/1;position:relative">
        ${verified ? `<span class="tier tier-verified">${esc(Y.t('tier.verified'))}</span>` : ''}
        ${img}
      </div>

      <div class="flip rv d1">
        ${L.category_en ? `<div class="eyebrow">${esc(pick(L, 'category'))}</div>` : ''}
        <h1 class="h-m" style="margin-bottom:16px">${esc(title)}</h1>

        <div class="glass" style="border-radius:var(--r-m);padding:14px 16px;margin-bottom:18px">
          <p class="muted" style="font-size:13.5px;line-height:1.7">
            ${esc(Y.t(verified ? 'tier.verified.help' : 'tier.indicative.help'))}</p>
          ${verified ? '' : `<div style="margin-top:11px"><span class="confirm-note">${esc(Y.t('tier.confirm'))}</span></div>`}
        </div>

        <div style="display:flex;flex-wrap:wrap;gap:22px;margin-bottom:20px">
          <div><div class="p-lbl">${esc(Y.t('p.moq'))}</div>
            <div class="num" style="font-size:19px;font-weight:700">${Y.n0(L.moq)} ${esc(unit)}</div></div>
          ${L.supplier_name ? `<div><div class="p-lbl">${esc(Y.t('p.supplier'))}</div>
            <div style="font-size:15px;font-weight:600">${esc(L.supplier_name)}</div></div>` : ''}
        </div>

        <div class="ledger glass-2" style="border-radius:var(--r-l);margin-bottom:18px">
          <div class="ledger-h"><div style="font-family:var(--display);font-weight:660;font-size:15.5px" data-t="p.breakdown"></div></div>
          <div class="ledger-b">
            ${priceRows}
            <div class="lrow pend"><span class="l"><i></i><span data-t="led.freight"></span></span><span class="a" data-t="led.pending"></span></div>
            <div class="lrow pend"><span class="l"><i></i><span data-t="led.duty"></span></span><span class="a" data-t="led.perhs"></span></div>
            <div class="lrow pend"><span class="l"><i></i><span data-t="led.tax"></span></span><span class="a" data-t="led.pending"></span></div>
            <div class="lrow pend"><span class="l"><i></i><span data-t="led.inland"></span></span><span class="a" data-t="led.pending"></span></div>
            <div class="lrow fee"><span class="l"><i style="opacity:1"></i><span data-t="led.fee"></span></span><span class="a num">20%</span></div>
          </div>
          <div class="ledger-t">
            <span class="dim" style="font-size:12px;font-weight:700" data-t="led.total"></span>
            <span class="a" data-t="led.once"></span>
          </div>
          <div class="ledger-f flip" data-t="led.foot"></div>
        </div>

        <div class="glass" style="border-radius:var(--r-m);padding:13px 16px;margin-bottom:16px">
          <p class="muted" style="font-size:13px;line-height:1.7" data-t="ord.nopay.note"></p>
        </div>

        <div style="display:flex;gap:10px;flex-wrap:wrap">
          <a class="btn btn-gold" href="/login/?next=${encodeURIComponent(location.pathname)}">
            <span data-t="p.order"></span></a>
          <a class="btn btn-wa" target="_blank" rel="noopener noreferrer"
             href="https://wa.me/923006307380?text=${encodeURIComponent('Assalam o Alaikum, mujhe ye item chahiye: ' + title + ' (' + (L.code || '') + ')')}">
            <span class="num ltr">+92 300 630 7380</span></a>
        </div>
      </div>
    </div>`;

    Y.applyLang(Y.lang(), false);
    Y.observe(box);
    Y.scrubDigits(box);
  }

  async function load(){
    const box = $('#pdp');
    if (!slug){ box.innerHTML = `<div class="empty flip"><div class="g">元</div><p data-t="list.error"></p></div>`; Y.applyLang(Y.lang(), false); return; }
    try{
      const d = await Y.api('/api/listing?slug=' + encodeURIComponent(slug));
      L = d.listing; render();
    }catch(e){
      box.innerHTML = `<div class="empty flip">
        <div class="g">元</div>
        <h3 class="h-s" data-t="list.empty.h"></h3>
        <p data-t="list.error"></p>
        <a class="btn btn-glass" href="/listings/"><span data-t="nav.market"></span></a>
      </div>`;
      Y.applyLang(Y.lang(), false);
    }
  }

  document.addEventListener('yuan:lang', () => { if (L) render(); });
  document.addEventListener('yuan:fx',   () => { if (L) render(); });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', load);
  else load();
})();
