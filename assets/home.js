/* ============================================================
   YUAN MARKET — home + shared catalogue rendering
   ============================================================ */
(function () {
  'use strict';
  const Y = window.Yuan;
  const $ = (s, r) => (r || document).querySelector(s);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g,
    c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));

  const SYM = { CNY:'¥', USD:'$', EUR:'€', GBP:'£' };

  function titleOf(l){
    const lang = Y.lang();
    if (lang === 'ur' && l.title_ur) return l.title_ur;
    if (lang === 'zh' && l.title_zh) return l.title_zh;
    return l.title_en || '';
  }
  function catOf(l){
    const lang = Y.lang();
    if (lang === 'ur' && l.category_ur) return l.category_ur;
    if (lang === 'zh' && l.category_zh) return l.category_zh;
    return l.category_en || '';
  }
  function unitLabel(u){
    const key = 'p.unit.' + (u || 'piece');
    return Y.t(key) || u || '';
  }

  /* ---- pricing ----------------------------------------------------
     The market quotes in YUAN and RUPEES only, at the live
     cross-checked rate. A verified listing has a real negotiated
     yuan price. An indicative listing has the supplier's published
     price, which may have been listed in USD/EUR/GBP — that gets
     normalised to yuan through the same live rate, and is labelled
     as confirmed with the supplier once an order is placed.
     If the rate feed is down we show nothing rather than a guess. */
  function yuanOf(l){
    if (l.tier === 'verified' && l.cny_unit_price != null) return Number(l.cny_unit_price);
    const fx = Y.fx;
    if (!fx || !fx.to_cny) return null;
    const k = fx.to_cny[l.listed_currency];
    if (!(k > 0)) return null;
    const base = (l.listed_price_min != null) ? Number(l.listed_price_min) : null;
    return base == null ? null : base * k;
  }
  window.YuanPriceOf = yuanOf;

  function priceBlock(l){
    const verified = l.tier === 'verified';
    const cny = yuanOf(l);
    const fx = Y.fx;
    const pkr = (cny != null && fx && fx.rate) ? cny * fx.rate : null;

    const label = verified ? Y.t('p.china') : Y.t('tier.listedprice');
    const main = (cny == null)
      ? `<div class="p-val">—</div>`
      : `<div class="p-val num">${SYM.CNY} ${Y.n2(cny)}<small>/ ${esc(unitLabel(l.unit))}</small></div>
         <div class="num" style="font-size:13.5px;font-weight:650;color:var(--fg-2);margin-top:3px">
           ${pkr == null ? '—' : Y.pkr(pkr)}</div>`;

    const note = verified
      ? `<div class="await" style="margin-top:7px">${esc(Y.t('p.costspending'))}</div>`
      : `<div class="confirm-note" style="margin-top:8px">${esc(Y.t('tier.confirm'))}</div>`;

    return `<div class="p-lbl">${esc(label)}</div>${main}${note}`;
  }

  function card(l){
    const verified = l.tier === 'verified';
    const img = l.hero_url
      ? `<img src="${esc(l.hero_url)}" alt="${esc(titleOf(l))}" loading="lazy" referrerpolicy="no-referrer"
              onerror="this.replaceWith(Object.assign(document.createElement('div'),{className:'void',textContent:'—'}))">`
      : `<div class="void">${esc(Y.t('list.empty.h'))}</div>`;

    // Provenance (source URL / capture date) is deliberately NOT shown to
    // buyers — it reads as second-hand data. Admin sees it in the console.
    const src = '';

    // Only the positive badge is public. An unvisited listing simply carries
    // no badge, so nothing on the card undercuts the presentation.
    const badge = verified
      ? `<span class="tier tier-verified">${esc(Y.t('tier.verified'))}</span>` : '';

    return `<article class="card rv ${verified ? 'is-verified' : ''}">
      <div class="card-img">
        ${badge}
        ${img}
      </div>
      <div class="card-b flip">
        ${catOf(l) ? `<div class="p-lbl" style="color:var(--gold)">${esc(catOf(l))}</div>` : ''}
        <h3>${esc(titleOf(l))}</h3>
        <div class="card-meta">
          <span>${esc(Y.t('p.moq'))} <b class="num">${Y.n0(l.moq)}</b></span>
          ${l.supplier_name ? `<span>${esc(Y.t('p.supplier'))} <b>${esc(l.supplier_name)}</b></span>` : ''}
        </div>
        <div class="card-price">
          ${priceBlock(l)}
          ${src}
          <a class="btn btn-sm btn-glass btn-block" style="margin-top:11px" href="/p/${esc(l.slug)}/">${esc(Y.t('p.breakdown'))}</a>
        </div>
      </div>
    </article>`;
  }
  window.YuanCard = card;

  function catChip(c){
    const lang = Y.lang();
    const name = (lang === 'ur' && c.name_ur) ? c.name_ur
               : (lang === 'zh' && c.name_zh) ? c.name_zh : c.name_en;
    return `<a class="glass flip" href="/listings/?category=${esc(c.slug)}"
      style="flex:0 0 auto;scroll-snap-align:start;border-radius:99px;padding:11px 20px;
             font-size:14px;font-weight:600;white-space:nowrap;transition:transform .3s var(--e-spring)">
      ${esc(name)}</a>`;
  }

  function empty(msgKey){
    return `<div class="empty flip">
      <div class="g">元</div>
      <h3 class="h-s">${esc(Y.t('list.empty.h'))}</h3>
      <p>${esc(Y.t(msgKey))}</p>
      <a class="btn btn-wa" href="https://wa.me/923006307380" target="_blank" rel="noopener noreferrer">
        ${esc(Y.t('list.empty.cta'))}</a>
    </div>`;
  }
  window.YuanEmpty = empty;

  /* ---- load ---- */
  let CACHE = null;
  async function load(){
    const grid = $('#grid'), rail = $('#catRail'), count = $('#listCount');
    const demo = new URLSearchParams(location.search).get('demo') === '1';
    try{
      const d = CACHE || await Y.api('/api/catalog?limit=12' + (demo ? '&demo=1' : ''));
      CACHE = d;
      if (rail && d.categories) rail.innerHTML = d.categories.map(catChip).join('');
      if (grid){
        if (d.listings && d.listings.length){
          grid.innerHTML = d.listings.map(card).join('');
          Y.observe(grid);
          if (count) count.innerHTML = `<span class="num">${d.listings.length}</span> ${esc(Y.t('list.count'))}`;
        } else {
          grid.innerHTML = empty('list.empty.p');
        }
      }
      Y.scrubDigits(document.body);
    }catch(e){
      if (grid) grid.innerHTML = empty('list.error');
    }
  }

  /* ---- hero ledger: real rate, real arithmetic, honest gaps ---- */
  function paintLedger(){
    const fx = Y.fx;
    const g = $('#lxGoods'), p = $('#lxPkr'), t = $('#lxTotal');
    if (!g) return;
    const unitCny = 12.5, qty = 1000, goods = unitCny * qty;
    g.textContent = `¥ ${Y.n2(goods)}`;
    p.textContent = fx ? Y.pkr(goods * fx.rate) : '—';
    t.textContent = Y.t('led.once');
  }

  /* 3D tilt on the signature object */
  const led = $('#ledger');
  if (led && matchMedia('(hover:hover)').matches && !matchMedia('(prefers-reduced-motion:reduce)').matches){
    const stage = led.parentElement;
    stage.addEventListener('mousemove', e => {
      const r = led.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width - .5, y = (e.clientY - r.top) / r.height - .5;
      led.style.transform = `rotateY(${x * 8}deg) rotateX(${-y * 8}deg)`;
    });
    stage.addEventListener('mouseleave', () => {
      led.style.transition = 'transform .7s var(--e-out)';
      led.style.transform = '';
      setTimeout(() => { led.style.transition = 'transform .2s ease-out'; }, 700);
    });
  }

  document.addEventListener('yuan:fx', paintLedger);
  document.addEventListener('yuan:lang', () => {
    paintLedger();
    if (CACHE) load();
  });

  // Only the home page auto-loads. Other pages (listings, product) drive
  // their own fetching but reuse the card renderer exported above.
  window.YuanHomeLoad = load;
  if ($('#hero')) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', load);
    else load();
  }
})();
