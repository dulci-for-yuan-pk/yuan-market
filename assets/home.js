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
    // returns { min, max } in YUAN, or null. Supplier listings are usually
    // published as a RANGE (a 0.01-0.04 spread is 4x) so showing only the
    // floor would understate what a buyer actually pays.
    if (l.tier === 'verified' && l.cny_unit_price != null){
      const v = Number(l.cny_unit_price);
      return { min: v, max: v };
    }
    const fx = Y.fx;
    if (!fx || !fx.to_cny) return null;
    const k = fx.to_cny[l.listed_currency];
    if (!(k > 0)) return null;
    const lo = l.listed_price_min != null ? Number(l.listed_price_min) * k : null;
    const hi = l.listed_price_max != null ? Number(l.listed_price_max) * k : lo;
    if (lo == null) return null;
    return { min: lo, max: (hi != null && hi > lo) ? hi : lo };
  }
  window.YuanPriceOf = yuanOf;

  function priceBlock(l){
    const verified = l.tier === 'verified';
    const r = yuanOf(l);
    const fx = Y.fx;
    const label = verified ? Y.t('p.china') : Y.t('tier.listedprice');

    let main;
    if (!r){
      main = `<div class="p-val">—</div>`;
    } else {
      const ranged = r.max > r.min;
      const cnyTxt = ranged ? `${Y.n2(r.min)}–${Y.n2(r.max)}` : Y.n2(r.min);
      const pkrTxt = (fx && fx.rate)
        ? (ranged ? `${Y.n0(r.min * fx.rate)}–${Y.n0(r.max * fx.rate)} PKR`
                  : Y.pkr(r.min * fx.rate))
        : '—';
      main = `<div class="p-val num">${SYM.CNY} ${cnyTxt}<small>/ ${esc(unitLabel(l.unit))}</small></div>
              <div class="num" style="font-size:13px;font-weight:650;color:var(--fg-2);margin-top:3px">${pkrTxt}</div>`;
    }

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
      ${quickView(l)}
    </article>`;
  }
  window.YuanCard = card;

  /* ---- hover quick-view -------------------------------------------
     Price, MOQ and a direct add-to-basket without leaving the grid.
     Quantity defaults to the MOQ, because that is what a wholesale
     buyer will actually order. */
  function quickView(l){
    const r = yuanOf(l);
    const fx = Y.fx;
    const pkr = (r && fx && fx.rate) ? Y.n0(r.min * fx.rate) : null;
    const startQty = l.moq && l.moq > 0 ? l.moq : 1;
    return `<div class="qv">
      <div class="qv-row">
        <div class="qv-price">${r ? `¥ ${Y.n2(r.min)}` : '—'}
          <small>${pkr ? pkr + ' PKR' : ''}</small></div>
        <div class="qv-moq">${esc(Y.t('p.moq'))}<b class="num">${Y.n0(l.moq)}</b></div>
      </div>
      <!-- Landed cost, filled in from the real engine. Shown to everyone,
           signed in or not — a shopkeeper has to be able to do his own sums
           before he trusts us with an account. -->
      <div class="qv-landed" data-qv-landed="${esc(l.slug)}" data-qv-moq="${startQty}">
        <span class="k">${esc(Y.t('p.landed'))} ${esc(Y.t('p.unit.' + (l.unit || 'piece')) || l.unit || '')}</span>
        <span class="v num ltr dim">…</span>
      </div>
      <div class="qv-acts">
        <input class="qv-qty" type="number" min="1" value="${startQty}" data-qv-qty
               aria-label="${esc(Y.t('p.qty'))}">
        <button class="btn btn-gold" data-qv-add="${esc(l.slug)}">${esc(Y.t('qv.add'))}</button>
      </div>
    </div>`;
  }

  /* One quote per slug+quantity, remembered, so hovering across a grid of
     cards does not fire the same calculation again and again. */
  const QCACHE = new Map();
  async function landedPerUnit(slug, qty) {
    const key = slug + '@' + qty;
    if (QCACHE.has(key)) return QCACHE.get(key);
    const p = Y.api('/api/quote?slug=' + encodeURIComponent(slug) + '&qty=' + encodeURIComponent(qty))
      .then(d => ({ per_unit: d.per_unit_pkr, total: d.total_pkr,
                    estimated: !!((d.completeness || {}).estimated || (d.completeness || {}).pending_input) }))
      .catch(() => null);
    QCACHE.set(key, p);
    return p;
  }

  async function fillLanded(el) {
    if (!el || el.dataset.done) return;
    el.dataset.done = '1';
    const v = el.querySelector('.v');
    const d = await landedPerUnit(el.dataset.qvLanded, el.dataset.qvMoq);
    if (!d || d.per_unit == null) { if (v) v.textContent = '—'; return; }
    if (v) {
      v.classList.remove('dim');
      v.innerHTML = `<b>${Y.n0(d.per_unit)} PKR</b>` +
        (d.estimated ? ` <span class="confirm-note">${esc(Y.t('q.estimated'))}</span>` : '');
    }
  }

  /* Fill when a card is actually revealed, not for every card on the page. */
  const landedIO = ('IntersectionObserver' in window)
    ? new IntersectionObserver(es => es.forEach(e => {
        if (e.isIntersecting) { fillLanded(e.target); landedIO.unobserve(e.target); }
      }), { rootMargin: '120px' })
    : null;

  function watchLanded(root) {
    $$('[data-qv-landed]', root || document).forEach(el => {
      if (landedIO) landedIO.observe(el); else fillLanded(el);
    });
  }
  window.YuanWatchLanded = watchLanded;

  document.addEventListener('mouseover', e => {
    const el = e.target.closest && e.target.closest('.card');
    const box = el && el.querySelector('[data-qv-landed]');
    if (box) fillLanded(box);
  }, { passive: true });

  /* add to basket straight from the grid */
  document.addEventListener('click', async e => {
    const b = e.target.closest('[data-qv-add]');
    if (!b) return;
    e.preventDefault();
    const card = b.closest('.card');
    const qtyEl = card && card.querySelector('[data-qv-qty]');
    const qty = Math.max(parseInt(qtyEl && qtyEl.value, 10) || 1, 1);
    const acts = b.parentElement;
    b.disabled = true; b.textContent = '…';
    try {
      await Y.api('/api/shop/cart/add', { method:'POST', body:{ slug:b.dataset.qvAdd, qty } });
      acts.innerHTML = `<div class="qv-done">✓ ${esc(Y.t('qv.added'))}</div>`;
      Y.bumpCart();
    } catch (err) {
      if (err.status === 401) { location.href = '/login/?next=' + encodeURIComponent(location.pathname); return; }
      b.disabled = false; b.textContent = Y.t('qv.add');
    }
  });

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
          watchLanded(grid);
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
