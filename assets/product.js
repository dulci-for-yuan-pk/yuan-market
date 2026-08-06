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
    const r = window.YuanPriceOf ? window.YuanPriceOf(L) : null;
    const fx = Y.fx;
    const ranged = r && r.max > r.min;
    const cnyTxt = !r ? '—' : (ranged ? `¥ ${Y.n2(r.min)}–${Y.n2(r.max)}` : `¥ ${Y.n2(r.min)}`);
    const pkrTxt = (!r || !fx || !fx.rate) ? '—'
      : (ranged ? `${Y.n0(r.min * fx.rate)}–${Y.n0(r.max * fx.rate)} PKR` : Y.pkr(r.min * fx.rate));
    const priceRows = `
      <div class="lrow"><span class="l"><i></i><span>${esc(verified ? Y.t('p.china') : Y.t('tier.listedprice'))}</span></span>
        <span class="a num">${cnyTxt}</span></div>
      <div class="lrow"><span class="l"><i></i><span data-t="led.conv"></span></span>
        <span class="a num">${pkrTxt}</span></div>
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

        <!-- The real calculator. Open to everyone: a buyer must be able to work
             out his own cost before he is asked to trust us with an account. -->
        <div class="ledger glass-2" id="calcBox" style="border-radius:var(--r-l);margin-bottom:18px">
          <div class="ledger-h" style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap">
            <div style="font-family:var(--display);font-weight:660;font-size:15.5px">${esc(Y.t('q.calc'))}</div>
            <label style="display:flex;align-items:center;gap:8px;font-size:12.5px">
              <span class="dim">${esc(Y.t('q.qty'))}</span>
              <input class="inp num ltr" id="qtyIn" type="number" inputmode="numeric"
                min="1" step="1" value="${Math.max(Number(L.moq) || 1, 1)}"
                style="width:110px;text-align:end;padding:7px 10px;font-weight:700">
            </label>
          </div>
          <div class="ledger-b" id="calcBody">
            <div class="lrow"><span class="l"><i></i><span>${esc(Y.t('q.calculating'))}</span></span></div>
          </div>
        </div>

        <div class="glass" style="border-radius:var(--r-m);padding:13px 16px;margin-bottom:16px">
          <p class="muted" style="font-size:13px;line-height:1.7" data-t="ord.nopay.note"></p>
        </div>

        <div style="display:flex;gap:10px;flex-wrap:wrap" id="orderBar">${orderBar()}</div>
      </div>
    </div>`;

    Y.applyLang(Y.lang(), false);
    Y.observe(box);
    Y.scrubDigits(box);

    wireQty();
    loadQuote(Math.max(Number(L.moq) || 1, 1));
  }


  /* Who is looking decides only what they can DO, never what they can SEE.
     The landed cost is public; placing an order is not. */
  function orderButton() {
    const me = Y.me;
    if (!me) {
      return `<a class="btn btn-gold" href="/login/?next=${encodeURIComponent(location.pathname)}">
        <span>${esc(Y.t('q.signin'))}</span></a>`;
    }
    if (!me.can_order) {
      return `<button class="btn btn-glass" disabled title="${esc(Y.t('q.needverify'))}">
        <span>${esc(Y.t('q.needverify'))}</span></button>`;
    }
    return `<button class="btn btn-gold" id="addBasket"><span>${esc(Y.t('q.addbasket'))}</span></button>`;
  }

  /* Order bar rendered in one place, so the session handler can replace it
     wholesale rather than doing surgery on markup. */
  function orderBar() {
    const title = pick(L, 'title');
    return orderButton() +
      `<a class="btn btn-wa" target="_blank" rel="noopener noreferrer"
         href="https://wa.me/923006307380?text=${encodeURIComponent(
           'Assalam o Alaikum, mujhe ye item chahiye: ' + title + ' (' + (L.code || '') + ')')}">
        <span class="num ltr">+92 300 630 7380</span></a>`;
  }

  /* A per-consignment charge apportioned by volume can genuinely come to two
     rupees. Rounding that to "0" beside "6,000 PKR" reads like a broken page,
     so small figures keep a decimal. */
  const money = v => v == null ? '—'
    : (Math.abs(v) < 10 && v !== 0 ? Y.n2(v) : Y.n0(v));

  const BASIS_LABEL = b => b === 'confirmed' ? Y.t('q.confirmed')
    : b === 'estimated' ? Y.t('q.estimated')
    : b === 'pending_input' ? Y.t('led.pending') : Y.t('led.pending');

  /* Label a line in the buyer's own language, preferring the Urdu label the
     cost rule carries when we are in Urdu. */
  function lineLabel(l) {
    if (Y.lang() === 'ur' && l.label_ur) return l.label_ur;
    return l.label || l.id;
  }

  let QUOTE = null, qseq = 0;

  async function loadQuote(qty) {
    const body = $('#calcBody');
    if (!body) return;
    const mine = ++qseq;
    body.innerHTML = `<div class="lrow"><span class="l"><i></i><span>${esc(Y.t('q.calculating'))}</span></span></div>`;
    let d;
    try {
      d = await Y.api('/api/quote?slug=' + encodeURIComponent(slug) + '&qty=' + encodeURIComponent(qty));
    } catch (e) {
      if (mine !== qseq) return;
      body.innerHTML = `<div class="lrow"><span class="l"><i></i><span class="muted">${
        esc((e.data && (e.data.message || e.data.error)) || Y.t('list.error'))}</span></span></div>`;
      return;
    }
    if (mine !== qseq) return;          // a newer quantity won the race
    QUOTE = d;
    paintQuote(d, qty);
  }

  function paintQuote(d, qty) {
    const body = $('#calcBody');
    const unit = Y.t('p.unit.' + (L.unit || 'piece')) || L.unit;
    const c = d.completeness || {};
    const belowMoq = L.moq && qty < Number(L.moq);

    const rows = (d.lines || []).map(l => {
      const est = l.basis !== 'confirmed';
      const rate = (l.value != null && l.unit)
        ? `<span class="dim num ltr" style="font-size:11.5px;margin-inline-end:8px">${
            l.unit === '%' ? Y.n2(l.value) + '%' : Y.n2(l.value) + ' ' + esc(l.unit)}</span>` : '';
      /* A rate that exists but does not apply to THIS product is stated as such.
         Showing "4%" beside a dash makes a buyer think something is broken. */
      const na = l.amount_pkr == null && l.applies === false;
      if (na) {
        return `<div class="lrow" style="opacity:.55">
          <span class="l"><i style="opacity:.4"></i><span>${esc(lineLabel(l))}</span></span>
          <span class="a"><span class="dim" style="font-size:11.5px">${
            esc(l.note || Y.t('q.notapply'))}</span></span></div>`;
      }
      return `<div class="lrow${est ? ' pend' : ''}">
        <span class="l"><i></i><span>${esc(lineLabel(l))}</span>
          ${est ? `<span class="confirm-note" style="margin-inline-start:7px">${esc(BASIS_LABEL(l.basis))}</span>` : ''}
        </span>
        <span class="a">${rate}<b class="num ltr">${money(l.amount_pkr)}</b></span>
      </div>`;
    }).join('');

    const fee = d.commission || {};
    const feeRow = `<div class="lrow fee">
      <span class="l"><i style="opacity:1"></i><span>${esc(Y.t('led.fee'))}</span></span>
      <span class="a"><span class="dim num ltr" style="font-size:11.5px;margin-inline-end:8px">${
        Y.n0(fee.pct || 20)}%</span><b class="num ltr">${money(fee.amount_pkr)}</b></span></div>`;

    /* The comparison he asked for: our landed price against what the same thing
       sells for in Pakistan today. Only shown when we actually have a figure. */
    let market = '';
    const mp = Number(L.market_price_pkr) || null;
    if (mp && d.per_unit_pkr) {
      const diff = mp - d.per_unit_pkr;
      const cheaper = diff > 0;
      market = `<div class="lrow" style="border-top:1px solid var(--hair);margin-top:6px;padding-top:12px">
        <span class="l"><i style="opacity:1"></i><span>${esc(Y.t('q.market'))}</span>
          ${L.market_price_source ? `<span class="dim" style="font-size:11px;margin-inline-start:6px">${esc(L.market_price_source)}</span>` : ''}
        </span>
        <span class="a"><b class="num ltr">${Y.n0(mp)}</b></span></div>
        <div class="lrow"><span class="l"><i style="opacity:0"></i><span class="${cheaper ? '' : 'muted'}"
          style="${cheaper ? 'color:var(--ok);font-weight:700' : ''}">${
            esc(cheaper ? Y.t('q.marketvs') : Y.t('q.marketover'))}</span></span>
          <span class="a"><b class="num ltr" style="${cheaper ? 'color:var(--ok)' : ''}">${
            Y.n0(Math.abs(diff))} / ${esc(unit)}</b></span></div>`;
    }

    body.innerHTML = `
      ${belowMoq ? `<div class="lrow"><span class="l"><i></i><span class="confirm-note">${
        esc(Y.t('q.belowmoq'))} ${Y.n0(L.moq)} ${esc(unit)}</span></span></div>` : ''}
      ${rows}
      ${feeRow}
      ${market}
      <div class="lrow" style="border-top:1px solid var(--hair-gold);margin-top:8px;padding-top:14px">
        <span class="l"><i style="opacity:1"></i><b style="font-size:14px">${esc(Y.t('q.total'))}</b></span>
        <span class="a"><b class="num ltr" style="font-size:19px">${Y.n0(d.total_pkr)} PKR</b></span>
      </div>
      <div class="lrow"><span class="l"><i style="opacity:0"></i><span class="dim">${
        esc(Y.t('q.perunit'))} ${esc(unit)}</span></span>
        <span class="a"><b class="num ltr">${Y.n0(d.per_unit_pkr)} PKR</b></span></div>

      ${(d.lines || []).some(l => /consignment|port_charges/.test(l.id)) ? `
        <p class="dim" style="font-size:11.5px;line-height:1.7;margin-top:10px">${esc(Y.t('q.sharednote'))}</p>` : ''}

      <div class="ledger-f" style="margin-top:12px">
        ${c.estimated || c.pending_input
          ? esc(Y.t('q.estnote'))
          : esc(Y.t('q.allconfirmed'))}
      </div>

      ${(d.cbm && L.carton_note) ? `<details style="margin-top:10px">
        <summary class="dim" style="cursor:pointer;font-size:12px">${esc(Y.t('q.freightnote'))}
          — <span class="num ltr">${Y.n2(d.cbm)} CBM</span></summary>
        <p class="muted" style="font-size:12px;line-height:1.75;margin-top:8px">${esc(L.carton_note)}</p>
        ${L.cbm_per_piece ? `<p class="dim num ltr" style="font-size:11.5px;margin-top:5px">${
          Y.n0(Number(L.cbm_per_piece) * 1000000)} cm³ ${esc(Y.t('q.volpiece'))}</p>` : ''}
      </details>` : ''}

      <p class="dim" style="font-size:11.5px;line-height:1.7;margin-top:10px">${esc(Y.t('q.openfree'))}</p>`;

    Y.scrubDigits(body);
    wireOrder();
  }

  function wireOrder() {
    const b = $('#addBasket');
    if (!b) return;
    b.onclick = async () => {
      const qty = Math.max(parseInt(($('#qtyIn') || {}).value, 10) || Number(L.moq) || 1, 1);
      b.disabled = true;
      try {
        await Y.api('/api/shop/cart/add', { method: 'POST', body: { slug, qty } });
        b.innerHTML = `<span>${esc(Y.t('q.added'))}</span>`;
        Y.bumpCart && Y.bumpCart();
        setTimeout(() => { location.href = '/cart/'; }, 700);
      } catch (e) {
        alert((e.data && (Y.lang() === 'ur' ? e.data.note_ur : e.data.note)) || e.message);
        b.disabled = false;
      }
    };
  }

  function wireQty() {
    const i = $('#qtyIn');
    if (!i) return;
    let t = null;
    const go = () => {
      const q = Math.max(parseInt(i.value, 10) || 1, 1);
      clearTimeout(t);
      t = setTimeout(() => loadQuote(q), 260);   // debounce, so typing 1000 is one call
    };
    i.addEventListener('input', go);
    i.addEventListener('change', go);
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
  /* The session arrives after first paint; only the buttons depend on it. */
  document.addEventListener('yuan:session', () => {
    const bar = $('#orderBar');
    if (bar && L) { bar.innerHTML = orderBar(); wireOrder(); }
  });
  document.addEventListener('yuan:fx',   () => { if (L) render(); });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', load);
  else load();
})();
